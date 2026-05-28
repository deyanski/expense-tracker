"use client";

import { useEffect, useMemo, useState } from "react";
import type { DirectorIdentity } from "@/lib/schemas/identity";
import type { DirectorOverviewResponse, DirectorOverviewItem } from "@/lib/schemas/director";

type DirectorOverviewPanelProps = {
  identity: DirectorIdentity;
};

type StatusFilter = "all" | "Approved" | "Rejected" | "Manual Review";

function formatMoney(value: number, currency = "USD"): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatDate(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleDateString();
}

function parseDateInput(value: string): number | null {
  if (!value) {
    return null;
  }

  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed.getTime();
}

export function DirectorOverviewPanel({ identity }: DirectorOverviewPanelProps) {
  const [data, setData] = useState<DirectorOverviewResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  useEffect(() => {
    let active = true;

    void (async () => {
      setLoading(true);
      setErrorMessage(null);

      const url = new URL("/api/director/overview", window.location.origin);
      url.searchParams.set("fullName", identity.fullName);
      url.searchParams.set("directorId", identity.directorId);

      try {
        const response = await fetch(url.toString());
        const body = (await response.json()) as DirectorOverviewResponse | { error?: string };

        if (!response.ok) {
          const message = "error" in body ? (body.error ?? "overview failed") : "overview failed";
          if (active) {
            setErrorMessage(message);
            setData(null);
          }
          return;
        }

        if (active) {
          setData(body as DirectorOverviewResponse);
        }
      } catch {
        if (active) {
          setErrorMessage("internal");
          setData(null);
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    })();

    return () => {
      active = false;
    };
  }, [identity.directorId, identity.fullName, refreshKey]);

  const categoryOptions = useMemo(() => {
    if (!data) {
      return [] as string[];
    }

    return Array.from(new Set(data.items.map((item) => item.category))).sort((a, b) =>
      a.localeCompare(b),
    );
  }, [data]);

  const filteredItems = useMemo(() => {
    const items = data?.items ?? [];
    const normalizedSearch = searchTerm.trim().toLowerCase();
    const fromTimestamp = parseDateInput(fromDate);
    const toTimestamp = parseDateInput(toDate);

    return items.filter((item) => {
      if (statusFilter !== "all" && item.status !== statusFilter) {
        return false;
      }

      if (categoryFilter !== "all" && item.category !== categoryFilter) {
        return false;
      }

      const created = new Date(item.createdAt).getTime();
      if (fromTimestamp !== null && created < fromTimestamp) {
        return false;
      }

      if (toTimestamp !== null) {
        const inclusiveEnd = toTimestamp + 24 * 60 * 60 * 1000 - 1;
        if (created > inclusiveEnd) {
          return false;
        }
      }

      if (!normalizedSearch) {
        return true;
      }

      const haystack = [
        item.employeeName ?? "",
        item.employeeId ?? "",
        item.merchant ?? "",
        item.category,
        item.statusReason,
        item.status,
      ]
        .join(" ")
        .toLowerCase();

      return haystack.includes(normalizedSearch);
    });
  }, [categoryFilter, data, fromDate, searchTerm, statusFilter, toDate]);

  const tableSummary = useMemo(() => {
    return filteredItems.reduce(
      (acc, item) => {
        acc.count += 1;
        acc.amount += item.amount;
        return acc;
      },
      { count: 0, amount: 0 },
    );
  }, [filteredItems]);

  const trendPercent = useMemo(() => {
    const summary = data?.summary;
    if (!summary) {
      return 0;
    }

    if (summary.previous30Amount === 0) {
      return summary.last30Amount === 0 ? 0 : 1;
    }

    return (summary.last30Amount - summary.previous30Amount) / summary.previous30Amount;
  }, [data]);

  const overview = data?.summary;
  const displayCurrency = data?.items[0]?.currency ?? "USD";

  return (
    <section className="card director-overview-card">
      <header className="director-overview-head">
        <div>
          <h2>Finance Overview</h2>
          <p className="lede">Live operations view for approvals, rejections, and policy friction.</p>
        </div>
        <button
          className="button secondary"
          type="button"
          onClick={() => setRefreshKey((value) => value + 1)}
          disabled={loading}
        >
          {loading ? "Refreshing..." : "Refresh"}
        </button>
      </header>

      {errorMessage ? <p className="status error">{errorMessage}</p> : null}

      <div className="director-kpi-grid">
        <article className="summary-card">
          <p>Submitted</p>
          <strong>{overview?.totalCount ?? 0}</strong>
        </article>
        <article className="summary-card">
          <p>Total Spend</p>
          <strong>{formatMoney(overview?.totalAmount ?? 0, displayCurrency)}</strong>
        </article>
        <article className="summary-card">
          <p>Approval Rate</p>
          <strong>{((overview?.approvalRate ?? 0) * 100).toFixed(1)}%</strong>
        </article>
        <article className="summary-card">
          <p>MTD Spend</p>
          <strong>{formatMoney(overview?.mtdAmount ?? 0, displayCurrency)}</strong>
        </article>
        <article className="summary-card">
          <p>QTD Spend</p>
          <strong>{formatMoney(overview?.qtdAmount ?? 0, displayCurrency)}</strong>
        </article>
        <article className="summary-card">
          <p>30d Trend</p>
          <strong className={trendPercent > 0 ? "trend-up" : trendPercent < 0 ? "trend-down" : ""}>
            {(trendPercent * 100).toFixed(1)}%
          </strong>
        </article>
      </div>

      <section className="director-filters">
        <label>
          Status
          <select
            className="input"
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}
          >
            <option value="all">All</option>
            <option value="Approved">Approved</option>
            <option value="Rejected">Rejected</option>
            <option value="Manual Review">Manual Review</option>
          </select>
        </label>

        <label>
          Category
          <select
            className="input"
            value={categoryFilter}
            onChange={(event) => setCategoryFilter(event.target.value)}
          >
            <option value="all">All</option>
            {categoryOptions.map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </select>
        </label>

        <label>
          Search
          <input
            className="input"
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder="Employee, merchant, status reason"
          />
        </label>

        <label>
          From
          <input
            className="input"
            type="date"
            value={fromDate}
            onChange={(event) => setFromDate(event.target.value)}
          />
        </label>

        <label>
          To
          <input
            className="input"
            type="date"
            value={toDate}
            onChange={(event) => setToDate(event.target.value)}
          />
        </label>

        <div className="actions">
          <button
            className="button secondary"
            type="button"
            onClick={() => {
              setStatusFilter("all");
              setCategoryFilter("all");
              setSearchTerm("");
              setFromDate("");
              setToDate("");
            }}
          >
            Reset Filters
          </button>
        </div>
      </section>

      <div className="director-table-meta">
        <p>
          Showing <strong>{tableSummary.count}</strong> rows
        </p>
        <p>
          Amount in view: <strong>{formatMoney(tableSummary.amount, displayCurrency)}</strong>
        </p>
      </div>

      {!loading && filteredItems.length === 0 ? (
        <section className="empty-state">
          <h3>No expenses in this slice</h3>
          <p>Adjust filters or date range to reveal more records for this view.</p>
        </section>
      ) : null}

      {filteredItems.length > 0 ? (
        <div className="history-table-wrap">
          <table className="history-table">
            <thead>
              <tr>
                <th>Created</th>
                <th>Employee</th>
                <th>Merchant</th>
                <th>Amount</th>
                <th>Category</th>
                <th>Status</th>
                <th>Reason</th>
              </tr>
            </thead>
            <tbody>
              {filteredItems.map((item) => (
                <DirectorTableRow key={item.id} item={item} />
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}

function DirectorTableRow({ item }: { item: DirectorOverviewItem }) {
  return (
    <tr>
      <td>{formatDate(item.createdAt)}</td>
      <td>
        <strong>{item.employeeName ?? "Unknown"}</strong>
        <div className="row-subcopy">{item.employeeId ?? "-"}</div>
      </td>
      <td>{item.merchant ?? "-"}</td>
      <td>{formatMoney(item.amount, item.currency)}</td>
      <td>{item.category}</td>
      <td>
        <span className={`status-pill ${item.status.toLowerCase().replace(" ", "-")}`}>{item.status}</span>
      </td>
      <td>
        {item.statusReason}
        {item.hasComment ? <span className="row-subcopy">with employee comment</span> : null}
      </td>
    </tr>
  );
}

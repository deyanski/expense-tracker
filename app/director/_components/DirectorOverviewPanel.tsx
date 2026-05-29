"use client";

import { useEffect, useMemo, useState } from "react";
import { CircleAlert, CircleCheck, RotateCcw, XCircle } from "lucide-react";
import type { DirectorIdentity } from "@/lib/schemas/identity";
import type {
  DirectorOverviewResponse,
  DirectorOverviewItem,
  DirectorDecisionResponse,
} from "@/lib/schemas/director";

type DirectorOverviewPanelProps = {
  identity: DirectorIdentity;
};

type StatusFilter = "all" | "Approved" | "Rejected" | "Manual Review";
type SortKey = "createdAt" | "employee" | "amount" | "category" | "status";
type SortDirection = "asc" | "desc";

const PAGE_SIZE = 12;

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

function compareItems(
  left: DirectorOverviewItem,
  right: DirectorOverviewItem,
  sortKey: SortKey,
  direction: SortDirection,
): number {
  const multiplier = direction === "asc" ? 1 : -1;

  if (sortKey === "createdAt") {
    return (new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime()) * multiplier;
  }

  if (sortKey === "amount") {
    return (left.amount - right.amount) * multiplier;
  }

  if (sortKey === "employee") {
    return ((left.employeeName ?? "").localeCompare(right.employeeName ?? "")) * multiplier;
  }

  if (sortKey === "category") {
    return left.category.localeCompare(right.category) * multiplier;
  }

  return left.status.localeCompare(right.status) * multiplier;
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
  const [sortKey, setSortKey] = useState<SortKey>("createdAt");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [page, setPage] = useState(1);
  const [decisionBusyId, setDecisionBusyId] = useState<string | null>(null);

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

  const sortedItems = useMemo(() => {
    const next = [...filteredItems];
    next.sort((left, right) => compareItems(left, right, sortKey, sortDirection));
    return next;
  }, [filteredItems, sortDirection, sortKey]);

  const totalPages = Math.max(1, Math.ceil(sortedItems.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);

  const pagedItems = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return sortedItems.slice(start, start + PAGE_SIZE);
  }, [currentPage, sortedItems]);

  const tableSummary = useMemo(() => {
    return sortedItems.reduce(
      (acc, item) => {
        acc.count += 1;
        acc.amount += item.amount;
        return acc;
      },
      { count: 0, amount: 0 },
    );
  }, [sortedItems]);

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

  async function applyDecision(expenseId: string, status: "Approved" | "Rejected" | "Manual Review") {
    setErrorMessage(null);
    setDecisionBusyId(expenseId);

    try {
      const response = await fetch("/api/director/decision", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          fullName: identity.fullName,
          directorId: identity.directorId,
          expenseId,
          status,
        }),
      });

      const body = (await response.json()) as DirectorDecisionResponse | { error?: string };

      if (!response.ok) {
        const message = "error" in body ? (body.error ?? "decision failed") : "decision failed";
        setErrorMessage(message);
        return;
      }

      const next = body as DirectorDecisionResponse;
      setData((current) => {
        if (!current) {
          return current;
        }

        return {
          ...current,
          items: current.items.map((item) =>
            item.id === next.expenseId
              ? {
                  ...item,
                  status: next.status,
                  statusReason: next.statusReason,
                }
              : item,
          ),
        };
      });
    } catch {
      setErrorMessage("internal");
    } finally {
      setDecisionBusyId(null);
    }
  }

  function toggleSort(next: SortKey) {
    if (sortKey === next) {
      setSortDirection((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }

    setSortKey(next);
    setSortDirection(next === "createdAt" ? "desc" : "asc");
  }

  const overview = data?.summary;
  const displayCurrency = data?.items[0]?.currency ?? "USD";

  return (
    <section className="card director-overview-card">
      <header className="director-overview-head">
        <div>
          <h2>Finance Overview</h2>
          <p className="lede">Real-time approvals, spend exposure, and policy friction at a glance.</p>
        </div>
        <button
          className="button secondary with-icon"
          type="button"
          onClick={() => setRefreshKey((value) => value + 1)}
          disabled={loading}
        >
          <RotateCcw className="icon-xs" aria-hidden="true" />
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
            onChange={(event) => {
              setStatusFilter(event.target.value as StatusFilter);
              setPage(1);
            }}
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
            onChange={(event) => {
              setCategoryFilter(event.target.value);
              setPage(1);
            }}
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
            onChange={(event) => {
              setSearchTerm(event.target.value);
              setPage(1);
            }}
            placeholder="Employee, merchant, status reason"
          />
        </label>

        <label>
          From
          <input
            className="input"
            type="date"
            value={fromDate}
            onChange={(event) => {
              setFromDate(event.target.value);
              setPage(1);
            }}
          />
        </label>

        <label>
          To
          <input
            className="input"
            type="date"
            value={toDate}
            onChange={(event) => {
              setToDate(event.target.value);
              setPage(1);
            }}
          />
        </label>

        <div className="actions">
          <button
            className="button secondary with-icon"
            type="button"
            onClick={() => {
              setStatusFilter("all");
              setCategoryFilter("all");
              setSearchTerm("");
              setFromDate("");
              setToDate("");
              setPage(1);
            }}
          >
            <RotateCcw className="icon-xs" aria-hidden="true" />
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

      {!loading && sortedItems.length === 0 ? (
        <section className="empty-state">
          <h3>No expenses in this slice</h3>
          <p>Adjust filters or date range to reveal more records for this view.</p>
        </section>
      ) : null}

      {sortedItems.length > 0 ? (
        <>
          <div className="history-table-wrap">
            <table className="history-table">
              <thead>
                <tr>
                  <th>
                    <button className="table-sort" type="button" onClick={() => toggleSort("createdAt")}>
                      Created {sortKey === "createdAt" ? (sortDirection === "asc" ? "↑" : "↓") : ""}
                    </button>
                  </th>
                  <th>
                    <button className="table-sort" type="button" onClick={() => toggleSort("employee")}>
                      Employee {sortKey === "employee" ? (sortDirection === "asc" ? "↑" : "↓") : ""}
                    </button>
                  </th>
                  <th>Merchant</th>
                  <th>
                    <button className="table-sort" type="button" onClick={() => toggleSort("amount")}>
                      Amount {sortKey === "amount" ? (sortDirection === "asc" ? "↑" : "↓") : ""}
                    </button>
                  </th>
                  <th>
                    <button className="table-sort" type="button" onClick={() => toggleSort("category")}>
                      Category {sortKey === "category" ? (sortDirection === "asc" ? "↑" : "↓") : ""}
                    </button>
                  </th>
                  <th>
                    <button className="table-sort" type="button" onClick={() => toggleSort("status")}>
                      Status {sortKey === "status" ? (sortDirection === "asc" ? "↑" : "↓") : ""}
                    </button>
                  </th>
                  <th>Reason</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {pagedItems.map((item) => (
                  <DirectorTableRow
                    key={item.id}
                    item={item}
                    busy={decisionBusyId === item.id}
                    onDecision={applyDecision}
                  />
                ))}
              </tbody>
            </table>
          </div>

          <div className="director-pagination">
            <button
              className="button secondary"
              type="button"
              onClick={() => setPage((current) => Math.max(1, Math.min(current, totalPages) - 1))}
              disabled={currentPage <= 1}
            >
              Previous
            </button>
            <p>
              Page <strong>{currentPage}</strong> of <strong>{totalPages}</strong>
            </p>
            <button
              className="button secondary"
              type="button"
              onClick={() => setPage((current) => Math.min(totalPages, Math.min(current, totalPages) + 1))}
              disabled={currentPage >= totalPages}
            >
              Next
            </button>
          </div>
        </>
      ) : null}
    </section>
  );
}

function DirectorTableRow({
  item,
  busy,
  onDecision,
}: {
  item: DirectorOverviewItem;
  busy: boolean;
  onDecision: (expenseId: string, status: "Approved" | "Rejected" | "Manual Review") => void;
}) {
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
      <td>
        <div className="row-actions">
          <button
            className="chip with-icon"
            type="button"
            onClick={() => onDecision(item.id, "Approved")}
            disabled={busy}
          >
            <CircleCheck className="icon-xs" aria-hidden="true" />
            Approve
          </button>
          <button
            className="chip with-icon"
            type="button"
            onClick={() => onDecision(item.id, "Rejected")}
            disabled={busy}
          >
            <XCircle className="icon-xs" aria-hidden="true" />
            Reject
          </button>
          <button
            className="chip with-icon"
            type="button"
            onClick={() => onDecision(item.id, "Manual Review")}
            disabled={busy}
          >
            <CircleAlert className="icon-xs" aria-hidden="true" />
            Review
          </button>
        </div>
      </td>
    </tr>
  );
}

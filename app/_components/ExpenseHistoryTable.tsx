import { useMemo, useState } from "react";
import type { ExpenseHistoryResponse } from "@/lib/schemas/expense";

type ExpenseHistoryTableProps = {
  history: ExpenseHistoryResponse;
  loading: boolean;
  errorMessage: string | null;
  onRefresh: () => void;
  highlightedExpenseId?: string | null;
};

type FilterKey = "all" | "Approved" | "Rejected" | "Manual Review";

function formatMoney(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(value);
}

function formatDate(value: string | null): string {
  if (!value) {
    return "-";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleDateString();
}

export function ExpenseHistoryTable({
  history,
  loading,
  errorMessage,
  onRefresh,
  highlightedExpenseId,
}: ExpenseHistoryTableProps) {
  const [activeFilter, setActiveFilter] = useState<FilterKey>("all");
  const { items, summary } = history;

  const filteredItems = useMemo(() => {
    if (activeFilter === "all") {
      return items;
    }

    return items.filter((item) => item.status === activeFilter);
  }, [activeFilter, items]);

  const filterOptions: Array<{ key: FilterKey; label: string }> = [
    { key: "all", label: "All" },
    { key: "Approved", label: "Approved" },
    { key: "Rejected", label: "Rejected" },
    { key: "Manual Review", label: "Manual Review" },
  ];

  return (
    <section className="history-wrap" aria-live="polite">
      <div className="history-header">
        <h2>Recent Expenses</h2>
        <button className="button secondary" type="button" onClick={onRefresh} disabled={loading}>
          {loading ? "Refreshing..." : "Refresh"}
        </button>
      </div>

      <div className="summary-grid">
        <article className="summary-card">
          <p>Total Submitted</p>
          <strong>{summary.totalCount}</strong>
        </article>
        <article className="summary-card">
          <p>Total Amount</p>
          <strong>{formatMoney(summary.totalAmount)}</strong>
        </article>
        <article className="summary-card">
          <p>Approved</p>
          <strong>{summary.approvedCount}</strong>
        </article>
        <article className="summary-card">
          <p>Manual Review</p>
          <strong>{summary.manualReviewCount}</strong>
        </article>
        <article className="summary-card">
          <p>Rejected</p>
          <strong>{summary.rejectedCount}</strong>
        </article>
      </div>

      <div className="chip-row" role="tablist" aria-label="History filters">
        {filterOptions.map((option) => (
          <button
            key={option.key}
            className={`chip ${activeFilter === option.key ? "active" : ""}`}
            type="button"
            role="tab"
            aria-selected={activeFilter === option.key}
            onClick={() => setActiveFilter(option.key)}
          >
            {option.label}
          </button>
        ))}
      </div>

      {errorMessage ? <p className="status error">{errorMessage}</p> : null}

      {!loading && filteredItems.length === 0 ? (
        <section className="empty-state">
          <h3>{items.length === 0 ? "No expenses yet" : "No expenses in this filter"}</h3>
          <p>
            {items.length === 0
              ? "Your submissions will appear here after policy processing writes them to the expenses table."
              : "Try another filter to inspect additional submissions."}
          </p>
        </section>
      ) : null}

      {filteredItems.length > 0 ? (
        <div className="history-table-wrap">
          <table className="history-table">
            <thead>
              <tr>
                <th>Created</th>
                <th>Merchant</th>
                <th>Amount</th>
                <th>Category</th>
                <th>Status</th>
                <th>Receipt</th>
              </tr>
            </thead>
            <tbody>
              {filteredItems.map((item) => (
                <tr
                  key={item.id}
                  className={item.id === highlightedExpenseId ? "history-row-highlight" : ""}
                >
                  <td>{formatDate(item.createdAt)}</td>
                  <td>{item.merchant ?? "-"}</td>
                  <td>{formatMoney(item.amount)}</td>
                  <td>{item.category}</td>
                  <td>
                    <span
                      className={`status-pill ${item.status
                        .toLowerCase()
                        .replace(" ", "-")}`}
                    >
                      {item.status}
                    </span>
                  </td>
                  <td>{item.hasReceipt ? "Yes" : "No"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}

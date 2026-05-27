import type { ExpenseHistoryResponse } from "@/lib/schemas/expense";

type ExpenseHistoryTableProps = {
  history: ExpenseHistoryResponse;
  loading: boolean;
  errorMessage: string | null;
  onRefresh: () => void;
};

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
}: ExpenseHistoryTableProps) {
  const { items, summary } = history;

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
      </div>

      {errorMessage ? <p className="status error">{errorMessage}</p> : null}

      {!loading && items.length === 0 ? (
        <section className="empty-state">
          <h3>No expenses yet</h3>
          <p>Your submissions will appear here after policy processing writes them to the expenses table.</p>
        </section>
      ) : null}

      {items.length > 0 ? (
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
              {items.map((item) => (
                <tr key={item.id}>
                  <td>{formatDate(item.createdAt)}</td>
                  <td>{item.merchant ?? "-"}</td>
                  <td>{formatMoney(item.amount)}</td>
                  <td>{item.category}</td>
                  <td>{item.status}</td>
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

import Link from "next/link";
import { EmployeePortal } from "@/app/_components/EmployeePortal";

export default function HomePage() {
  return (
    <main className="page">
      <section className="home-shell">
        <header className="top-nav">
          <p className="top-nav-title">Expense Tracker</p>
          <Link className="top-nav-link" href="/director">
            Director Console
          </Link>
        </header>
        <EmployeePortal />
      </section>
    </main>
  );
}

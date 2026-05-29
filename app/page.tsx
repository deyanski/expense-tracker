import Link from "next/link";
import { BriefcaseBusiness } from "lucide-react";
import { EmployeePortal } from "@/app/_components/EmployeePortal";

export default function HomePage() {
  return (
    <main className="page">
      <section className="home-shell">
        <header className="top-nav">
          <p className="top-nav-title">Expense Tracker Workspace</p>
          <Link className="top-nav-link" href="/director">
            <BriefcaseBusiness className="icon-xs" aria-hidden="true" />
            Director Console
          </Link>
        </header>
        <EmployeePortal />
      </section>
    </main>
  );
}

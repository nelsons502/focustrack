import "./plan.css";
import Link from "next/link";

type PrimaryNavProps = {
  current: "find" | "plan";
};

export default function PrimaryNav({ current }: PrimaryNavProps) {
  return (
    <nav aria-label="Primary" className="primary-nav">
      <Link
        href="/"
        className={current === "find" ? "nav-link nav-link-current" : "nav-link"}
        aria-current={current === "find" ? "page" : undefined}
      >
        Find
      </Link>
      <Link
        href="/plan"
        className={current === "plan" ? "nav-link nav-link-current" : "nav-link"}
        aria-current={current === "plan" ? "page" : undefined}
      >
        Plan
      </Link>
    </nav>
  );
}

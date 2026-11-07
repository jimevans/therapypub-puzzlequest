import { NavLink, Outlet } from "react-router";
import { PageShell } from "../../ui/PageShell";
import styles from "./Admin.module.css";

const SECTIONS = [
  { id: "quests", label: "Quests" },
  { id: "puzzles", label: "Puzzles" },
  { id: "users", label: "Users" },
  { id: "teams", label: "Teams" },
];

/** The frame of administrators' lists: a wider page, with a way between them. */
export function AdminLayout() {
  return (
    <PageShell wide>
      <nav className={styles.sections} aria-label="Administration">
        {SECTIONS.map(({ id, label }) => (
          <NavLink key={id} id={id} to={`/${id}`}>
            {label}
          </NavLink>
        ))}
      </nav>
      <Outlet />
    </PageShell>
  );
}

import type { ReactNode } from "react";
import { NavLink, Outlet } from "react-router";
import { PageShell } from "../../ui/PageShell";
import styles from "./Admin.module.css";

const SECTIONS = [
  { id: "quests", label: "Quests" },
  { id: "puzzles", label: "Puzzles" },
  { id: "users", label: "Users" },
  { id: "teams", label: "Teams" },
];

/**
 * The frame of administrators' screens: a wider page, with a way between the
 * lists.
 */
export function AdminFrame({ children }: { children: ReactNode }) {
  return (
    <PageShell wide>
      <nav className={styles.sections} aria-label="Administration">
        {SECTIONS.map(({ id, label }) => (
          <NavLink key={id} id={id} to={`/${id}`}>
            {label}
          </NavLink>
        ))}
      </nav>
      {children}
    </PageShell>
  );
}

/** The administrators' screens' route, showing each in the frame. */
export function AdminLayout() {
  return (
    <AdminFrame>
      <Outlet />
    </AdminFrame>
  );
}

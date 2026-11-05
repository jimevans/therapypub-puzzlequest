import type { ReactNode } from "react";
import styles from "./Banner.module.css";

interface BannerProps {
  /** A problem is announced to screen readers at once; a notice, politely. */
  tone?: "notice" | "danger";
  children: ReactNode;
}

/** A message across the page. */
export function Banner({ tone = "notice", children }: BannerProps) {
  return (
    <div
      className={`${styles.banner} ${styles[tone]}`}
      role={tone === "danger" ? "alert" : "status"}
    >
      {children}
    </div>
  );
}

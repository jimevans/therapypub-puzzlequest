import { Link, type LinkProps } from "react-router";
import styles from "./LinkButton.module.css";

interface LinkButtonProps extends Omit<LinkProps, "className" | "style"> {
  /** The page's main action is primary; there should be one at most. */
  variant?: "primary" | "secondary";
}

/** A link that looks like a button, for going somewhere rather than acting. */
export function LinkButton({
  variant = "secondary",
  ...props
}: LinkButtonProps) {
  return <Link {...props} className={`${styles.link} ${styles[variant]}`} />;
}

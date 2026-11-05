import {
  Button as AriaButton,
  type ButtonProps as AriaButtonProps,
} from "react-aria-components";
import styles from "./Button.module.css";

interface ButtonProps extends Omit<AriaButtonProps, "className" | "style"> {
  /** The page's main action is primary; there should be one at most. */
  variant?: "primary" | "secondary";
}

/** A button, large enough to press on a phone. */
export function Button({ variant = "secondary", ...props }: ButtonProps) {
  return (
    <AriaButton {...props} className={`${styles.button} ${styles[variant]}`} />
  );
}

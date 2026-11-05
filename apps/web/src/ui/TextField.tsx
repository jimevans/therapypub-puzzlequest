import {
  TextField as AriaTextField,
  type TextFieldProps as AriaTextFieldProps,
  FieldError,
  Input,
  Label,
  Text,
} from "react-aria-components";
import styles from "./TextField.module.css";

interface TextFieldProps extends Omit<
  AriaTextFieldProps,
  "className" | "style" | "children"
> {
  label: string;
  description?: string;
  /** What's wrong with the value; the field shows as invalid while it's set. */
  errorMessage?: string;
}

/** A labelled field for typing text, connected to its description and error. */
export function TextField({
  label,
  description,
  errorMessage,
  ...props
}: TextFieldProps) {
  return (
    <AriaTextField
      {...props}
      className={styles.field}
      isInvalid={errorMessage !== undefined || props.isInvalid}
    >
      <Label className={styles.label}>{label}</Label>
      <Input className={styles.input} />
      {description && (
        <Text slot="description" className={styles.description}>
          {description}
        </Text>
      )}
      <FieldError className={styles.error}>{errorMessage}</FieldError>
    </AriaTextField>
  );
}

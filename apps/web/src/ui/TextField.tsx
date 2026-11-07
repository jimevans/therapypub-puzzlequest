import type { Ref } from "react";
import {
  TextField as AriaTextField,
  type TextFieldProps as AriaTextFieldProps,
  FieldError,
  Input,
  type InputProps,
  Label,
  Text,
  TextArea,
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
  /** Reaches the input itself, so a form can move focus to it. */
  inputRef?: Ref<HTMLInputElement | HTMLTextAreaElement>;
  /** Several lines of text, in a box this many lines tall. */
  rows?: number;
  /** Hints to the phone's keyboard, such as not capitalizing a user name. */
  inputProps?: Pick<
    InputProps,
    "autoCapitalize" | "autoCorrect" | "spellCheck" | "inputMode"
  >;
}

/** A labelled field for typing text, connected to its description and error. */
export function TextField({
  label,
  description,
  errorMessage,
  inputRef,
  inputProps,
  rows,
  ...props
}: TextFieldProps) {
  return (
    <AriaTextField
      {...props}
      className={styles.field}
      isInvalid={errorMessage !== undefined || props.isInvalid}
    >
      <Label className={styles.label}>{label}</Label>
      {rows === undefined ? (
        <Input
          {...inputProps}
          ref={inputRef as Ref<HTMLInputElement>}
          className={styles.input}
        />
      ) : (
        <TextArea
          {...inputProps}
          ref={inputRef as Ref<HTMLTextAreaElement>}
          rows={rows}
          className={`${styles.input} ${styles.multiline}`}
        />
      )}
      {description && (
        <Text slot="description" className={styles.description}>
          {description}
        </Text>
      )}
      <FieldError className={styles.error}>{errorMessage}</FieldError>
    </AriaTextField>
  );
}

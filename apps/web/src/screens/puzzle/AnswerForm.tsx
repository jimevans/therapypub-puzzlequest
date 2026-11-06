import { type FormEvent, type ReactNode, useState } from "react";
import { Button } from "../../ui/Button";
import { TextField } from "../../ui/TextField";
import styles from "./PuzzleScreen.module.css";

interface AnswerFormProps {
  fieldId: string;
  buttonId: string;
  label: string;
  buttonLabel: string;
  /** What to say if the player submits nothing. */
  emptyMessage: string;
  isDisabled: boolean;
  isPending: boolean;
  onSubmit: (value: string) => void;
  /** Anything else to offer alongside the button. */
  children?: ReactNode;
}

/** One line of text to send: an activation code, or a guess at the solution. */
export function AnswerForm({
  fieldId,
  buttonId,
  label,
  buttonLabel,
  emptyMessage,
  isDisabled,
  isPending,
  onSubmit,
  children,
}: AnswerFormProps) {
  const [value, setValue] = useState("");
  const [isEmpty, setIsEmpty] = useState(false);

  function submit(event: FormEvent) {
    event.preventDefault();
    const trimmed = value.trim();
    setIsEmpty(!trimmed);
    if (trimmed && !isPending) {
      onSubmit(trimmed);
    }
  }

  return (
    <form className={styles.form} noValidate onSubmit={submit}>
      <TextField
        id={fieldId}
        label={label}
        value={value}
        onChange={(next) => {
          setValue(next);
          setIsEmpty(false);
        }}
        isDisabled={isDisabled}
        autoComplete="off"
        inputProps={{
          autoCapitalize: "none",
          autoCorrect: "off",
          spellCheck: false,
        }}
        errorMessage={isEmpty ? emptyMessage : undefined}
      />
      <Button
        id={buttonId}
        type="submit"
        variant="primary"
        isDisabled={isDisabled || isPending}
      >
        {buttonLabel}
      </Button>
      {children}
    </form>
  );
}

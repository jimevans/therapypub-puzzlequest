import {
  type Control,
  type UseFormRegister,
  useFieldArray,
} from "react-hook-form";
import { Button } from "../../../ui/Button";
import { FormTextField } from "../../../ui/FormTextField";
import { SortableList } from "../../../ui/SortableList";
import styles from "./Puzzle.module.css";
import { NEW_HINT, type PuzzleFormValues } from "./puzzleForm";

interface HintRowsProps {
  control: Control<PuzzleFormValues>;
  register: UseFormRegister<PuzzleFormValues>;
}

/** A puzzle's hints, in the order players reveal them, each editable at once. */
export function HintRows({ control, register }: HintRowsProps) {
  const { fields, append, remove, move } = useFieldArray({
    control,
    name: "hints",
  });

  return (
    <fieldset id="hints" className={styles.hints}>
      <legend>Hints</legend>
      <p className={styles.note}>
        Players reveal them in this order. Each adds its penalty to their time.
      </p>
      {fields.length === 0 ? (
        <p>No hints yet.</p>
      ) : (
        <SortableList
          items={fields}
          // useFieldArray gives each row an ID that stays with it as rows move,
          // which React needs as the key to keep each row's inputs with it.
          getId={(field) => field.id}
          label={(field) => `hint ${fields.indexOf(field) + 1}`}
          onMove={move}
          className={styles.hintList}
          renderItem={(field, index, handle) => {
            const number = index + 1;
            return (
              <div className={styles.hint} data-hint={number}>
                <FormTextField
                  control={control}
                  name={`hints.${index}.text`}
                  rules={{ required: "Enter the hint" }}
                  id={`hint-${number}-text`}
                  label={`Hint ${number}`}
                  rows={2}
                />
                <div className={styles.hintSettings}>
                  <FormTextField
                    control={control}
                    name={`hints.${index}.timePenalty`}
                    rules={{
                      required: "Enter a penalty, or 0",
                      pattern: {
                        value: /^\d+$/,
                        message: "Enter whole seconds",
                      },
                    }}
                    id={`hint-${number}-penalty`}
                    label="Penalty (seconds)"
                    inputProps={{ inputMode: "numeric" }}
                  />
                  <div className={styles.checkbox}>
                    <input
                      id={`hint-${number}-warning`}
                      type="checkbox"
                      {...register(`hints.${index}.solutionWarning`)}
                    />
                    <label htmlFor={`hint-${number}-warning`}>
                      Gives the solution away
                    </label>
                  </div>
                </div>
                <div className={styles.hintActions}>
                  {handle}
                  <Button
                    aria-label={`Move hint ${number} up`}
                    isDisabled={index === 0}
                    onPress={() => move(index, index - 1)}
                  >
                    Up
                  </Button>
                  <Button
                    aria-label={`Move hint ${number} down`}
                    isDisabled={index === fields.length - 1}
                    onPress={() => move(index, index + 1)}
                  >
                    Down
                  </Button>
                  <Button
                    aria-label={`Remove hint ${number}`}
                    onPress={() => remove(index)}
                  >
                    Remove
                  </Button>
                </div>
              </div>
            );
          }}
        />
      )}
      <Button id="add-hint" onPress={() => append({ ...NEW_HINT })}>
        Add hint
      </Button>
    </fieldset>
  );
}

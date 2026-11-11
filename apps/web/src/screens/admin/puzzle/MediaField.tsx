import type { Schemas } from "@puzzlequest/api-client";
import { useEffect, useRef, useState } from "react";
import { type Control, useController } from "react-hook-form";
import { PuzzleContent } from "../../../quests/PuzzleContent";
import { puzzleTypeLabel } from "../puzzleTypes";
import styles from "./Puzzle.module.css";
import {
  MAXIMUM_MEDIA_BYTES,
  MEDIA_ACCEPT,
  type PuzzleFormValues,
} from "./puzzleForm";

interface MediaFieldProps {
  control: Control<PuzzleFormValues>;
  type: Schemas["PuzzleType"];
  displayName: string;
  /** The file the puzzle already has, if it can keep it. */
  keptPath: string | undefined;
}

/** Choosing an image, recording, or film, and seeing or playing it. */
export function MediaField({
  control,
  type,
  displayName,
  keptPath,
}: MediaFieldProps) {
  const {
    field: { onChange, value: file },
    fieldState: { error },
  } = useController({
    control,
    name: "file",
    rules: {
      validate: (chosen) =>
        chosen
          ? chosen.size <= MAXIMUM_MEDIA_BYTES ||
            "Choose a file of 100 MB or less"
          : keptPath !== undefined || "Choose a file",
    },
  });
  // The chosen file's preview, which lasts until it's replaced or the editor
  // closes. It's made when the file is chosen, an event, rather than in an
  // effect; an effect would run twice in development, revoking it too soon.
  const [preview, setPreview] = useState<{ file: File; url: string }>();
  const previewUrl = useRef<string>(undefined);
  useEffect(
    () => () => {
      if (previewUrl.current) {
        URL.revokeObjectURL(previewUrl.current);
      }
    },
    []
  );

  const kind = puzzleTypeLabel(type).toLowerCase();
  const shown =
    file && preview?.file === file ? preview.url : file ? undefined : keptPath;

  return (
    <div className={styles.field}>
      <label htmlFor="puzzle-file">
        {keptPath ? `Replace the ${kind}` : `Choose the ${kind}`}
      </label>
      <input
        id="puzzle-file"
        type="file"
        accept={MEDIA_ACCEPT[type]}
        aria-invalid={error !== undefined}
        aria-describedby={error ? "puzzle-file-error" : undefined}
        onChange={(event) => {
          const chosen = event.target.files?.[0] ?? null;
          if (previewUrl.current) {
            URL.revokeObjectURL(previewUrl.current);
          }
          previewUrl.current = chosen ? URL.createObjectURL(chosen) : undefined;
          setPreview(
            chosen && previewUrl.current
              ? { file: chosen, url: previewUrl.current }
              : undefined
          );
          onChange(chosen);
        }}
      />
      {error && (
        <p id="puzzle-file-error" className={styles.error}>
          {error.message}
        </p>
      )}
      {shown ? (
        <PuzzleContent displayName={displayName} type={type} text={shown} />
      ) : (
        <p className={styles.note}>No {kind} yet.</p>
      )}
    </div>
  );
}

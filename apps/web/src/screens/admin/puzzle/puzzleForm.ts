import type { Schemas } from "@puzzlequest/api-client";
import { queryOptions } from "@tanstack/react-query";
import { api, dataOrThrow } from "../../../api";
import { PuzzleType } from "../../../quests/PuzzleContent";

export type Puzzle = Schemas["Puzzle"];

/** Every puzzle's data starts with this, so refreshing the list refreshes it. */
export const PUZZLES_KEY = ["puzzles"];

/** A puzzle, with its solution, for authoring. */
export const puzzleDefinitionQuery = (name: string) =>
  queryOptions({
    queryKey: [...PUZZLES_KEY, name],
    queryFn: async () =>
      dataOrThrow(
        await api.GET("/puzzles/{name}", { params: { path: { name } } })
      ),
  });

/** The largest media file the server accepts, as it says in upload.ts. */
export const MAXIMUM_MEDIA_BYTES = 100 * 1024 * 1024;

/** The files each kind of media puzzle offers to choose. */
export const MEDIA_ACCEPT: Record<number, string> = {
  [PuzzleType.Image]: "image/*",
  [PuzzleType.Audio]: "audio/*",
  [PuzzleType.Video]: "video/*",
};

export interface HintValues {
  text: string;
  solutionWarning: boolean;
  /** Seconds, as typed. */
  timePenalty: string;
}

/** What the puzzle editor asks. */
export interface PuzzleFormValues {
  /**
   * The puzzle's name, which is in its address. Not "name": a form's elements
   * become properties of the form, and one called name would hide form.name.
   */
  puzzleName: string;
  displayName: string;
  type: number;
  /** A text puzzle's Markdown. */
  text: string;
  /** A media puzzle's new file, if one has been chosen. */
  file: File | null;
  solutionKeyword: string;
  solutionDisplayText: string;
  hints: HintValues[];
}

/** A new hint row's values. */
export const NEW_HINT: HintValues = {
  text: "",
  solutionWarning: false,
  timePenalty: "0",
};

/**
 * The editor's starting values.
 * @param puzzle the puzzle to edit, or undefined for a new one
 * @returns the form's values
 */
export function formValuesOf(puzzle?: Puzzle): PuzzleFormValues {
  return {
    puzzleName: puzzle?.name ?? "",
    displayName: puzzle?.displayName ?? "",
    type: puzzle?.type ?? PuzzleType.Text,
    text: puzzle?.type === PuzzleType.Text ? puzzle.text : "",
    file: null,
    solutionKeyword: puzzle?.solutionKeyword ?? "",
    solutionDisplayText: puzzle?.solutionDisplayText ?? "",
    hints:
      puzzle?.hints.map((hint) => ({
        ...hint,
        timePenalty: `${hint.timePenalty}`,
      })) ?? [],
  };
}

/**
 * The media file a puzzle already has that the editor can keep: only one of
 * the kind chosen, since a picture can't play as a recording.
 * @param puzzle the puzzle as stored, if it exists
 * @param type the kind chosen in the editor
 * @returns the file's path, or undefined if there's none to keep
 */
export function keptMediaPath(
  puzzle: Puzzle | undefined,
  type: number
): string | undefined {
  return puzzle &&
    type !== PuzzleType.Text &&
    puzzle.type === type &&
    puzzle.text !== ""
    ? puzzle.text
    : undefined;
}

/**
 * Says where a form field is, from where the API said a problem was.
 * @param field the request body's field, such as name or hints.0.text
 * @returns the form's field
 */
export function formFieldOf(field: string): string {
  return field === "name" ? "puzzleName" : field;
}

/**
 * Uploads a media puzzle's file, which the server names after the puzzle.
 * @param puzzleName the puzzle it's for
 * @param file the file
 * @returns the file's path on the site
 */
async function uploadMedia(puzzleName: string, file: File): Promise<string> {
  const dot = file.name.lastIndexOf(".");
  const body = new FormData();
  // The server checks these before it reads the file, so they come first.
  body.append("puzzleName", puzzleName);
  body.append("fileExtension", dot === -1 ? "" : file.name.slice(dot + 1));
  body.append("binary", file);
  const { path } = dataOrThrow(
    // The client sends FormData as it is. Its type describes the fields as
    // JSON, which a file can't be.
    await api.POST("/puzzle-media", { body: body as never })
  );
  return path;
}

/** Saving got as far as the puzzle, but its new file couldn't be uploaded. */
export class UploadFailedError extends Error {
  constructor(readonly cause: Error) {
    super(cause.message);
    this.name = "UploadFailedError";
  }
}

/**
 * Saves a puzzle. A new media puzzle is created before its file is uploaded,
 * because the server names the file after the puzzle: uploading first would
 * replace another puzzle's file if the name were already taken.
 * @param values what the editor holds
 * @param existing the puzzle as stored, when editing one
 * @throws {UploadFailedError} if the puzzle was saved without its new file
 */
export async function savePuzzle(
  values: PuzzleFormValues,
  existing: Puzzle | undefined
): Promise<void> {
  const name = existing?.name ?? values.puzzleName.trim();
  const isText = values.type === PuzzleType.Text;
  const fields = {
    displayName: values.displayName,
    type: values.type,
    solutionKeyword: values.solutionKeyword,
    solutionDisplayText: values.solutionDisplayText,
    hints: values.hints.map((hint) => ({
      ...hint,
      timePenalty: Number(hint.timePenalty),
    })),
  };
  // A media puzzle keeps its file unless there's a new one.
  const text = isText ? values.text : keptMediaPath(existing, values.type);

  if (existing) {
    dataOrThrow(
      await api.PATCH("/puzzles/{name}", {
        params: { path: { name } },
        body: text === undefined ? fields : { ...fields, text },
      })
    );
  } else {
    dataOrThrow(
      await api.POST("/puzzles", {
        body: { ...fields, name, text: text ?? "" },
      })
    );
  }

  if (!isText && values.file) {
    try {
      const path = await uploadMedia(name, values.file);
      dataOrThrow(
        await api.PATCH("/puzzles/{name}", {
          params: { path: { name } },
          body: { text: path },
        })
      );
    } catch (error) {
      throw new UploadFailedError(error as Error);
    }
  }
}

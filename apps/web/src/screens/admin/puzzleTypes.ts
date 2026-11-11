import type { Schemas } from "@puzzlequest/api-client";
import { PuzzleType } from "../../quests/PuzzleContent";

/** The kinds of puzzle an author can choose, in the order to offer them. */
export const PUZZLE_TYPES: { value: Schemas["PuzzleType"]; label: string }[] = [
  { value: PuzzleType.Text, label: "Text" },
  { value: PuzzleType.Image, label: "Image" },
  { value: PuzzleType.Audio, label: "Audio" },
  { value: PuzzleType.Video, label: "Video" },
];

/**
 * Names a kind of puzzle.
 * @param type the API's name for it
 * @returns its name in words, such as "Image"
 */
export function puzzleTypeLabel(type: Schemas["PuzzleType"]): string {
  return PUZZLE_TYPES.find(({ value }) => value === type)?.label ?? `${type}`;
}

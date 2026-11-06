import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ApiError } from "../../api";
import { questQueryKey } from "../../live/useLiveQuest";

/** What identifies the puzzle in the API's paths. */
export interface PuzzlePath {
  name: string;
  puzzleName: string;
}

/**
 * Says why one of the player's actions failed.
 * @param error what went wrong
 * @returns the text to show
 */
export function refusalOf(error: Error): string {
  return error instanceof ApiError
    ? error.message
    : "Couldn't reach the server. Check your connection and try again.";
}

/**
 * Sends one of the player's actions. However it turns out, the puzzle is fetched
 * again, since a refusal often means it has changed: a teammate solved it, say,
 * or the quest was paused. The action counts as pending until that's back, so
 * the old state can't be acted on in the meantime.
 */
export function usePuzzleAction<Input>(
  { name }: PuzzlePath,
  send: (input: Input) => Promise<unknown>
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: send,
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: questQueryKey(name) }),
  });
}

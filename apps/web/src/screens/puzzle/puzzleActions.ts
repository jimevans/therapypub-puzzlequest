import { useMutation, useQueryClient } from "@tanstack/react-query";
import { questQueryKey } from "../../live/useLiveQuest";

/** What identifies the puzzle in the API's paths. */
export interface PuzzlePath {
  questName: string;
  puzzleName: string;
}

/**
 * Sends one of the player's actions. However it turns out, the puzzle is fetched
 * again, since a refusal often means it has changed: a teammate solved it, say,
 * or the quest was paused. The action counts as pending until that's back, so
 * the old state can't be acted on in the meantime.
 */
export function usePuzzleAction<Input>(
  { questName }: PuzzlePath,
  send: (input: Input) => Promise<unknown>
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: send,
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: questQueryKey(questName) }),
  });
}

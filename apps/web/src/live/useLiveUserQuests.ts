import { followUserQuests } from "@puzzlequest/api-client";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { api, dataOrThrow } from "../api";
import { liveUpdatesAddress } from "./useLiveQuest";

/**
 * The query key of the list of quests a user plays, which live updates mark
 * as out of date.
 * @param userName the user
 * @returns the key
 */
export function userQuestsQueryKey(
  userName: string
): readonly [string, string, string] {
  return ["users", userName, "quests"];
}

/**
 * Keeps a user's list of quests up to date while a screen shows it, so a quest
 * appears the moment a phone call or the puzzle master starts it.
 * @param userName the user, or undefined to follow nothing
 */
export function useLiveUserQuests(userName: string | undefined): void {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!userName) {
      return;
    }
    const follower = followUserQuests({
      url: liveUpdatesAddress(),
      userName,
      getTicket: async () =>
        dataOrThrow(
          await api.POST("/users/{userName}/live-tickets", {
            params: { path: { userName } },
          })
        ).ticket,
      onChange: () => {
        void queryClient.invalidateQueries({
          queryKey: userQuestsQueryKey(userName),
        });
      },
    });
    return follower.stop;
  }, [userName, queryClient]);
}

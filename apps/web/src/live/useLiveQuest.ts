import { type QuestFollower, followQuest } from "@puzzlequest/api-client";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import { api, dataOrThrow } from "../api";
import { shareLinkRequest } from "../quests/shareLink";

/**
 * The start of the query key of everything fetched about a quest, which live
 * updates mark as out of date. A screen's queries must start with this.
 * @param questName the quest's name
 * @returns the key
 */
export function questQueryKey(questName: string): readonly [string, string] {
  return ["quests", questName];
}

/**
 * Gets the live-update websocket's address, on this site.
 * @returns the address
 */
export function liveUpdatesAddress(): string {
  const protocol = location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${location.host}/api/v1/updates`;
}

/**
 * Keeps a quest's data up to date while a screen shows it: whenever it may have
 * changed, what's been fetched about the quest is fetched again.
 * @param questName the quest's name
 * @returns whether it's connected, and the connection's ID to send with the
 *  screen's own actions
 */
export function useLiveQuest(questName: string) {
  const queryClient = useQueryClient();
  const [connected, setConnected] = useState(false);
  const follower = useRef<QuestFollower | null>(null);

  useEffect(() => {
    const current = followQuest({
      url: liveUpdatesAddress(),
      questName,
      getTicket: async () =>
        dataOrThrow(
          await api.POST("/quests/{name}/live-tickets", {
            params: { path: { name: questName } },
            ...shareLinkRequest(questName),
          })
        ).ticket,
      onChange: () => {
        void queryClient.invalidateQueries({
          queryKey: questQueryKey(questName),
        });
      },
      onConnectionChange: setConnected,
    });
    follower.current = current;
    return () => {
      current.stop();
      follower.current = null;
      setConnected(false);
    };
  }, [questName, queryClient]);

  const connectionId = useCallback(() => follower.current?.connectionId(), []);
  return { connected, connectionId };
}

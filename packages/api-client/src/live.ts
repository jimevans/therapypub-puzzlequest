// Following live updates over the websocket: of a quest, or of the list of
// quests a user plays. A browser can lose the connection without being told (a
// locked phone, a dead zone, airplane mode), and updates sent while
// disconnected are gone, so this reconnects by itself and calls onChange
// whenever what's followed should be fetched again: on every connection, on
// every update, when the page comes back into view, and every 30 seconds while
// it's in view.
import type { components } from "./schema.js";

type LiveUpdate = components["schemas"]["LiveUpdate"];
type LiveUpdateSubscription = components["schemas"]["LiveUpdateSubscription"];

/** How often to refresh while in view, since a socket can die silently. */
export const REFRESH_INTERVAL_MS = 30000;

/** The longest wait between attempts to reconnect. */
export const MAX_RETRY_DELAY_MS = 15000;

/** What following anything takes. */
interface FollowOptions {
  /** The socket's address, such as wss://example.com/api/v1/updates. */
  url: string;
  /** Gets a new ticket, for each connection. */
  getTicket: () => Promise<string>;
  /** What's followed may have changed, and should be fetched again. */
  onChange: () => void;
  /** The connection was made or lost. */
  onConnectionChange?: (connected: boolean) => void;
}

export interface FollowQuestOptions extends FollowOptions {
  questName: string;
  /** Gets a new ticket from POST /quests/{questName}/live-tickets. */
  getTicket: () => Promise<string>;
}

export interface FollowUserQuestsOptions extends FollowOptions {
  userName: string;
  /** Gets a new ticket from POST /users/{userName}/live-tickets. */
  getTicket: () => Promise<string>;
}

export interface QuestFollower {
  /**
   * The connection's ID, to send as connectionId with the client's own actions
   * so that their updates aren't sent back to it; undefined while disconnected.
   */
  connectionId: () => string | undefined;
  stop: () => void;
}

/**
 * Starts following a quest.
 * @param options the quest, and what to call when something happens
 * @returns a way to get the connection's ID, and to stop following
 */
export function followQuest(options: FollowQuestOptions): QuestFollower {
  return follow({ questName: options.questName }, options);
}

/**
 * Starts following the list of quests a user plays: onChange is called when
 * the list should be fetched again, as when one of the quests starts.
 * @param options the user, and what to call when something happens
 * @returns a way to stop following
 */
export function followUserQuests(options: FollowUserQuestsOptions): {
  stop: () => void;
} {
  const { stop } = follow({ userName: options.userName }, options);
  return { stop };
}

/**
 * Starts following what a subscription names.
 * @param channel the quest, or the user, to subscribe to
 * @param options what to call when something happens
 * @returns a way to get the connection's ID, and to stop following
 */
function follow(
  channel: { questName: string } | { userName: string },
  options: FollowOptions
): QuestFollower {
  const { url, getTicket, onChange, onConnectionChange } = options;
  let socket: WebSocket | undefined;
  let connectionId: string | undefined;
  let attempts = 0;
  let retry: ReturnType<typeof setTimeout> | undefined;

  function disconnected(): void {
    if (connectionId !== undefined) {
      connectionId = undefined;
      onConnectionChange?.(false);
    }
  }

  function connect(): void {
    clearTimeout(retry);
    const current = new WebSocket(url);
    socket = current;
    current.addEventListener("open", () => {
      getTicket().then(
        (ticket) => {
          if (socket === current && current.readyState === WebSocket.OPEN) {
            const subscription: LiveUpdateSubscription = {
              message: "subscribe",
              ...channel,
              ticket,
            };
            current.send(JSON.stringify(subscription));
          }
        },
        // Closing it brings the usual wait before trying again.
        () => {
          current.close();
        }
      );
    });
    current.addEventListener("message", (event: MessageEvent<string>) => {
      if (socket !== current) {
        return;
      }
      let update: LiveUpdate;
      try {
        update = JSON.parse(event.data) as LiveUpdate;
      } catch {
        return;
      }
      if (update.message === "connection") {
        attempts = 0;
        connectionId = update.connectionId;
        onConnectionChange?.(true);
      }
      onChange();
    });
    current.addEventListener("close", () => {
      // A socket that has been replaced or stopped has nothing left to do.
      if (socket === current) {
        socket = undefined;
        disconnected();
        retry = setTimeout(
          connect,
          Math.min(1000 * 2 ** attempts++, MAX_RETRY_DELAY_MS)
        );
      }
    });
  }

  function replaceSocket(): void {
    const old = socket;
    socket = undefined;
    old?.close();
    disconnected();
    connect();
  }

  function onVisibilityChange(): void {
    if (document.visibilityState !== "visible") {
      return;
    }
    if (socket && socket.readyState <= WebSocket.OPEN) {
      onChange();
    } else {
      attempts = 0;
      replaceSocket();
    }
  }

  // Back from airplane mode or a dead zone. The page stayed in view, and the
  // old socket may never report closing, so don't wait for it.
  function onOnline(): void {
    attempts = 0;
    replaceSocket();
  }

  const refresh = setInterval(() => {
    if (document.visibilityState === "visible") {
      onChange();
    }
  }, REFRESH_INTERVAL_MS);

  document.addEventListener("visibilitychange", onVisibilityChange);
  window.addEventListener("online", onOnline);
  connect();

  return {
    connectionId: () => connectionId,
    stop() {
      clearTimeout(retry);
      clearInterval(refresh);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("online", onOnline);
      const old = socket;
      socket = undefined;
      old?.close();
    },
  };
}

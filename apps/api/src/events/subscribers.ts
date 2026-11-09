import { type QuestEventBus, questEventBus } from "./questEventBus.js";
import { sendLiveUpdates, sendPlayerUpdates } from "./liveUpdates.js";
import { recordQuestActivity } from "./questEventLog.js";

/**
 * Subscribes everything that reacts to quest activity. The server calls this
 * once at startup.
 * @param bus the bus to subscribe to
 * @returns a function that removes the subscriptions
 */
export function subscribeQuestEventHandlers(
  bus: QuestEventBus = questEventBus
): () => void {
  const unsubscribers = [
    bus.subscribe(sendLiveUpdates),
    bus.subscribe(sendPlayerUpdates),
    bus.subscribe(recordQuestActivity),
  ];
  return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
}

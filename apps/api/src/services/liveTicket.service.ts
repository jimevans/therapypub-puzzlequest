// Tickets for the live-update websocket. A client gets one from the API, which
// knows who it is whether it uses a cookie or a Bearer token, and hands it
// over when it subscribes, so the websocket needn't know how clients sign in.
import { createHash, randomBytes } from "crypto";
import { LiveTicketModel } from "../models/liveTicket.model.js";
import { QuestModel } from "../models/quest.model.js";

/** Long enough to open a connection; a client asks for one each time. */
const TICKET_LIFETIME_MS = 60 * 1000;

/**
 * Gets the hash a ticket is stored under.
 * @param ticket the ticket
 * @returns its hash
 */
function hashTicket(ticket: string): string {
  return createHash("sha256").update(ticket).digest("hex");
}

/**
 * Issues a ticket to follow a quest.
 * @param questName the quest's name
 * @returns the ticket and when it expires, or undefined if there's no such
 *  quest
 */
export async function issueLiveTicket(
  questName: string
): Promise<{ ticket: string; expiresAt: Date } | undefined> {
  const quest = await QuestModel.findOne(
    { name: questName },
    { _id: 1 }
  ).lean();
  if (!quest) {
    return undefined;
  }
  const ticket = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + TICKET_LIFETIME_MS);
  await LiveTicketModel.create({
    tokenHash: hashTicket(ticket),
    questId: quest._id,
    expiresAt,
  });
  return { ticket, expiresAt };
}

/**
 * Uses up a ticket, if it's good for a quest.
 * @param ticket the ticket
 * @param questName the quest being followed
 * @returns whether the ticket is valid for that quest; either way, a ticket
 *  that existed can't be used again
 */
export async function redeemLiveTicket(
  ticket: string,
  questName: string
): Promise<boolean> {
  const redeemed = await LiveTicketModel.findOneAndDelete({
    tokenHash: hashTicket(ticket),
    expiresAt: { $gt: new Date() },
  }).lean();
  if (!redeemed) {
    return false;
  }
  return (
    (await QuestModel.exists({ _id: redeemed.questId, name: questName })) !==
    null
  );
}

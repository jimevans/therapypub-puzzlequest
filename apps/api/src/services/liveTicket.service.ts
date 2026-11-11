// Tickets for the live-update websocket. A client gets one from the API, which
// knows who it is whether it uses a cookie or a Bearer token, and hands it
// over when it subscribes, so the websocket needn't know how clients sign in.
import { createHash, randomBytes } from "crypto";
import { Types } from "mongoose";
import { LiveTicketModel } from "../models/liveTicket.model.js";
import { QuestModel } from "../models/quest.model.js";
import {
  AuthorizationLevel,
  TeamModel,
  UserModel,
} from "../models/user.model.js";

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
 * Stores a new ticket.
 * @param target what the ticket lets its holder follow
 * @returns the ticket and when it expires
 */
async function storeTicket(
  target:
    | {
        questId: Types.ObjectId;
        shareLinkId?: string;
        viewerId?: Types.ObjectId;
      }
    | { userId: Types.ObjectId }
): Promise<{ ticket: string; expiresAt: Date }> {
  const ticket = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + TICKET_LIFETIME_MS);
  await LiveTicketModel.create({
    tokenHash: hashTicket(ticket),
    ...target,
    expiresAt,
  });
  return { ticket, expiresAt };
}

/**
 * Issues a ticket to follow a quest.
 * @param questName the quest's name
 * @param shareLinkId the share link it's issued through, if any
 * @param viewerId the signed-in user it's issued to, if any
 * @returns the ticket and when it expires, or undefined if there's no such
 *  quest
 */
export async function issueLiveTicket(
  questName: string,
  shareLinkId?: string,
  viewerId?: string
): Promise<{ ticket: string; expiresAt: Date } | undefined> {
  const quest = await QuestModel.findOne(
    { name: questName },
    { _id: 1 }
  ).lean();
  if (!quest) {
    return undefined;
  }
  return storeTicket({
    questId: quest._id,
    ...(shareLinkId ? { shareLinkId } : {}),
    ...(viewerId ? { viewerId: new Types.ObjectId(viewerId) } : {}),
  });
}

/**
 * Issues a ticket to follow the list of quests a user plays.
 * @param userId the user's ID
 * @returns the ticket and when it expires
 */
export async function issueUserLiveTicket(
  userId: string
): Promise<{ ticket: string; expiresAt: Date }> {
  return storeTicket({ userId: new Types.ObjectId(userId) });
}

/** What a client asks to follow when it subscribes. */
export type LiveChannel = { questName: string } | { userName: string };

/**
 * Who follows a quest, as far as what they may be sent goes: whether they are
 * staff (administrators included), and the IDs of the user and their teams,
 * as they were when the connection subscribed.
 */
export interface LiveViewer {
  staff: boolean;
  assigneeIds: string[];
}

/** What a redeemed ticket lets a connection follow. */
export type AdmittedChannel =
  | { questName: string; shareLinkId?: string; viewer?: LiveViewer }
  | { userId: string };

/**
 * Finds what a connection's signed-in user may be sent about a quest.
 * @param viewerId the user's ID
 * @returns who they are, or undefined if they no longer exist
 */
async function findViewer(
  viewerId: Types.ObjectId
): Promise<LiveViewer | undefined> {
  const user = await UserModel.findById(viewerId, {
    authorizationLevel: 1,
  }).lean();
  if (!user) {
    return undefined;
  }
  const teams = await TeamModel.find(
    { memberIds: viewerId },
    { _id: 1 }
  ).lean();
  return {
    staff: (user.authorizationLevel ?? 0) >= AuthorizationLevel.STAFF,
    assigneeIds: [
      viewerId.toString(),
      ...teams.map((team) => team._id.toString()),
    ],
  };
}

/**
 * Uses up a ticket, if it's good for what the client asks to follow.
 * @param ticket the ticket
 * @param channel the quest, or the user whose quests, being followed
 * @returns what it admits, or undefined if it isn't valid for that; either
 *  way, a ticket that existed can't be used again
 */
export async function redeemLiveTicket(
  ticket: string,
  channel: LiveChannel
): Promise<AdmittedChannel | undefined> {
  const redeemed = await LiveTicketModel.findOneAndDelete({
    tokenHash: hashTicket(ticket),
    expiresAt: { $gt: new Date() },
  }).lean();
  if (!redeemed) {
    return undefined;
  }
  if ("questName" in channel) {
    const isForQuest =
      redeemed.questId &&
      (await QuestModel.exists({
        _id: redeemed.questId,
        name: channel.questName,
      }));
    if (!isForQuest) {
      return undefined;
    }
    const viewer = redeemed.viewerId
      ? await findViewer(redeemed.viewerId)
      : undefined;
    return {
      questName: channel.questName,
      shareLinkId: redeemed.shareLinkId?.toString(),
      ...(viewer ? { viewer } : {}),
    };
  }
  const isForUser =
    redeemed.userId &&
    (await UserModel.exists({
      _id: redeemed.userId,
      userName: channel.userName,
    }));
  return isForUser ? { userId: redeemed.userId!.toString() } : undefined;
}

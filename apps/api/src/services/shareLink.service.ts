// Share links: how a private quest's players and staff let someone else follow
// it. The holder of a link needs no account, so a link is a secret: it's shown
// once, when made, and only its hash is kept.
import { createHash, randomBytes } from "crypto";
import mongoose, { type Types } from "mongoose";
import { QuestModel, type QuestVisibility } from "../models/quest.model.js";
import { ShareLinkModel } from "../models/shareLink.model.js";
import { UserModel } from "../models/user.model.js";
import type { User } from "./user.service.js";

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Gets the hash a link's token is stored under.
 * @param token the token
 * @returns its hash
 */
function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Whether a user is one of those a quest is for: its staff, or its assigned
 * player or a member of its assigned team.
 * @param assigneeId the ID of the user or team the quest is assigned to
 * @param user the user
 * @returns true if so
 */
export async function isQuestMember(
  assigneeId: string,
  user: User
): Promise<boolean> {
  return user.isStaff() || (await user.getAssigneeIds()).includes(assigneeId);
}

/** A quest whose share links someone may manage. */
export interface ManagedQuest {
  id: Types.ObjectId;
  visibility: QuestVisibility;
}

/**
 * Finds a quest, if a user may manage its share links.
 * @param questName the quest's name
 * @param user the user
 * @returns the quest, or undefined if there's none they may manage
 */
export async function findManagedQuest(
  questName: string,
  user: User
): Promise<ManagedQuest | undefined> {
  const quest = await QuestModel.findOne(
    { name: questName },
    { visibility: 1, entries: 1 }
  ).lean();
  if (!quest) {
    return undefined;
  }
  // Staff, or anyone playing it in any of its entries.
  const members = await Promise.all(
    quest.entries.map(async (entry) =>
      entry.assignee
        ? isQuestMember(entry.assignee.id.toString(), user)
        : user.isStaff()
    )
  );
  if (!members.includes(true)) {
    return undefined;
  }
  return { id: quest._id, visibility: quest.visibility ?? "public" };
}

/** A share link, as those managing a quest see it: never its token. */
export interface ShareLinkSummary {
  id: string;
  label: string;
  /** Who made it; undefined if their account has been deleted. */
  createdBy?: string;
  createdAt: Date;
  expiresAt: Date;
  /** Whether the user asking may revoke it. */
  canRevoke: boolean;
}

/**
 * Lists a quest's links that still work.
 * @param questId the quest's ID
 * @param user the user asking
 * @returns the links, oldest first
 */
export async function listShareLinks(
  questId: Types.ObjectId,
  user: User
): Promise<ShareLinkSummary[]> {
  const links = await ShareLinkModel.find({
    questId,
    expiresAt: { $gt: new Date() },
  })
    .sort({ _id: 1 })
    .lean();
  const creators = await UserModel.find(
    { _id: { $in: links.map((link) => link.createdBy) } },
    { displayName: 1 }
  ).lean();
  const names = new Map(
    creators.map((creator) => [creator._id.toString(), creator.displayName])
  );
  return links.map((link) => ({
    id: link._id.toString(),
    label: link.label,
    createdBy: names.get(link.createdBy.toString()),
    createdAt: link.createdAt,
    expiresAt: link.expiresAt,
    canRevoke: user.isStaff() || link.createdBy.toString() === user.id,
  }));
}

/**
 * Makes a share link.
 * @param questId the quest's ID
 * @param user who is making it
 * @param label who or what it's for
 * @param expiresAt when it stops working; in 30 days if left out
 * @returns the link's token, which can't be got again, and its ID and expiry
 */
export async function createShareLink(
  questId: Types.ObjectId,
  user: User,
  label: string,
  expiresAt: Date = new Date(Date.now() + THIRTY_DAYS_MS)
): Promise<{ id: string; token: string; expiresAt: Date }> {
  const token = randomBytes(32).toString("base64url");
  const link = await ShareLinkModel.create({
    tokenHash: hashToken(token),
    questId,
    label,
    createdBy: user.id,
    expiresAt,
  });
  return { id: link._id.toString(), token, expiresAt };
}

/** What became of an attempt to revoke a link. */
export type RevokeResult = "revoked" | "not-found" | "not-allowed";

/**
 * Revokes a link, if the user made it or is staff.
 * @param questId the quest's ID
 * @param linkId the link's ID
 * @param user the user asking
 * @returns what happened
 */
export async function revokeShareLink(
  questId: Types.ObjectId,
  linkId: string,
  user: User
): Promise<RevokeResult> {
  if (!mongoose.isValidObjectId(linkId)) {
    return "not-found";
  }
  const link = await ShareLinkModel.findOne({ _id: linkId, questId }).lean();
  if (!link) {
    return "not-found";
  }
  if (!user.isStaff() && link.createdBy.toString() !== user.id) {
    return "not-allowed";
  }
  await ShareLinkModel.deleteOne({ _id: link._id });
  return "revoked";
}

/**
 * Finds the link a token belongs to, if it's good for a quest.
 * @param token the token
 * @param questName the quest's name
 * @returns the link's ID, or undefined if the token doesn't work for the quest
 */
export async function findValidShareLink(
  token: string,
  questName: string
): Promise<string | undefined> {
  const link = await ShareLinkModel.findOne({
    tokenHash: hashToken(token),
    expiresAt: { $gt: new Date() },
  }).lean();
  if (!link) {
    return undefined;
  }
  const isForQuest = await QuestModel.exists({
    _id: link.questId,
    name: questName,
  });
  return isForQuest ? link._id.toString() : undefined;
}

/**
 * Removes a quest's links, when it's deleted.
 * @param questId the quest's ID
 */
export async function deleteShareLinksOfQuest(
  questId: Types.ObjectId
): Promise<void> {
  await ShareLinkModel.deleteMany({ questId });
}

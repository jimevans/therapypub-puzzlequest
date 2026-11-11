// Share links, which let someone without an account follow a private quest.
// The quest's players and staff manage them; anyone else finds no such quest.
import { z } from "zod";
import * as ShareLinkService from "../../services/shareLink.service.js";
import * as UserService from "../../services/user.service.js";
import { disconnectShareLinkFollowers } from "../../services/websocket.service.js";
import { Problems, sendProblem } from "../problems.js";
import { defineRoute } from "./route.js";

const questParams = z.object({
  questName: z.string().meta({ description: "The quest's name." }),
});

const linkParams = questParams.extend({
  linkId: z.string().meta({ description: "The share link's ID." }),
});

const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000;

const createShareLinkBody = z.object({
  label: z
    .string()
    .trim()
    .min(1, "Required")
    .max(100, "Must be at most 100 characters")
    .meta({ description: 'Who or what it\'s for, such as "Lobby screen".' }),
  expiresAt: z.iso
    .datetime()
    .refine((date) => Date.parse(date) > Date.now(), "Must be in the future")
    .refine(
      (date) => Date.parse(date) <= Date.now() + ONE_YEAR_MS,
      "Must be within a year"
    )
    .optional()
    .meta({
      description:
        "When it stops working; only staff may choose. In 30 days if left out.",
    }),
});

const shareLinkSchema = z
  .object({
    id: z.string(),
    label: z.string(),
    createdBy: z.string().nullable().meta({
      description:
        "The display name of whoever made it; null if their account has been deleted.",
    }),
    createdAt: z.iso.datetime(),
    expiresAt: z.iso.datetime(),
    canRevoke: z.boolean().meta({
      description: "Whether the user asking may revoke it.",
    }),
  })
  .meta({ id: "ShareLink" });

const shareLinksSchema = z
  .object({
    visibility: z.enum(["public", "private"]).meta({
      description: "A public quest can be followed without a link.",
    }),
    canSetExpiry: z.boolean().meta({
      description:
        "Whether the user asking may choose when a new link expires; only staff may.",
    }),
    links: z.array(shareLinkSchema),
  })
  .meta({ id: "ShareLinks" });

const createdShareLinkSchema = z
  .object({
    id: z.string(),
    token: z.string().meta({
      description:
        "Send as the X-Share-Token header. Shown only now; it can't be got again.",
    }),
    expiresAt: z.iso.datetime(),
  })
  .meta({ id: "CreatedShareLink" });

const NOT_FOUND = "No such quest";

export const shareLinkRoutes = [
  defineRoute({
    method: "get",
    path: "/quests/{questName}/share-links",
    operationId: "listShareLinks",
    summary: "List a quest's share links",
    description:
      "For the quest's players (in any of its entries), and staff. Anyone else finds no such quest.",
    tags: ["Spectating"],
    access: "signedIn",
    request: { params: questParams },
    responses: {
      200: { description: "The links.", body: shareLinksSchema },
    },
    problems: [Problems.notFound],
    async handle(req, res) {
      const user = UserService.requireLoggedInUser(req.user);
      const quest = await ShareLinkService.findManagedQuest(
        req.params.questName,
        user
      );
      if (!quest) {
        sendProblem(res, Problems.notFound, NOT_FOUND);
        return;
      }
      const links = await ShareLinkService.listShareLinks(quest.id, user);
      res.json({
        visibility: quest.visibility,
        canSetExpiry: user.isStaff(),
        links: links.map((link) => ({
          id: link.id,
          label: link.label,
          createdBy: link.createdBy ?? null,
          createdAt: link.createdAt.toISOString(),
          expiresAt: link.expiresAt.toISOString(),
          canRevoke: link.canRevoke,
        })),
      });
    },
  }),
  defineRoute({
    method: "post",
    path: "/quests/{questName}/share-links",
    operationId: "createShareLink",
    summary: "Make a share link",
    description:
      "Lets whoever holds the link follow the quest, without an account, until it expires or is revoked.",
    tags: ["Spectating"],
    access: "signedIn",
    request: { params: questParams, body: createShareLinkBody },
    responses: {
      201: { description: "The link.", body: createdShareLinkSchema },
    },
    problems: [Problems.notFound, Problems.forbidden],
    async handle(req, res) {
      const user = UserService.requireLoggedInUser(req.user);
      const quest = await ShareLinkService.findManagedQuest(
        req.params.questName,
        user
      );
      if (!quest) {
        sendProblem(res, Problems.notFound, NOT_FOUND);
        return;
      }
      if (req.body.expiresAt !== undefined && !user.isStaff()) {
        sendProblem(
          res,
          Problems.forbidden,
          "Only staff can choose when a link expires"
        );
        return;
      }
      const created = await ShareLinkService.createShareLink(
        quest.id,
        user,
        req.body.label,
        req.body.expiresAt ? new Date(req.body.expiresAt) : undefined
      );
      res.status(201).json({
        ...created,
        expiresAt: created.expiresAt.toISOString(),
      });
    },
  }),
  defineRoute({
    method: "delete",
    path: "/quests/{questName}/share-links/{linkId}",
    operationId: "revokeShareLink",
    summary: "Revoke a share link",
    description:
      "By the player who made it, or staff. Anyone following through the link is cut off at once.",
    tags: ["Spectating"],
    access: "signedIn",
    request: { params: linkParams },
    responses: { 204: { description: "Revoked." } },
    problems: [Problems.notFound, Problems.forbidden],
    async handle(req, res) {
      const user = UserService.requireLoggedInUser(req.user);
      const quest = await ShareLinkService.findManagedQuest(
        req.params.questName,
        user
      );
      if (!quest) {
        sendProblem(res, Problems.notFound, NOT_FOUND);
        return;
      }
      const result = await ShareLinkService.revokeShareLink(
        quest.id,
        req.params.linkId,
        user
      );
      if (result === "not-found") {
        sendProblem(res, Problems.notFound, "No such link");
        return;
      }
      if (result === "not-allowed") {
        sendProblem(
          res,
          Problems.forbidden,
          "Only staff or the link's maker can revoke it"
        );
        return;
      }
      disconnectShareLinkFollowers(req.params.linkId);
      res.status(204).end();
    },
  }),
];

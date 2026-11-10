// What staff see: every quest, and each one's stops in order with their live
// status, for the people running things at the stops. Administrators see it
// too. It leaves out how to solve anything: see staffQuestSchema.
import { z } from "zod";
import * as QuestService from "../../services/quest.service.js";
import { pageQuery, pageSchema } from "../paging.js";
import { Problems, sendServiceProblem } from "../problems.js";
import {
  staffQuestSchema,
  staffQuestSummarySchema,
  toStaffQuestResource,
  toStaffQuestSummaryResource,
} from "./resources.js";
import { defineRoute } from "./route.js";

const questParams = z.object({
  name: z.string().meta({ description: "The quest's name." }),
});

export const staffRoutes = [
  defineRoute({
    method: "get",
    path: "/staff/quests",
    operationId: "listStaffQuests",
    summary: "List quests for staff",
    description:
      "Every quest, with who it's for and how it's going, for staff to choose one to follow.",
    tags: ["Staff"],
    access: "staff",
    request: { query: pageQuery },
    responses: {
      200: {
        description: "A page of quests.",
        body: pageSchema(staffQuestSummarySchema),
      },
    },
    async handle(req, res) {
      const page = await QuestService.listQuestsPage(req.query);
      res.json({
        items: page.items.map(toStaffQuestSummaryResource),
        next: page.next,
      });
    },
  }),
  defineRoute({
    method: "get",
    path: "/quests/{name}/staff-view",
    operationId: "getStaffQuest",
    summary: "Follow a quest as staff",
    description:
      "Every stop of the quest, in order, whether or not the players have reached it, with its live status, times, and activation code. No solutions or hint text.",
    tags: ["Staff"],
    access: "staff",
    request: { params: questParams },
    responses: {
      200: { description: "The quest.", body: staffQuestSchema },
    },
    problems: [Problems.notFound],
    async handle(req, res) {
      const found = await QuestService.getQuestByQuestName(req.params.name);
      if (found.status === "error") {
        sendServiceProblem(res, found);
        return;
      }
      res.json(toStaffQuestResource(found.data));
    },
  }),
];

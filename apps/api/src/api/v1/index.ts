// The v1 API, mounted at /api/v1.
import express from "express";
import { z } from "zod";
import { Problems, sendProblem } from "../problems.js";
import { createOpenApiDocument } from "./openapi.js";
import { type AnyRoute, defineRoute, registerRoutes } from "./route.js";
import { playingRoutes } from "./playing.js";
import { puzzleRoutes } from "./puzzles.js";
import { questRoutes } from "./quests.js";
import { sessionRoutes } from "./sessions.js";
import { spectatingRoutes } from "./spectating.js";
import { staffRoutes } from "./staff.js";
import { teamRoutes } from "./teams.js";
import { webhookRoutes } from "./webhooks.js";
import { userRoutes } from "./users.js";

/** The document describing the API, made on first request. */
let openApiDocument: string | undefined;

/** Every v1 route, including the one serving the API's description. */
export const v1Routes: AnyRoute[] = [
  defineRoute({
    method: "get",
    path: "/openapi.json",
    operationId: "getOpenApiDocument",
    summary: "Describe the API",
    description: "This document: the API's OpenAPI 3.1 description.",
    tags: ["API"],
    access: "public",
    responses: {
      200: {
        description: "The OpenAPI document.",
        body: z.record(z.string(), z.unknown()),
      },
    },
    handle(req, res) {
      openApiDocument ??= JSON.stringify(createOpenApiDocument(v1Routes));
      res.type("application/json").send(openApiDocument);
    },
  }),
  ...sessionRoutes,
  ...userRoutes,
  ...teamRoutes,
  ...puzzleRoutes,
  ...questRoutes,
  ...playingRoutes,
  ...spectatingRoutes,
  ...staffRoutes,
  ...webhookRoutes,
];

const v1Router = express.Router();
registerRoutes(v1Router, v1Routes);

// Anything else under /api/v1 isn't part of the API.
v1Router.use((req, res) => {
  sendProblem(
    res,
    Problems.notFound,
    `There is no ${req.method} ${req.originalUrl.split("?")[0]} in the API`
  );
});

export { v1Router as V1Router };

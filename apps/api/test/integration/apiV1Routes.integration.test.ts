// Tests of defining v1 routes, with sample routes of the kinds the API's
// resources need: path parameters, paged lists, and access rules.
import express, { type Express } from "express";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";
import request from "supertest";
import { z } from "zod";
import { Validator } from "@seriousme/openapi-schema-validator";
import { startSessions } from "../sessions.js";

const { defineRoute, registerRoutes } =
  await import("../../src/api/v1/route.js");
const { createOpenApiDocument } = await import("../../src/api/v1/openapi.js");
const { pageQuery, pageSchema } = await import("../../src/api/paging.js");
const { Problems } = await import("../../src/api/problems.js");
const { errorHandler } = await import("../../src/middleware/errorHandler.js");
const { AuthorizationLevel, UserModel } =
  await import("../../src/models/user.model.js");

const thing = z.object({ name: z.string() }).meta({ id: "Thing" });

const routes = [
  defineRoute({
    method: "get",
    path: "/things",
    operationId: "listThings",
    summary: "List things",
    tags: ["Things"],
    access: "admin",
    request: { query: pageQuery },
    responses: { 200: { description: "A page.", body: pageSchema(thing) } },
    handle(req, res) {
      // The query is what the schema parsed: a number, and no extra fields.
      res.json({ items: [], next: null, query: req.query });
    },
  }),
  defineRoute({
    method: "get",
    path: "/things/{thingName}",
    operationId: "getThing",
    summary: "Get a thing",
    tags: ["Things"],
    access: "selfOrAdmin",
    request: { params: z.object({ thingName: z.string().min(3) }) },
    responses: { 200: { description: "The thing.", body: thing } },
    problems: [Problems.notFound],
    handle(req, res) {
      res.json({ name: req.params.thingName });
    },
  }),
];

let mongoServer: MongoMemoryServer | undefined;
let app: Express;
let sessions: Record<string, string> = {};

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());
  const router = express.Router();
  registerRoutes(router, routes);
  app = express();
  app.use(express.json());
  app.use("/api/v1", router);
  app.use(errorHandler);
}, 120000);

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer?.stop();
});

beforeEach(async () => {
  await UserModel.deleteMany({});
  await UserModel.create(
    (["admin", "player"] as const).map((userName) => ({
      userName,
      displayName: userName,
      email: `${userName}@example.com`,
      password: "hash",
      authorizationLevel:
        userName === "admin"
          ? AuthorizationLevel.ADMIN
          : AuthorizationLevel.USER,
    }))
  );
  sessions = await startSessions("admin", "player");
});

function get(path: string, role: "admin" | "player") {
  return request(app)
    .get(`/api/v1${path}`)
    .set("Authorization", `Bearer ${sessions[role]}`);
}

describe("a route", () => {
  it("gets its query as its schema parsed it", async () => {
    const response = await get("/things?limit=5&extra=1", "admin");

    expect(response.status).toBe(200);
    expect(JSON.parse(response.text).query).toEqual({ limit: 5 });
  });

  it("reports invalid query and path parameters together", async () => {
    const list = await get("/things?limit=0&after=nonsense", "admin");
    const one = await get("/things/ab", "admin");

    expect(
      JSON.parse(list.text).errors.map((e: { path: string }) => e.path)
    ).toEqual(["query.limit", "query.after"]);
    expect(JSON.parse(one.text).errors).toEqual([
      { path: "params.thingName", message: expect.any(String) },
    ]);
  });

  it("refuses a user its access rule doesn't allow, with a problem", async () => {
    const response = await get("/things", "player");

    expect(response.status).toBe(403);
    expect(response.type).toBe("application/problem+json");
    expect(JSON.parse(response.text)).toEqual({
      type: "/problems/forbidden",
      title: "Not allowed",
      status: 403,
      detail: "User player isn't allowed to do this",
    });
  });

  it("checks access before validating, so a refusal isn't a 400", async () => {
    expect((await get("/things?limit=0", "player")).status).toBe(403);
  });
});

describe("a route's description", () => {
  const document = createOpenApiDocument(routes) as any;

  it("is valid OpenAPI 3.1", async () => {
    expect((await new Validator().validate(document)).valid).toBe(true);
  });

  it("lists its path and query parameters", () => {
    expect(
      document.paths["/things"].get.parameters.map(
        (parameter: { name: string; in: string }) =>
          `${parameter.in} ${parameter.name}`
      )
    ).toEqual(["query limit", "query after"]);
    expect(document.paths["/things/{thingName}"].get.parameters).toEqual([
      expect.objectContaining({
        in: "path",
        name: "thingName",
        required: true,
      }),
    ]);
  });

  it("lists the problems its access rule, schemas, and handler can report", () => {
    expect(
      Object.keys(document.paths["/things/{thingName}"].get.responses)
      // Path parameters are plain names, so there is no 400.
    ).toEqual(["200", "401", "403", "404", "500"]);
  });

  it("describes a page of a list, named after its items", () => {
    expect(
      document.paths["/things"].get.responses["200"].content["application/json"]
        .schema
    ).toEqual({ $ref: "#/components/schemas/ThingPage" });
    const page = document.components.schemas.ThingPage;
    expect(page.properties.items).toMatchObject({
      type: "array",
      items: { $ref: "#/components/schemas/Thing" },
    });
    expect(page.required).toEqual(["items", "next"]);
  });
});

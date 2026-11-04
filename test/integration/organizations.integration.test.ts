// Tests that records belong to an organization, ready for the site to host
// several later, and that references by ID survive renames.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose, { Types } from "mongoose";
import { startSessions } from "../sessions.js";

const {
  DEFAULT_ORGANIZATION_ID,
  OrganizationModel,
  ensureDefaultOrganization,
} = await import("../../src/models/organization.model.js");
const { PuzzleModel } = await import("../../src/models/puzzle.model.js");
const { QuestModel } = await import("../../src/models/quest.model.js");
const { TeamModel, UserModel } = await import("../../src/models/user.model.js");
const SessionService = await import("../../src/services/session.service.js");

let mongoServer: MongoMemoryServer | undefined;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());
  await Promise.all(
    [UserModel, TeamModel, PuzzleModel, QuestModel].map((model) => model.init())
  );
}, 120000);

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer?.stop();
});

beforeEach(async () => {
  await Promise.all(
    [OrganizationModel, UserModel, TeamModel, PuzzleModel, QuestModel].map(
      (model) => (model as typeof UserModel).deleteMany({})
    )
  );
});

const OTHER_ORGANIZATION_ID = new Types.ObjectId("000000000000000000000002");

function user(userName: string, organizationId?: Types.ObjectId) {
  return {
    userName,
    displayName: userName,
    email: `${userName}@example.com`,
    password: "hash",
    authorizationLevel: 1,
    ...(organizationId ? { organizationId } : {}),
  };
}

describe("the default organization", () => {
  it("is created at startup, once however often startup runs", async () => {
    await ensureDefaultOrganization();
    await ensureDefaultOrganization();

    const organizations = await OrganizationModel.find({}).lean();
    expect(organizations).toHaveLength(1);
    expect(organizations[0]._id).toEqual(DEFAULT_ORGANIZATION_ID);
    expect(organizations[0].name).toBe("default");
  });

  it("owns records that don't name an organization", async () => {
    await UserModel.create(user("player"));
    await TeamModel.create({
      teamName: "team",
      displayName: "Team",
      joinCode: "code",
    });
    await PuzzleModel.create({
      name: "riddle",
      solutionKeyword: "x",
      solutionDisplayText: "X",
    });
    await QuestModel.create({ name: "quest", userName: "player" });

    for (const model of [UserModel, TeamModel, PuzzleModel, QuestModel]) {
      const [record] = await (model as typeof UserModel).find({}).lean();
      expect(record.organizationId).toEqual(DEFAULT_ORGANIZATION_ID);
    }
  });
});

describe("names", () => {
  it("are unique within an organization", async () => {
    await UserModel.create(user("player"));

    await expect(UserModel.create(user("player"))).rejects.toMatchObject({
      code: 11000,
    });
  });

  it("can repeat in another organization", async () => {
    await UserModel.create(user("player"));
    await UserModel.create(user("player", OTHER_ORGANIZATION_ID));
    await PuzzleModel.create({
      name: "riddle",
      solutionKeyword: "x",
      solutionDisplayText: "X",
    });
    await PuzzleModel.create({
      name: "riddle",
      solutionKeyword: "x",
      solutionDisplayText: "X",
      organizationId: OTHER_ORGANIZATION_ID,
    });

    expect(await UserModel.countDocuments({ userName: "player" })).toBe(2);
    expect(await PuzzleModel.countDocuments({ name: "riddle" })).toBe(2);
  });
});

describe("a user's sessions", () => {
  it("survive renaming the user, since they refer to the user's ID", async () => {
    await UserModel.create(user("player"));
    const { player } = await startSessions("player");

    await UserModel.updateOne({ userName: "player" }, { userName: "renamed" });

    const session = await SessionService.findSession(player);
    const renamed = await UserModel.findOne({ userName: "renamed" }).lean();
    expect(session?.userId).toBe(renamed!._id.toString());
  });
});

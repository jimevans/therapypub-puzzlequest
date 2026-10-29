import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  adminUser,
  createMockRequest,
  createMockResponse,
  playerUser,
} from "../helpers.js";

vi.mock("../../src/services/team.service.js", async (importOriginal) => {
  const original = await importOriginal();
  return {
    ...original,
    getTeamByTeamName: vi.fn(),
    listTeams: vi.fn(),
    addUserToTeam: vi.fn(async () => ({ status: "success", statusCode: 200 })),
    removeUserFromTeam: vi.fn(async () => ({ status: "success", statusCode: 200 })),
  };
});

const TeamService = await import("../../src/services/team.service.js");
const TeamController = await import("../../src/controllers/team.controller.js");

const teams = [
  new TeamService.Team({
    teamName: "red",
    displayName: "Red Team",
    joinCode: "secret",
    memberNames: ["player"],
  }),
];

beforeEach(() => {
  vi.clearAllMocks();
  TeamService.listTeams.mockResolvedValue({
    status: "success",
    statusCode: 200,
    data: teams,
  });
});

describe("joinTeam", () => {
  it("forbids a non-admin from adding another user to a team", async () => {
    const req = createMockRequest({
      user: playerUser,
      params: { teamName: "red", userName: "other" },
      body: { joinCode: "secret" },
    });
    const res = createMockResponse();

    await TeamController.joinTeam(req, res);

    expect(res.statusCode).toBe(403);
    expect(TeamService.addUserToTeam).not.toHaveBeenCalled();
  });

  it("allows a user to join a team themselves", async () => {
    const req = createMockRequest({
      user: playerUser,
      params: { teamName: "red", userName: "player" },
      body: { joinCode: "secret" },
    });
    const res = createMockResponse();

    await TeamController.joinTeam(req, res);

    expect(res.statusCode).toBe(200);
    expect(TeamService.addUserToTeam).toHaveBeenCalledWith("red", "player", "secret");
  });
});

describe("leaveTeam", () => {
  it("forbids a non-admin from removing another user from a team", async () => {
    const req = createMockRequest({
      user: playerUser,
      params: { teamName: "red", userName: "other" },
    });
    const res = createMockResponse();

    await TeamController.leaveTeam(req, res);

    expect(res.statusCode).toBe(403);
    expect(TeamService.removeUserFromTeam).not.toHaveBeenCalled();
  });
});

describe("retrieveTeam", () => {
  it("looks up the team by the teamName route parameter", async () => {
    TeamService.getTeamByTeamName.mockResolvedValue({
      status: "success",
      statusCode: 200,
      data: teams[0],
    });
    const req = createMockRequest({ user: adminUser, params: { teamName: "red" } });
    const res = createMockResponse();

    await TeamController.retrieveTeam(req, res);

    expect(TeamService.getTeamByTeamName).toHaveBeenCalledWith("red");
    expect(res.body.data.teamName).toBe("red");
  });

  it("sends exactly one response when the team is not found", async () => {
    TeamService.getTeamByTeamName.mockResolvedValue({
      status: "error",
      statusCode: 404,
      message: "No team",
    });
    const req = createMockRequest({ user: adminUser, params: { teamName: "nope" } });
    const res = createMockResponse();

    await TeamController.retrieveTeam(req, res);

    expect(res.statusCode).toBe(404);
    expect(res.sendCount).toBe(1);
  });
});

describe("listTeams", () => {
  it("hides join codes and members from non-admins", async () => {
    const req = createMockRequest({ user: playerUser });
    const res = createMockResponse();

    await TeamController.listTeams(req, res);

    expect(res.body.data).toEqual([{ teamName: "red", displayName: "Red Team" }]);
  });

  it("returns full team data to admins", async () => {
    const req = createMockRequest({ user: adminUser });
    const res = createMockResponse();

    await TeamController.listTeams(req, res);

    expect(res.body.data[0].joinCode).toBe("secret");
    expect(res.body.data[0].memberNames).toEqual(["player"]);
  });
});

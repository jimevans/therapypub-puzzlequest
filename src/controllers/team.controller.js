import * as TeamService from "../services/team.service.js";
import * as UserService from "../services/user.service.js";
import * as RequestValidationService from "../services/requestValidation.service.js";

export async function createTeam(req, res) {
  const validation = RequestValidationService.validateRequest(
    {
      requiresUser: true,
      requiresAdmin: true,
      requiresBody: true,
      requiredBodyProperties: ["teamName", "displayName", "joinCode"],
    },
    req
  );
  if (validation.status === "error") {
    res.status(validation.statusCode).send(
      JSON.stringify({
        status: "error",
        message: validation.message,
      })
    );
    return;
  }

  const teamToCreate = new TeamService.Team(req.body);
  const response = await TeamService.createTeam(teamToCreate);
  if (response.status === "error") {
    res.status(response.statusCode).send(
      JSON.stringify({
        status: "error",
        message: response.message,
      })
    );
    return;
  }
  res.send(JSON.stringify(response));
}

export async function retrieveTeam(req, res) {
  const validation = RequestValidationService.validateRequest(
    {
      requiresUser: true,
      requiresAdmin: true,
    },
    req
  );
  if (validation.status === "error") {
    res.status(validation.statusCode).send(
      JSON.stringify({
        status: "error",
        message: validation.message,
      })
    );
    return;
  }

  const teamResponse = await TeamService.getTeamByTeamName(req.params.name);
  if (teamResponse.status === "error") {
    res.status(teamResponse.statusCode).send(
      JSON.stringify({
        status: "error",
        message: teamResponse.message
      })
    );
  }
  res.send(JSON.stringify(teamResponse));
}

export async function updateTeam(req, res) {
  const validation = RequestValidationService.validateRequest(
    {
      requiresUser: true,
      requiresAdmin: true,
      requiresBody: true,
      requiredBodyProperties: ["teamName"]
    },
    req
  );
  if (validation.status === "error") {
    res.status(validation.statusCode).send(
      JSON.stringify({
        status: "error",
        message: validation.message,
      })
    );
    return;
  }

  const team = new TeamService.Team(req.body);
  const response = await TeamService.updateTeam(req.params.teamName, team);
  if (response.status === "error") {
    res.status(response.statusCode).send(
      JSON.stringify({
        status: "error",
        message: response.message,
      })
    );
    return;
  }
  res.send(JSON.stringify(response));
}

export async function deleteTeam(req, res) {
  const validation = RequestValidationService.validateRequest(
    {
      requiresUser: true,
      requiresAdmin: true,
    },
    req
  );
  if (validation.status === "error") {
    res.status(validation.statusCode).send(
      JSON.stringify({
        status: "error",
        message: validation.message,
      })
    );
    return;
  }

  const response = await TeamService.deleteTeam(req.params.teamName);
  if (response.status === "error") {
    res.status(500).send(
      JSON.stringify({
        status: "error",
        message: response.message,
      })
    );
    return;
  }
  res.send(JSON.stringify(response));
}

export async function listTeams(req, res) {
  const validation = RequestValidationService.validateRequest(
    {
      requiresUser: true,
    },
    req
  );
  if (validation.status === "error") {
    res.status(validation.statusCode).send(
      JSON.stringify({
        status: "error",
        message: validation.message,
      })
    );
    return;
  }

  const response = await TeamService.listTeams();
  res.send(JSON.stringify(response));
}

export async function joinTeam(req, res) {
  const validation = RequestValidationService.validateRequest(
    {
      requiresUser: true,
      requiresBody: true,
      requiredBodyProperties: ["joinCode"],
    },
    req
  );
  if (validation.status === "error") {
    res.status(validation.statusCode).send(
      JSON.stringify({
        status: "error",
        message: validation.message,
      })
    );
    return;
  }

  const loggedInUser = UserService.getLoggedInUser(req.user);
  if (!loggedInUser.isCurrentUser(req.params.userName) && !loggedInUser.isAdmin) {
    res.status(403).send(
      JSON.stringify({
        status: "error",
        message: `User ${loggedInUser.userName} not authorized to retrieve user ${req.params.userName}`,
      })
    );
    return;
  }

  const addUserResponse = await TeamService.addUserToTeam(
    req.params.teamName,
    req.params.userName,
    req.body.joinCode
  );
  if (addUserResponse.status === "error") {
    res.status(addUserResponse.statusCode).send(JSON.stringify(
      {
        status: "error",
        message: addUserResponse.message
      }
    ));
    return;
  }
  res.send({ status: "success", statusCode: 200 });
}

export async function leaveTeam(req, res) {
  const validation = RequestValidationService.validateRequest(
    {
      requiresUser: true,
    },
    req
  );
  if (validation.status === "error") {
    res.status(validation.statusCode).send(
      JSON.stringify({
        status: "error",
        message: validation.message,
      })
    );
    return;
  }

  const loggedInUser = UserService.getLoggedInUser(req.user);
  if (!loggedInUser.isCurrentUser(req.params.userName) && !loggedInUser.isAdmin) {
    res.status(403).send(
      JSON.stringify({
        status: "error",
        message: `User ${loggedInUser.userName} not authorized to retrieve user ${req.params.userName}`,
      })
    );
    return;
  }

  const leaveUserResponse = await TeamService.removeUserFromTeam(
    req.params.teamName,
    req.params.userName
  );
  if (leaveUserResponse.status === "error") {
    res.status(leaveUserResponse.statusCode).send(JSON.stringify(
      {
        status: "error",
        message: leaveUserResponse.message
      }
    ));
    return;
  }
  res.send({ status: "success", statusCode: 200 });
}

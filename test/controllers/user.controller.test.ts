// Tests of the user pages' handlers. The API the pages' scripts use is
// tested through the application, in test/integration.
import { describe, expect, it } from "vitest";
import { createMockRequest, createMockResponse } from "../helpers.js";

const UserController = await import("../../src/controllers/user.controller.js");

describe("renderResetPassword", () => {
  it("passes a well-formed token to the page and disables referrers", () => {
    const req = createMockRequest({ query: { token: "abc_DEF-123" } });
    const res = createMockResponse();

    UserController.renderResetPassword(req, res);

    expect(res.set).toHaveBeenCalledWith("Referrer-Policy", "no-referrer");
    expect(res.render).toHaveBeenCalledWith("resetPassword", {
      resetToken: "abc_DEF-123",
    });
  });

  it("does not pass a malformed token into the page", () => {
    const req = createMockRequest({
      query: { token: "</script><script>alert(1)</script>" },
    });
    const res = createMockResponse();

    UserController.renderResetPassword(req, res);

    expect(res.render).toHaveBeenCalledWith("resetPassword", {
      resetToken: "",
    });
  });
});

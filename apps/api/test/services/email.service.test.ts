// How email goes out, and what happens when it can't: production has no mail
// server configured until one is set up, and a link in an email must never end
// up in its logs.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { recordLogs } from "../logs.js";

const transport = vi.hoisted(() => ({ sendMail: vi.fn() }));
const createTransport = vi.hoisted(() => vi.fn(() => transport));

vi.mock("nodemailer", () => ({ default: { createTransport } }));

const MESSAGE = {
  to: "player@example.com",
  subject: "Reset your password",
  text: "Follow https://example.com/secret-link",
};

/**
 * Loads the service afresh, since it keeps its connection once made, along with
 * the configuration it will see, and records what it logs.
 * @param settings the configuration to give it
 * @returns the service, and what it logs
 */
async function emailService(settings: Record<string, unknown>) {
  vi.resetModules();
  const { config } = await import("../../src/config.js");
  Object.assign(config, settings);
  const logs = recordLogs(await import("../../src/logger.js"));
  return {
    ...(await import("../../src/services/email.service.js")),
    logs,
  };
}

const NO_MAIL_SERVER = { PQ_SMTP_HOST: undefined };
const MAIL_SERVER = {
  PQ_SMTP_HOST: "mail.example.com",
  PQ_SMTP_PORT: 587,
  PQ_SMTP_SECURE: false,
  PQ_SMTP_USER: undefined,
  PQ_EMAIL_FROM: "quests@example.com",
};

describe("sendEmail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    transport.sendMail.mockResolvedValue({});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("without a mail server", () => {
    it("reports a failure in production, for callers to decide what it means", async () => {
      const { sendEmail } = await emailService({
        ...NO_MAIL_SERVER,
        PQ_RUNTIME_ENVIRONMENT: "production",
      });

      expect(await sendEmail(MESSAGE)).toEqual({
        status: "error",
        statusCode: 500,
        message: "Email delivery is not configured",
      });
    });

    it("keeps links out of production's logs", async () => {
      const { sendEmail, logs } = await emailService({
        ...NO_MAIL_SERVER,
        PQ_RUNTIME_ENVIRONMENT: "production",
      });

      await sendEmail(MESSAGE);

      expect(logs).toContainEqual(
        expect.objectContaining({
          level: "error",
          msg: "email not sent: SMTP isn't configured (PQ_SMTP_HOST unset)",
        })
      );
      const written = JSON.stringify(logs);
      expect(written).not.toContain("secret-link");
      expect(written).not.toContain(MESSAGE.to);
    });

    it("writes the message out in development, to follow its links", async () => {
      const { sendEmail, logs } = await emailService({
        ...NO_MAIL_SERVER,
        PQ_RUNTIME_ENVIRONMENT: "development",
      });

      expect((await sendEmail(MESSAGE)).status).toBe("success");
      expect(logs[0]?.msg).toContain("secret-link");
      expect(createTransport).not.toHaveBeenCalled();
    });
  });

  describe("with a mail server", () => {
    it("sends the message from the configured address", async () => {
      const { sendEmail } = await emailService(MAIL_SERVER);

      expect((await sendEmail(MESSAGE)).status).toBe("success");
      expect(transport.sendMail).toHaveBeenCalledWith({
        from: "quests@example.com",
        ...MESSAGE,
        html: undefined,
      });
    });

    it("signs in to the server only when it has a user name", async () => {
      await (await emailService(MAIL_SERVER)).sendEmail(MESSAGE);
      expect(createTransport).toHaveBeenLastCalledWith(
        expect.objectContaining({ host: "mail.example.com", auth: undefined })
      );

      await (
        await emailService({
          ...MAIL_SERVER,
          PQ_SMTP_USER: "quests",
          PQ_SMTP_PASSWORD: "secret",
        })
      ).sendEmail(MESSAGE);
      expect(createTransport).toHaveBeenLastCalledWith(
        expect.objectContaining({ auth: { user: "quests", pass: "secret" } })
      );
    });

    it("keeps one connection for every message", async () => {
      const { sendEmail } = await emailService(MAIL_SERVER);

      await sendEmail(MESSAGE);
      await sendEmail(MESSAGE);

      expect(createTransport).toHaveBeenCalledTimes(1);
      expect(transport.sendMail).toHaveBeenCalledTimes(2);
    });

    it("reports a failure without details when sending fails", async () => {
      transport.sendMail.mockRejectedValue(new Error("Connection refused"));
      const { sendEmail } = await emailService(MAIL_SERVER);

      const result = await sendEmail(MESSAGE);

      expect(result).toMatchObject({ status: "error", statusCode: 500 });
      expect(JSON.stringify(result)).not.toContain("Connection refused");
    });
  });
});

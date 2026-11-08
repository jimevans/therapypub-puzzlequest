import nodemailer, { type Transporter } from "nodemailer";
import { config } from "../config.js";
import { log } from "../logger.js";
import type { ServiceResult } from "../types.js";
import { unexpectedErrorResult } from "../errors.js";

/** An email message to send. */
export interface EmailMessage {
  /** The recipient's email address. */
  to: string;
  subject: string;
  /** The plain text body. */
  text: string;
  /** The HTML body, if any. */
  html?: string;
}

let transport: Transporter | null = null;

/**
 * Gets the SMTP transport, creating it on first use. Returns null if SMTP is
 * not configured, in which case messages are written to the console in
 * development and rejected otherwise.
 * @returns the transport, or null
 */
function getTransport(): Transporter | null {
  if (!config.PQ_SMTP_HOST) {
    return null;
  }
  if (!transport) {
    transport = nodemailer.createTransport({
      host: config.PQ_SMTP_HOST,
      port: config.PQ_SMTP_PORT,
      secure: config.PQ_SMTP_SECURE,
      auth: config.PQ_SMTP_USER
        ? { user: config.PQ_SMTP_USER, pass: config.PQ_SMTP_PASSWORD }
        : undefined,
    });
  }
  return transport;
}

/**
 * Sends an email message.
 * @param message the message to send
 * @returns a result containing a status, status code, and message
 */
export async function sendEmail({
  to,
  subject,
  text,
  html,
}: EmailMessage): Promise<ServiceResult<undefined>> {
  const mailTransport = getTransport();
  if (!mailTransport) {
    if (config.PQ_RUNTIME_ENVIRONMENT !== "development") {
      // Never write message bodies (which may contain reset links) to
      // production logs.
      log().error("email not sent: SMTP isn't configured (PQ_SMTP_HOST unset)");
      return {
        status: "error",
        statusCode: 500,
        message: "Email delivery is not configured",
      };
    }
    // In development only, the message is logged in full, so its links can
    // be followed.
    log().info(
      `email not sent: SMTP isn't configured (PQ_SMTP_HOST unset).\nTo: ${to}\nSubject: ${subject}\n\n${text}`
    );
    return { status: "success", statusCode: 200 };
  }
  try {
    await mailTransport.sendMail({
      from: config.PQ_EMAIL_FROM,
      to,
      subject,
      text,
      html,
    });
  } catch (err) {
    return unexpectedErrorResult("sendEmail", err);
  }
  return { status: "success", statusCode: 200 };
}

import nodemailer from "nodemailer";
import { config } from "../config.js";

let transport = null;

/**
 * Gets the SMTP transport, creating it on first use. Returns null if SMTP is
 * not configured, in which case messages are written to the console in
 * development and rejected otherwise.
 * @returns {import("nodemailer").Transporter | null} the transport, or null
 */
function getTransport() {
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
 * @param {object} message the message to send
 * @param {string} message.to the recipient email address
 * @param {string} message.subject the subject of the message
 * @param {string} message.text the plain text body of the message
 * @param {string | undefined} message.html the HTML body of the message, if any
 * @returns {Promise<object>} a response object containing a status, status code, and message
 */
export async function sendEmail({ to, subject, text, html }) {
  const mailTransport = getTransport();
  if (!mailTransport) {
    if (config.PQ_RUNTIME_ENVIRONMENT !== "development") {
      // Never write message bodies (which may contain reset links) to
      // production logs.
      console.error("SMTP not configured (PQ_SMTP_HOST unset); email not sent");
      return {
        status: "error",
        statusCode: 500,
        message: "Email delivery is not configured",
      };
    }
    console.log(
      `SMTP not configured (PQ_SMTP_HOST unset); email not sent.\nTo: ${to}\nSubject: ${subject}\n\n${text}`
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
    return { status: "error", statusCode: 500, message: err.message };
  }
  return { status: "success", statusCode: 200 };
}

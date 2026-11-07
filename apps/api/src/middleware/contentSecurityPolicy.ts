import type { IncomingMessage } from "http";
import helmet from "helmet";
import { config } from "../config.js";

/**
 * Gets the address of this site's websocket, for live updates. Browsers
 * that predate CSP Level 3 don't count websockets as 'self'.
 * @param req the request
 * @returns the websocket origin, or 'self' if the host isn't known
 */
function websocketOrigin(req: IncomingMessage): string {
  const base = config.PQ_BASE_URL ? new URL(config.PQ_BASE_URL) : undefined;
  const host = base?.host ?? req.headers.host ?? "";
  if (!/^[a-z0-9.-]+(:\d+)?$/i.test(host)) {
    return "'self'";
  }
  const secure = base
    ? base.protocol === "https:"
    : config.PQ_RUNTIME_ENVIRONMENT !== "development";
  return `${secure ? "wss" : "ws"}://${host}`;
}

/**
 * The Content Security Policy: which sources pages may load scripts,
 * styles, and other content from. Scripts must come from this site or carry
 * the response's nonce, so a script injected into a page doesn't run.
 */
export const contentSecurityPolicy = helmet.contentSecurityPolicy({
  useDefaults: false,
  directives: {
    defaultSrc: ["'self'"],
    // Only files from this site: the React app has no inline scripts.
    scriptSrc: ["'self'"],
    scriptSrcAttr: ["'none'"],
    styleSrc: ["'self'"],
    // Puzzle text is Markdown, which may show images from other sites; the
    // puzzle editor previews files the admin picks as blob: URLs; QR codes
    // are data: URLs.
    imgSrc: ["'self'", "data:", "blob:", "https:"],
    mediaSrc: ["'self'", "blob:"],
    connectSrc: ["'self'", websocketOrigin],
    workerSrc: ["'self'"],
    fontSrc: ["'self'"],
    objectSrc: ["'none'"],
    baseUri: ["'self'"],
    formAction: ["'self'"],
    frameAncestors: ["'none'"],
    // Development runs over plain HTTP, which this would break.
    upgradeInsecureRequests:
      config.PQ_RUNTIME_ENVIRONMENT === "development" ? null : [],
  },
});

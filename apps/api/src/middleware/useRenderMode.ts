import type { RequestHandler } from "express";

/** How a page shows its subject: read-only, as an editor, or as a new one. */
export const RenderMode = {
  DISPLAY: "display",
  EDIT: "edit",
  CREATE: "create",
} as const;
export type RenderMode = (typeof RenderMode)[keyof typeof RenderMode];

/**
 * Creates middleware that records how the page should be rendered, in
 * req.renderMode.
 * @param renderMode how the page should be rendered
 * @returns the middleware
 */
export function useRenderMode(renderMode: RenderMode): RequestHandler {
  return (req, res, next) => {
    req.renderMode = renderMode;
    next();
  };
}

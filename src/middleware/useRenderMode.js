export const RenderMode = {
  DISPLAY: "display",
  EDIT: "edit",
  CREATE: "create"
}

export function useRenderMode(renderMode) {
  return (req, res, next) => {
    req.renderMode = renderMode;
    next();
  }
}

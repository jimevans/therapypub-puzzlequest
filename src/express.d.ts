// Properties that this application's middleware adds to Express requests.
import "express-serve-static-core";

declare module "express-serve-static-core" {
  interface Request {
    /**
     * The signed-in user, or null for an anonymous request. Set by the
     * authenticateSession middleware.
     */
    user?: import("./services/user.service.js").SessionUser | null;
    /**
     * The token of the session the request presented, when it is valid. Set
     * by the authenticateSession middleware.
     */
    sessionToken?: string;
    /** The text of a scanned QR code. Set by the readQRCode middleware. */
    qrCodeData?: string;
    /** How the page should be rendered. Set by the useRenderMode middleware. */
    renderMode?: import("./middleware/useRenderMode.js").RenderMode;
  }
}

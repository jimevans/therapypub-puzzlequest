// Properties that this application's middleware adds to Express requests.
import "express-serve-static-core";

declare module "express-serve-static-core" {
  interface Request {
    /**
     * The user identified by a valid authentication token, or null for an
     * anonymous request. Set by the tokenAuthenticate middleware.
     */
    user?: import("./middleware/tokenAuthentication.js").TokenUser | null;
    /** The text of a scanned QR code. Set by the readQRCode middleware. */
    qrCodeData?: string;
    /** How the page should be rendered. Set by the useRenderMode middleware. */
    renderMode?: import("./middleware/useRenderMode.js").RenderMode;
  }
}

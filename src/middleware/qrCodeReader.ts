import type { NextFunction, Request, Response } from "express";
import jsQR from "jsqr";

/**
 * Reads the activation code from a scanned QR code image, if the request
 * includes one, into req.qrCodeData and req.body.activationCode. The image is
 * the raw RGBA pixels of the camera frame, with its width and height in the
 * body.
 * @param req the request
 * @param res the response
 * @param next the next handler
 */
export async function readQRCode(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  if (req.file && req.body && req.body.width && req.body.height) {
    const imageBuffer = new Uint8ClampedArray(req.file.buffer);
    // @ts-expect-error -- jsqr's type definitions describe an ES module
    // default export, but its CommonJS entry point exports the function itself.
    const code = jsQR(imageBuffer, req.body.width, req.body.height);
    if (code && code.data) {
      req.qrCodeData = code.data;
      req.body.activationCode = code.data;
    }
  }
  next();
}

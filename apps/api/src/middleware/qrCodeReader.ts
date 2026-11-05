import jsQR from "jsqr";

/**
 * Reads the activation code from a scanned QR code image: the raw RGBA
 * pixels of a camera frame.
 * @param pixels the frame's pixels
 * @param width the frame's width, in pixels
 * @param height the frame's height, in pixels
 * @returns the code the QR code holds, or undefined if none can be read
 */
export function readQRCode(
  pixels: Buffer,
  width: number,
  height: number
): string | undefined {
  // The size comes from the client, so it must match the pixels sent.
  if (pixels.length !== width * height * 4) {
    return undefined;
  }
  // @ts-expect-error -- jsqr's type definitions describe an ES module
  // default export, but its CommonJS entry point exports the function itself.
  const code = jsQR(new Uint8ClampedArray(pixels), width, height);
  return code?.data || undefined;
}

import jsQR from "jsqr";

/**
 * Looks for a QR code in a picture. It's in a file of its own so that the
 * decoder downloads only when a player starts scanning.
 * @param image the picture
 * @returns what the code says, or null if there's no readable code
 */
export function decodeQr(image: {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}): string | null {
  // Printed codes are dark on light, and not looking for the reverse takes half
  // the time, which matters on a phone reading several frames a second.
  const code = jsQR(image.data, image.width, image.height, {
    inversionAttempts: "dontInvert",
  });
  return code?.data || null;
}

import QRCode from "qrcode";
import { describe, expect, it } from "vitest";
import { decodeQr } from "./decodeQr";

const QUIET_ZONE = 4;

/**
 * Draws a QR code as a camera frame would show it.
 * @param text what the code says
 * @param scale how many pixels each of its squares takes
 * @returns the picture
 */
function pictureOf(text: string, scale = 4) {
  const { modules } = QRCode.create(text, { errorCorrectionLevel: "M" });
  const width = (modules.size + 2 * QUIET_ZONE) * scale;
  const data = new Uint8ClampedArray(width * width * 4).fill(255);
  for (let y = 0; y < modules.size * scale; y++) {
    for (let x = 0; x < modules.size * scale; x++) {
      if (modules.get(Math.floor(y / scale), Math.floor(x / scale))) {
        const offset =
          ((y + QUIET_ZONE * scale) * width + x + QUIET_ZONE * scale) * 4;
        data.fill(0, offset, offset + 3);
      }
    }
  }
  return { data, width, height: width };
}

describe("decodeQr", () => {
  it("reads what a code says", () => {
    expect(decodeQr(pictureOf("riddle-code"))).toBe("riddle-code");
  });

  it("reads the kind of code the server generates: 32 random characters", () => {
    const code = "f3a9c1d27b644e109a550c2d8e6b1a47";

    expect(decodeQr(pictureOf(code))).toBe(code);
  });

  it("finds nothing in a picture with no code", () => {
    const blank = {
      data: new Uint8ClampedArray(640 * 480 * 4).fill(200),
      width: 640,
      height: 480,
    };

    expect(decodeQr(blank)).toBeNull();
  });
});

import jsQR from "jsqr";

export async function readQRCode(req, res, next) {
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

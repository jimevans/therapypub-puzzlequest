import jsQR from "jsqr";

export async function readQRCode(req, res, next) {
  if (req.file && req.body && req.body.width && req.body.height) {
    const imageBuffer = new Uint8ClampedArray(req.file.buffer);
    const code = jsQR(imageBuffer, req.body.width, req.body.height);
    if (code && code.data) {
      req.qrCodeData = code.data;
    }
  }
  next();
}

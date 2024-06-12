import jsQR from "jsqr";

export function activatePuzzle(req, res) {
  res.render("activate");
}

export async function receiveImageData(req, res) {
  const imageBuffer = new Uint8ClampedArray(req.file.buffer);
  const code = jsQR(imageBuffer, req.body.width, req.body.height);
  if (code) {
    console.log(`${code.data}`);
  } else {
    console.log("No QR code found in image");
  }
  res.send(JSON.stringify({ status: "success", receivedDataLength: imageBuffer.length }));
}


export function activatePuzzle(req, res) {
  res.render("activate");
}

export function receiveImageData(req, res) {
  const imageLength = req.body.length;
  console.log(`Received image data of length ${imageLength}`);
  res.send(JSON.stringify({ status: "success", receivedDataLength: imageLength }));
}

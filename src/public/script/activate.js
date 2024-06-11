
function takepicture() {
  const canvas = document.querySelector("#canvas");
  const context = canvas.getContext("2d");
  if (width && height) {
    canvas.width = width;
    canvas.height = height;
    context.drawImage(video, 0, 0, width, height);

    const imageData = context.getImageData(0, 0, width, height);
    return imageData.data;
  }
}


document.querySelector("#video").addEventListener(
  "canplay",
  (e) => {
    if (!streaming) {
      const element = e.target;
      height = (element.videoHeight / element.videoWidth) * width;

      element.setAttribute("width", width);
      element.setAttribute("height", height);
      const canvas = document.querySelector("#canvas");
      canvas.setAttribute("width", width);
      canvas.setAttribute("height", height);
      streaming = true;
    }
  },
  false
);

document.querySelector("#startbutton").addEventListener(
  "click",
  async (ev) => {
    ev.preventDefault();
    const imageData = takepicture();
    try {
      const response = await fetch(`/api/puzzle/activate`, {
        method: "post",
        headers: {
          "Content-Type": "application/octet-stream"
        },
        body: imageData
      });
      if (response.ok) {
        return await response.json();
      } else {
        const responseData = await response.json();
        if ("error" in responseData) {
          console.log(
            `${response.status} received with error ${responseData.error}`
          );
        }
      }
    } catch (err) {
      console.log("error: " + err);
    }
  },
  false,
);

let width = 320;
let height = 240;
let streaming = false;
navigator.mediaDevices
  .getUserMedia({
    video: true,
    audio: false
  })
  .then((stream) => {
    video.srcObject = stream;
    video.onloadedmetadata = function(e) {
      video.play()
    }
  })
  .catch((err) => {
    alert(`An error occurred: ${err}`);
  });

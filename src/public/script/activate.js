
function takepicture() {
  const canvas = document.querySelector("#canvas");
  const context = canvas.getContext("2d");
  if (width && height) {
    canvas.width = width;
    canvas.height = height;
    context.drawImage(video, 0, 0, width, height);

    return context.getImageData(0, 0, width, height);
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
    const formData = new FormData();
    formData.append("height", imageData.height);
    formData.append("width", imageData.width);
    formData.append("image", new Blob([imageData.data.buffer]));
    try {
      const response = await fetch(`/api/puzzle/activate`, {
        method: "post",
        headers: {
        },
        body: formData
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

let width = 640;
let height = 480;
let streaming = false;
navigator.mediaDevices
  .getUserMedia({
    video: { facingMode: "environment" },
    audio: false
  })
  .then((stream) => {
    video.srcObject = stream;
    video.onloadedmetadata = function(e) {
      video.play();
    }
  })
  .catch((err) => {
    alert(`An error occurred: ${err}`);
  });

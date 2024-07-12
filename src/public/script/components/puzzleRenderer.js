const PuzzleKind = {
  Text: 0,
  Image: 1,
  Audio: 2,
  Video: 3
}

/**
 * Renders a puzzle during authoring.
 */
class PuzzleRenderer {
  #rendererElement = document.createElement("div");
  #puzzleKind = PuzzleKind.Text;

  /**
   * Initializes a new instance of the PuzzleRenderer class.
   */
  constructor() {
  }

  #renderImage(puzzleContent, isEditable) {
    const renderElements = [];
    const imageElement = document.createElement("img");
    if (puzzleContent.length) {
      imageElement.src = puzzleContent;
      imageElement.width = 640;
      imageElement.height = 480;
    } else {
      imageElement.classList.add("pq-hide");
    }
    if (isEditable) {
      const imageUploadElement = document.createElement("input");
      imageUploadElement.type = "file";
      imageUploadElement.addEventListener("change", (e) => {
        imageElement.src = URL.createObjectURL(e.target.files[0]);
        imageElement.classList.remove("pq-hide");
      });
      const uploadElementDiv = document.createElement("div");
      uploadElementDiv.appendChild(imageUploadElement);
      renderElements.push(uploadElementDiv);
    }
    renderElements.push(imageElement);
    return renderElements;
  }

  #renderAudio(puzzleContent, isEditable) {
    const renderElements = [];
    const audioElement = document.createElement("audio");
    audioElement.controls = true;
    if (puzzleContent.length) {
      audioElement.src = puzzleContent;
    } else {
      audioElement.classList.add("pq-hide");
    }
    if (isEditable) {
      const audioUploadElement = document.createElement("input");
      audioUploadElement.type = "file";
      audioUploadElement.addEventListener("change", (e) => {
        audioElement.src = URL.createObjectURL(e.target.files[0]);
        audioElement.classList.remove("pq-hide");
      });
      const uploadElementDiv = document.createElement("div");
      uploadElementDiv.appendChild(audioUploadElement);
      renderElements.push(uploadElementDiv);
    }
    renderElements.push(audioElement);
    return renderElements;
  }

  #renderVideo(puzzleContent, isEditable) {
    const renderElements = [];
    const videoElement = document.createElement("video");
    videoElement.controls = true;
    if (puzzleContent.length) {
      videoElement.src = puzzleContent;
      videoElement.width = 640;
      videoElement.height = 480;
    } else {
      videoElement.classList.add("pq-hide");
    }
    if (isEditable) {
      const videoUploadElement = document.createElement("input");
      videoUploadElement.type = "file";
      videoUploadElement.addEventListener("change", (e) => {
        videoElement.src = URL.createObjectURL(e.target.files[0]);
        videoElement.classList.remove("pq-hide");
      });
      const uploadElementDiv = document.createElement("div");
      uploadElementDiv.appendChild(videoUploadElement);
      renderElements.push(uploadElementDiv);
    }
    renderElements.push(videoElement);
    return renderElements;
  }

  #renderMarkdown(puzzleContent, isEditable) {
    const renderElements = [];
    if (isEditable) {
      const textAreaElement = document.createElement("textarea");
      textAreaElement.value = puzzleContent;
      textAreaElement.addEventListener("input", (e) => {
        marked.use({ gfm: true });
        renderedHtmlElement.innerHTML = marked.parse(e.target.value);
      });
      renderElements.push(textAreaElement);
    }
    const renderedHtmlElement = document.createElement("div");
    marked.use({ gfm: true });
    renderedHtmlElement.innerHTML = marked.parse(puzzleContent);
    renderElements.push(renderedHtmlElement);
    return renderElements;
  }

  getPuzzleData() {
    if (this.#puzzleKind !== PuzzleKind.Text) {
      const uploadElement = this.#rendererElement.querySelector("input[type='file']");
      if (uploadElement) {
        if (!uploadElement.files.length) {
          return null;
        }
        return uploadElement.files[0];
      }
    }
     return this.#rendererElement.querySelector("textarea").value;
  }

  /**
   * Renders the puzzle definition during authoring.
   * @param {number} puzzleType the type of the puzzle
   * @param {string} puzzleContent the content of the puzzle definition
   * @param {boolean} isEditable true if the puzzle definition is editable; otherwise false
   */
  render(puzzleType = 0, puzzleContent = "", isEditable = false) {
    this.#puzzleKind = puzzleType;
    const renderElements = [];
    switch (puzzleType) {
      case (PuzzleKind.Image):
        renderElements.push(...this.#renderImage(puzzleContent, isEditable));
        break;
      case (PuzzleKind.Audio):
        renderElements.push(...this.#renderAudio(puzzleContent, isEditable));
        break;
      case (PuzzleKind.Video):
        renderElements.push(...this.#renderVideo(puzzleContent, isEditable));
        break;
      default:
        renderElements.push(...this.#renderMarkdown(puzzleContent, isEditable));
    }
    this.#rendererElement.replaceChildren(...renderElements);
  }

  /**
   * Gets the root element of the puzzle renderer.
   * @returns {Element} the root element of the puzzle renderer
   */
  getElement() {
    return this.#rendererElement;
  }
}

export { PuzzleRenderer }

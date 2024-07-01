class Modal {
  #overlayElement;
  #modal = document.createElement("article");
  #modalHeader = document.createElement("header");
  #modalBody = document.createElement("div");
  #modalTitleElement = document.createElement("h2");
  #modalFooter = document.createElement("footer");
  #buttonCount;

  constructor(buttonCount = 2) {
    this.#buttonCount = buttonCount;
    this.#overlayElement = document.querySelector(".pq-modal-overlay");
    if (!this.#overlayElement) {
      this.#overlayElement = document.createElement("div");
      this.#overlayElement.classList.add("pq-modal-overlay");

      this.#modal.classList.add("pq-modal");
      this.#createCloseButton();
      this.#createModalHeader();
      this.#createModalBody();
      this.#createModalFooter();

      this.#overlayElement.appendChild(this.#modal);

      document.querySelector("body").appendChild(this.#overlayElement);
    }
  }

  #createCloseButton() {
    const closeButton = document.createElement("button");
    closeButton.classList.add("pq-modal-close-button");
    closeButton.addEventListener("click", (e) => {
      e.stopPropagation();
      this.hide();
    });
    this.#modal.appendChild(closeButton);
  }

  #createModalHeader() {
    this.#modalHeader.classList.add("pq-modal-header");
    this.#modalHeader.appendChild(this.#modalTitleElement);
    this.#modal.appendChild(this.#modalHeader);
  }

  #createModalBody() {
    this.#modalBody.classList.add("pq-modal-body");
    this.#modal.appendChild(this.#modalBody);
  }

  #createModalFooter() {
    this.#modalFooter.classList.add("pq-modal-footer");
    const confirmButton = document.createElement("button");
    confirmButton.classList.add("pq-button");
    confirmButton.setAttribute("data-action", "confirm")
    confirmButton.innerText = "OK";
    confirmButton.addEventListener("click", (e) => {
      e.stopPropagation();
      this.hide();
      this.onConfirmButtonClick(e);
    });
    this.#modalFooter.appendChild(confirmButton);

    const cancelButton = document.createElement("button");
    cancelButton.classList.add("pq-button");
    if (this.#buttonCount < 2) {
      cancelButton.classList.add("pq-hide");
    }
    cancelButton.setAttribute("data-action", "cancel")
    cancelButton.innerText = "Cancel";
    cancelButton.addEventListener("click", (e) => {
      e.stopPropagation();
      this.hide();
      this.onCancelButtonClick(e);
    });
    this.#modalFooter.appendChild(cancelButton);

    this.#modal.appendChild(this.#modalFooter);
  }

  onConfirmButtonClick = (e) => { };

  onCancelButtonClick = (e) => { };

  setTitle(title) {
    this.#modalTitleElement.innerText = title;
  }

  setConfirmButtonText(text) {
    this.#modalFooter.querySelector("button.pq-button[data-action='confirm']").innerText = text;
  }

  setCancelButtonText(text) {
    this.#modalFooter.querySelector("button.pq-button[data-action='cancel']").innerText = text;
  }

  setBodyContent(bodyElement) {
    this.#modalBody.replaceChildren(bodyElement);
  }

  show() {
    this.#overlayElement.classList.add("pq-modal-overlay-open");
  }

  hide() {
    this.#overlayElement.classList.remove("pq-modal-overlay-open");
  }
}

export { Modal }

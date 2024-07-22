/**
 * Renders a modal dialog in the web page.
 */
class Modal {
  #overlayElement;
  #modal;
  #modalHeader;
  #modalBody;
  #modalTitleElement;
  #modalFooter;
  #buttonCount;

  /**
   * Initializes a new instance of the Modal class.
   * @param {number} buttonCount the number of buttons in the footer of the dialog
   */
  constructor(buttonCount = 2) {
    this.#buttonCount = buttonCount;
    this.#overlayElement = document.querySelector(".pq-modal-overlay");
    if (!this.#overlayElement) {
      this.#overlayElement = document.createElement("div");
      this.#overlayElement.classList.add("pq-modal-overlay");
      document.querySelector("body").appendChild(this.#overlayElement);
    }

    this.#modal = document.createElement("article");
    this.#modal.classList.add("pq-modal");

    this.#createModalHeader();
    this.#createModalBody();
    this.#createModalFooter();
    this.#overlayElement.replaceChildren(this.#modal);
  }

  #createCloseButton() {
    const closeButton = document.createElement("button");
    closeButton.classList.add("pq-modal-close-button");
    closeButton.addEventListener("click", (e) => {
      e.stopPropagation();
      this.hide();
    });
    return closeButton;
  }

  #createModalHeader() {
    this.#modalHeader = document.createElement("header");
    this.#modalHeader.classList.add("pq-modal-header");
    this.#modalTitleElement = document.createElement("h4");
    this.#modalHeader.appendChild(this.#modalTitleElement);
    this.#modalHeader.appendChild(this.#createCloseButton());
    this.#modal.appendChild(this.#modalHeader);
  }

  #createModalBody() {
    this.#modalBody = document.createElement("div");
    this.#modalBody.classList.add("pq-modal-body");
    this.#modal.appendChild(this.#modalBody);
  }

  #createModalFooter() {
    this.#modalFooter = document.createElement("footer");
    this.#modalFooter.classList.add("pq-modal-footer");
    const confirmButton = document.createElement("button");
    confirmButton.classList.add("pq-modal-footer-button");
    confirmButton.setAttribute("data-action", "confirm")
    confirmButton.innerText = "OK";
    confirmButton.addEventListener("click", (e) => {
      e.stopPropagation();
      this.hide();
      this.onConfirmButtonClick(e);
    });
    this.#modalFooter.appendChild(confirmButton);

    const cancelButton = document.createElement("button");
    cancelButton.classList.add("pq-modal-footer-button");
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

  /**
   * Callback called when the confirm button is clicked.
   * @param {Event} e the event data from the click event of the confirm button
   */
  onConfirmButtonClick = (e) => { };

  /**
   * Callback called when the cancel button is clicked.
   * @param {Event} e the event data from the click event of the cancel button
   */
  onCancelButtonClick = (e) => { };

  /**
   * Sets the title of the modal dialog.
   * @param {string} title the title of the modal dialog
   */
  setTitle(title) {
    this.#modalTitleElement.innerText = title;
  }

  /**
   * Sets the text of the confirm button.
   * @param {string} text the text of the confirm button
   */
  setConfirmButtonText(text) {
    this.#modalFooter.querySelector("button.pq-modal-footer-button[data-action='confirm']").innerText = text;
  }

  /**
   * Sets the text of the cancel button.
   * @param {string} text the text of the cancel button
   */
  setCancelButtonText(text) {
    this.#modalFooter.querySelector("button.pq-modal-footer-button[data-action='cancel']").innerText = text;
  }

  /**
   * Sets the body content of the modal dialog.
   * @param {Element} bodyElement the element containing the body content of the modal dialog
   */
  setBodyContent(bodyElement) {
    this.#modalBody.replaceChildren(bodyElement);
  }

  /**
   * Shows the modal dialog.
   */
  show() {
    this.#overlayElement.classList.add("pq-modal-overlay-open");
  }

  /**
   * Hides the modal dialog.
   */
  hide() {
    this.#overlayElement.classList.remove("pq-modal-overlay-open");
  }
}

export { Modal }

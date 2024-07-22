/**
 * A class for helping compose text messages to be sent via SMS.
 */
class TextMessageComposer {
  #rootElement = document.createElement("div");
  #messageElement = document.createElement("textarea");
  #responseElement = document.createElement("input");
  #confirmationElement = document.createElement("input");
  #errorElement = document.createElement("div");

  constructor() {
    this.#rootElement.appendChild(this.#createMessageElement());
    this.#rootElement.appendChild(this.#createResponseElement());
    this.#rootElement.appendChild(this.#createConfirmationElement());

    this.#errorElement.classList.add("pq-hide");
    this.#rootElement.appendChild(this.#errorElement);
  }

  #createMessageElement() {
    this.#messageElement.rows = 5;
    this.#messageElement.cols = 60;

    const messageWrapper = document.createElement("div");
    messageWrapper.classList.add("pq-form-element");

    const labelWrapper = document.createElement("div");
    labelWrapper.classList.add("pq-label");
    const label = document.createElement("label");
    label.htmlFor = "message";
    label.innerText = "Message to send (limit 100 characters):";
    labelWrapper.appendChild(label);

    const contentWrapper = document.createElement("div");
    contentWrapper.classList.add("pq-input");
    contentWrapper.appendChild(this.#messageElement);
    this.#messageElement.addEventListener("change", (e) => {
      this.#errorElement.classList.add("pq-hide");
    });

    messageWrapper.appendChild(labelWrapper);
    messageWrapper.appendChild(contentWrapper);
    return messageWrapper;
  }

  #createResponseElement() {
    const responseWrapper = document.createElement("div");
    responseWrapper.classList.add("pq-form-element");

    const labelWrapper = document.createElement("div");
    labelWrapper.classList.add("pq-label");
    const label = document.createElement("label");
    label.htmlFor = "response";
    label.innerText = "Expected response:";
    labelWrapper.appendChild(label);

    const contentWrapper = document.createElement("div");
    contentWrapper.classList.add("pq-input");
    contentWrapper.appendChild(this.#responseElement);

    responseWrapper.appendChild(labelWrapper);
    responseWrapper.appendChild(contentWrapper);
    return responseWrapper;
  }

  #createConfirmationElement() {
    const confirmationWrapper = document.createElement("div");
    confirmationWrapper.classList.add("pq-form-element");

    const labelWrapper = document.createElement("div");
    labelWrapper.classList.add("pq-label");
    const label = document.createElement("label");
    label.htmlFor = "response";
    label.innerText = "Response confirmation:";
    labelWrapper.appendChild(label);

    const contentWrapper = document.createElement("div");
    contentWrapper.classList.add("pq-input");
    contentWrapper.appendChild(this.#confirmationElement);

    confirmationWrapper.appendChild(labelWrapper);
    confirmationWrapper.appendChild(contentWrapper);
    return confirmationWrapper;
  }

  /**
   * Gets the root element of the component.
   * @returns {Element} the root element of the component
   */
  getElement() {
    return this.#rootElement;
  }

  /**
   * Gets the message to send.
   * @returns the message to send
   */
  getMessage() {
    if (!this.#messageElement.value) {
      this.setError("No message to send");
      this.#errorElement.classList.remove("pq-hide");
      return "";
    }

    if (this.#messageElement.value.length > 100) {
      this.setError("Message is limited to 100 characters due to regulatory oversight");
      this.#errorElement.classList.remove("pq-hide");
      return "";
    }

    return this.#messageElement.value;
  }

  /**
   * Gets the expected response to the sent message.
   * @returns the expected response to the sent message
   */
  getExpectedResponse() {
    return this.#responseElement.value ? this.#responseElement.value : "";
  }

  /**
   * Gets the confirmation of the expected response.
   * @returns the confirmation of the expected response
   */
  getResponseConfirmation() {
    return this.#confirmationElement.value ? this.#confirmationElement.value : "";
  }

  /**
   * Sets the text of an error.
   * @param {string} errorText the text of the error
   */
  setError(errorText) {
    this.#errorElement.innerText = errorText;
    this.#errorElement.classList.remove("pq-hide");
  }
}

export { TextMessageComposer };

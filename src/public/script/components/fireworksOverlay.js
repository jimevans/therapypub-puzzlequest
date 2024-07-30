
/**
 * A class for overlaying a fireworks display.
 */
class FireworksOverlay {
  #fireworks = document.createElement("div");
  #textElement = document.createElement("div");

  /**
   * Initializes a new instance of the FireworksOverlay class.
   */
  constructor() {
    this.#fireworks.id = "fireworks";
    this.#createFireworksElements();
    this.#configureTextElement();
    this.#fireworks.addEventListener("click", (e) => {
      e.preventDefault();
      const el = e.currentTarget;
      el.classList.add("pq-hide");
    });
  }

  #createFireworksElements() {
    const before = document.createElement("div");
    before.classList.add("pq-before");
    const after = document.createElement("div");
    after.classList.add("pq-after");
    this.#fireworks.appendChild(before);
    this.#fireworks.appendChild(after);
  }

  #configureTextElement(text) {
    this.#textElement.classList.add("pq-fireworks-text");
    this.#fireworks.appendChild(this.#textElement);
  }

  /**
   * Renders the overlay
   * @param {string} text the text to display over the fireworks
   * @param {number} autoDisappear the time, in milliseconds, after which the overlay is hidden
   */
  render(text, autoDisappear) {
    this.#textElement.innerText = text;
    document.querySelector("body").appendChild(this.#fireworks);
    if (autoDisappear) {
      setTimeout(() => this.#fireworks.classList.add("pq-hide"), autoDisappear);
    }
    this.#fireworks.classList.add("pq-fireworks");
  }
}

export { FireworksOverlay }

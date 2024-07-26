import { DataGrid } from "./grid.js";
import { Modal } from "./modal.js";
import { callDataApi } from "../fetch.js";

/**
 * A modal dialog that contains a data grid for selecting items.
 */
class Lookup extends Modal {
  #grid;
  #additionalBody = document.createElement("div");

  /**
   * Initializes a new instance of the Lookup class.
   * @param {string} lookupCaption the caption of the grid in the dialog
   * @param {object[]} columnDefinitions an array containing objects describing column definitions for the lookup grid
   * @param {boolean} selectMultiple true to allow selecting multiple items in the grid; otherwise false
   */
  constructor(lookupCaption, columnDefinitions, selectMultiple) {
    super();
    const gridOptions = {
      showTitle: false,
      allowCreation: false,
      allowRowSelecting: selectMultiple
        ? DataGrid.ROW_SELECTION_MULTIPLE
        : DataGrid.ROW_SELECTION_SINGLE,
      allowRowDeleting: false,
      allowRowEditing: false,
      allowRowReordering: false,
    };
    this.setTitle(lookupCaption);
    this.#grid = new DataGrid("", columnDefinitions, gridOptions);
  }

  async #getData(apiEndpoint) {
    return await callDataApi(apiEndpoint, "get");
  }

  /**
   * Renders the data in the lookup grid.
   * @param {string} dataRetrievalUri the URL to call to retrieve the data for the grid
   * @param {string} responseDataField the field in the response from the URL containing the grid data
   */
  async render(dataRetrievalUri, responseDataField) {
    const gridDataResponse = await this.#getData(dataRetrievalUri);
    if (gridDataResponse && gridDataResponse.status === "success") {
      if (responseDataField in gridDataResponse) {
        const wrapper = document.createElement("div");
        this.#grid.render(gridDataResponse[responseDataField]);
        wrapper.appendChild(this.#grid.getElement());
        wrapper.appendChild(this.#additionalBody);
        this.setBodyContent(wrapper);
      }
    }
  }

  /**
   * Sets additional content in the modal dialog rendered below the grid.
   * @param {Element} additionalBodyElement the element containing the additional content
   */
  setAdditionalBodyContent(additionalBodyElement) {
    this.#additionalBody.replaceChildren(additionalBodyElement);
  }

  /**
   * Gets the element containing the additional body content.
   * @returns {Element} the element containing the additional body content
   */
  getAdditionalBodyElement() {
    return this.#additionalBody;
  }

  /**
   * Gets the data selected in the lookup grid.
   * @returns {object[]} an array of objects representing the selected data in the lookup grid
   */
  getSelectedData() {
    const selectedData = [];
    let index = 0;
    [...this.#grid.getElement().querySelectorAll("tbody tr")].forEach((row) => {
      if (row.hasAttribute("data-row-selected")) {
        selectedData.push(this.#grid.getData()[index]);
      }
      index++;
    });
    return selectedData;
  }
}

export { Lookup };

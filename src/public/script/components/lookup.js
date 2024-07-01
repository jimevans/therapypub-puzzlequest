import { DataGrid } from "./grid.js";
import { Modal } from "./modal.js";

class Lookup extends Modal {
  #grid = new DataGrid();

  constructor() {
    super();
    this.#grid.allowCreation = false;
    this.#grid.allowRowSelecting = true;
    this.#grid.allowRowDeleting = false;
    this.#grid.allowRowEditing = false;
    this.#grid.allowRowReordering = false;
  }

  async #getData(apiEndpoint) {
    try {
      const response = await fetch(apiEndpoint, {
        method: "get",
        headers: {
          "Content-Type": "application/json",
        },
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
  }

  async initialize(caption, dataRetrievalUri, responseDataField, gridColumnDefinitions) {
    const gridDataResponse = await this.#getData(dataRetrievalUri);
    if (gridDataResponse && gridDataResponse.status === "success") {
      if (responseDataField in gridDataResponse) {
        this.#grid.initialize(caption, gridColumnDefinitions, gridDataResponse[responseDataField]);
        this.setBodyContent(this.#grid.getElement());
      }
    }
  }

  getSelectedData() {
    const selectedData = [];
    let index = 0;
    [...this.#grid.getElement().querySelectorAll("tbody tr")].forEach(row => {
      if (row.hasAttribute("data-row-selected")) {
        selectedData.push(this.#grid.getData()[index]);
      }
      index++;
    });
    return selectedData;
  }
}

export { Lookup }

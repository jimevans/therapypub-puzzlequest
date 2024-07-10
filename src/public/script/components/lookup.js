import { DataGrid } from "./grid.js";
import { Modal } from "./modal.js";

class Lookup extends Modal {
  #grid;

  constructor(lookupCaption, columnDefinitions, selectMultiple) {
    super();
    const gridOptions = {
      showTitle: false,
      allowCreation: false,
      allowRowSelecting: selectMultiple ? DataGrid.ROW_SELECTION_MULTIPLE : DataGrid.ROW_SELECTION_SINGLE,
      allowRowDeleting: false,
      allowRowEditing: false,
      allowRowReordering: false,
    }
    this.setTitle(lookupCaption);
    this.#grid = new DataGrid("", columnDefinitions, gridOptions);
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
        if (responseData.status === "error") {
          console.log(
            `${response.status} received with error ${responseData.message}`
          );
        }
      }
    } catch (err) {
      console.log("error: " + err);
    }
  }

  async render(dataRetrievalUri, responseDataField) {
    const gridDataResponse = await this.#getData(dataRetrievalUri);
    if (gridDataResponse && gridDataResponse.status === "success") {
      if (responseDataField in gridDataResponse) {
        this.#grid.render(gridDataResponse[responseDataField]);
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

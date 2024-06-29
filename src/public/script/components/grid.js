/**
 * Class for creating a grid for supplied data.
 */
class DataGrid {
  #gridElement = document.createElement("div");
  #gridTable = document.createElement("table");

  allowCreation = true;
  allowRowEditing = true;
  allowRowReordering = true;

  /**
   * Initializes a new instance of the DataGrid class.
   */
  constructor() {
    this.#gridElement.classList.add("pq-grid");
  }

  /**
   * Creates the grid title element.
   * @param {String} titleText the text of the grid title
   * @param {Number} columnCount the number of data columns in the grid
   * @param {String | undefined} createItemUrl the URL for creating a new data item in the grid
   */
  #createGridTitle(titleText, columnCount, createItemUrl) {
    const gridTitleElement = document.createElement("div");
    gridTitleElement.classList.add("pq-grid-title");

    const titleSpan = document.createElement("span");
    titleSpan.classList.add("pq-grid-title-text");
    titleSpan.innerText = titleText;
    gridTitleElement.appendChild(titleSpan);

    if (this.allowCreation && createItemUrl) {
      const createLink = document.createElement("a");
      createLink.classList.add("pq-menu-link", "pq-float-right");
      createLink.href = createItemUrl;
      createLink.innerText = "Create new";
      gridTitleElement.appendChild(createLink);
    }

    gridTitleElement.style.gridColumnEnd = `${columnCount + 2}`;
    this.#gridElement.appendChild(gridTitleElement);
  }

  /**
   * Creates the grid column header element.
   * @param {Object} columnDefinitions an object containing the field definitions
   */
  #createGridHeader(columnDefinitions) {
    const tableHeader = document.createElement("thead");
    const headerRow = document.createElement("tr");
    columnDefinitions.forEach((columnDefinition) => {
      const tableCell = document.createElement("th");
      tableCell.innerText = `${columnDefinition.title}`;
      headerRow.appendChild(tableCell);
    });

    // Add a filler column at the end, if needed
    if (this.allowRowEditing) {
      const buttonEditingHeader = document.createElement("th");
      headerRow.appendChild(buttonEditingHeader);
    }

    tableHeader.appendChild(headerRow);
    this.#gridTable.appendChild(tableHeader);
  }

  #fillGridData(columnDefinitions, gridData) {
    const tableBody = document.createElement("tbody");

    // Create a row for each piece of data.
    gridData.forEach((item) => {
      const dataRow = document.createElement("tr");
      let itemLinkUrl;
      columnDefinitions.forEach((columnDefinition) => {
        const dataCell = document.createElement("td");
        if (columnDefinition.linkTemplate) {
          itemLinkUrl = columnDefinition.linkTemplate.replace(
            `:${columnDefinition.fieldName}`,
            item[columnDefinition.fieldName]
          );
          const link = document.createElement("a");
          link.href = itemLinkUrl;
          link.innerText = item[columnDefinition.fieldName];
          dataCell.appendChild(link);
        } else {
          dataCell.innerText = item[columnDefinition.fieldName];
        }
        dataRow.appendChild(dataCell);
      });

      // Create filler column with delete button at end.
      if (this.allowRowEditing) {
        const fillerColumnDataCell = document.createElement("td");

        if (itemLinkUrl) {
          const deleteButton = document.createElement("button");
          deleteButton.innerText = "Delete";
          deleteButton.addEventListener("click", (e) => {
            e.preventDefault();
            this.onDeleteRequested(itemLinkUrl);
          });
          fillerColumnDataCell.appendChild(deleteButton);
        }
        dataRow.appendChild(fillerColumnDataCell);
      }
      tableBody.appendChild(dataRow);
    });
    this.#gridTable.appendChild(tableBody);
  }

  onDeleteRequested = (itemLinkUrl) => {};

  initialize(titleText, createItemUrl, columnDefinitions, gridData) {
    this.#createGridTitle(titleText, columnDefinitions.length, createItemUrl);
    this.#createGridHeader(columnDefinitions);
    this.#fillGridData(columnDefinitions, gridData);
    this.#gridElement.appendChild(this.#gridTable);
  }

  getElement() {
    return this.#gridElement;
  }
}

export { DataGrid };

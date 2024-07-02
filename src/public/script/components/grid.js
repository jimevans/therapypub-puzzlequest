/**
 * Class for creating a grid for supplied data.
 */
class DataGrid {
  #gridElement = document.createElement("div");
  #gridTable= document.createElement("table");;
  #tableBody = document.createElement("tbody");
  #addNewDataLink = document.createElement("a");
  #titleTextElement = document.createElement("span");
  #gridData = [];
  #columnDefinitions = [];

  allowCreation = true;
  allowRowDeleting = true;
  allowRowEditing = true;
  allowRowReordering = true;
  allowRowSelecting = false;

  /**
   * Initializes a new instance of the DataGrid class.
   */
  constructor(titleText, columnDefinitions) {
    this.#columnDefinitions = columnDefinitions;
  }

  /**
   * Creates the grid title element.
   * @param {String} titleText the text of the grid title
   * @param {String | undefined} createItemUrl the URL for creating a new data item in the grid
   */
  #createGrid(titleText) {
    const gridTitleElement = document.createElement("div");
    gridTitleElement.classList.add("pq-grid-title");

    this.#titleTextElement.classList.add("pq-grid-title-text");
    this.setTitleText(titleText)
    gridTitleElement.appendChild(this.#titleTextElement);

    if (this.allowCreation) {
      this.#addNewDataLink.classList.add("pq-menu-link", "pq-float-right");
      this.#addNewDataLink.href = "#";
      this.#addNewDataLink.innerText = "Create new";
      this.#addNewDataLink.addEventListener("click", (e) => {
        e.stopPropagation();
        this.onAddDataRequested(e);
      })
      gridTitleElement.appendChild(this.#addNewDataLink);
    }

    this.#gridElement.appendChild(gridTitleElement);
    this.#gridElement.appendChild(this.#gridTable);
  }

  #createRow(columnDefinitions) {
    const dataRow = document.createElement("tr");
    if (this.allowRowSelecting) {
      dataRow.addEventListener("click", (e) => {
        e.stopPropagation();
        if (e.currentTarget.hasAttribute("data-row-selected")) {
          e.currentTarget.classList.remove("pq-grid-row-selected");
          e.currentTarget.removeAttribute("data-row-selected");
        } else {
          e.currentTarget.classList.add("pq-grid-row-selected");
          e.currentTarget.setAttribute("data-row-selected", "true");
        }
      });
    }

    columnDefinitions.forEach((columnDefinition) => {
      const dataCell = document.createElement("td");
      dataCell.classList.add("pq-grid-data-cell")
      dataCell.setAttribute("data-field-name", columnDefinition.fieldName);
      dataRow.appendChild(dataCell);
    });

    // Create filler column with delete button at end.
    if (this.allowRowDeleting || this.allowRowEditing) {
      const fillerColumnDataCell = document.createElement("td");
      if (this.allowRowDeleting) {
        const deleteButton = document.createElement("button");
        deleteButton.innerText = "Delete";
        deleteButton.addEventListener("click", (e) => {
          e.preventDefault();
          this.onDeleteDataRequested(e);
        });
        fillerColumnDataCell.appendChild(deleteButton);
      }
      dataRow.appendChild(fillerColumnDataCell);
    }
    return dataRow;
  }

  addDataRow(dataItem, columnDefinitions) {
    const tableRow = this.#createRow(columnDefinitions);
    columnDefinitions.forEach((columnDefinition) => {
      const dataCell = tableRow.querySelector(`td[data-field-name='${columnDefinition.fieldName}']`);
      if (dataCell) {
        if (columnDefinition.linkTemplate) {
          const itemLinkUrl = columnDefinition.linkTemplate.replace(
            `:${columnDefinition.fieldName}`,
            dataItem[columnDefinition.fieldName]
          );
          const link = document.createElement("a");
          link.href = itemLinkUrl;
          link.innerText = dataItem[columnDefinition.fieldName];
          dataCell.appendChild(link);
        } else {
          dataCell.innerText = dataItem[columnDefinition.fieldName];
        }
      }
    });
    this.#tableBody.appendChild(tableRow);
  }

  /**
   * Creates the grid column header element.
   * @param {Object} columnDefinitions an object containing the field definitions
   */
  #populateGridHeader(columnDefinitions) {
    const tableHeader = document.createElement("thead");
    const headerRow = document.createElement("tr");

    columnDefinitions.forEach((columnDefinition) => {
      const tableCell = document.createElement("th");
      tableCell.classList.add("pq-grid-header-cell")
      tableCell.innerText = `${columnDefinition.title}`;
      headerRow.appendChild(tableCell);
    });

    // Add a filler column at the end, if needed
    if (this.allowRowEditing || this.allowRowDeleting) {
      const buttonEditingHeader = document.createElement("th");
      buttonEditingHeader.classList.add("pq-grid-header-cell")
      headerRow.appendChild(buttonEditingHeader);
    }

    tableHeader.appendChild(headerRow);
    this.#gridTable.appendChild(tableHeader);
  }

  #populateGridData(columnDefinitions) {
    this.#gridData.forEach((item) => {
      this.addDataRow(item, columnDefinitions);
    });
    this.#gridTable.appendChild(this.#tableBody);
  }

  #clearGrid() {
    while (this.#gridElement.firstChild) {
      this.#gridElement.removeChild(this.#gridElement.firstChild);
    }
  }

  onDeleteDataRequested = (e) => { };
  onAddDataRequested = (e) => { };

  initialize(titleText, columnDefinitions, gridData) {
    this.#gridData = gridData;
    this.#clearGrid();
    this.#createGrid(titleText);
    this.#populateGridHeader(columnDefinitions);
    this.#populateGridData(columnDefinitions);
  }

  setAddNewDataLinkText(text) {
    this.#addNewDataLink.innerText = text;
  }

  setTitleText(text) {
    this.#titleTextElement.innerText = text;
  }

  getElement() {
    return this.#gridElement;
  }

  getData() {
    return this.#gridData;
  }
}

export { DataGrid };

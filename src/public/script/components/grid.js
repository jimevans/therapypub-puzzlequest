/**
 * Class for creating a grid for supplied data.
 */
class DataGrid {
  #gridElement = document.createElement("div");
  #gridTable;
  #addNewDataLink = document.createElement("a");
  #gridData = {};

  allowCreation = true;
  allowRowDeleting = true;
  allowRowEditing = true;
  allowRowReordering = true;
  allowRowSelecting = false;

  /**
   * Initializes a new instance of the DataGrid class.
   */
  constructor() {
  }

  /**
   * Creates the grid title element.
   * @param {String} titleText the text of the grid title
   * @param {String | undefined} createItemUrl the URL for creating a new data item in the grid
   */
  #createGrid(titleText) {
    const gridTitleElement = document.createElement("div");
    gridTitleElement.classList.add("pq-grid-title");

    const titleSpan = document.createElement("span");
    titleSpan.classList.add("pq-grid-title-text");
    titleSpan.innerText = titleText;
    gridTitleElement.appendChild(titleSpan);

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

    this.#gridTable = document.createElement("table");
    this.#gridElement.appendChild(this.#gridTable);
  }

  /**
   * Creates the grid column header element.
   * @param {Object} columnDefinitions an object containing the field definitions
   */
  #populateGridHeader(columnDefinitions) {
    const tableHeader = document.createElement("thead");
    const headerRow = document.createElement("tr");

    if (this.allowRowSelecting) {
      const selectionColumnHeader = document.createElement("th");
      selectionColumnHeader.classList.add("pq-grid-header-cell")
      headerRow.appendChild(selectionColumnHeader);
    }

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
    const tableBody = document.createElement("tbody");

    // Create a row for each piece of data.
    this.#gridData.forEach((item) => {
      const dataRow = document.createElement("tr");
      if (this.allowRowSelecting) {
        const selectionCell = document.createElement("td");
        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.addEventListener("change", (e) => {
          if (e.target.checked) {
            e.target.parentNode.parentNode.setAttribute("data-row-selected", "true");
          } else {
            e.target.parentNode.parentNode.removeAttribute("data-row-selected");
          }
        });
        selectionCell.appendChild(checkbox);
        dataRow.appendChild(selectionCell);
      }

      let itemLinkUrl;
      columnDefinitions.forEach((columnDefinition) => {
        const dataCell = document.createElement("td");
        dataCell.classList.add("pq-grid-data-cell")
        dataCell.setAttribute("data-field-name", columnDefinition.fieldName);
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
      tableBody.appendChild(dataRow);
    });
    this.#gridTable.appendChild(tableBody);
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
    this.#gridElement.appendChild(this.#gridTable);
  }

  setAddNewDataLinkText(text) {
    this.#addNewDataLink.innerText = text;
  }

  getElement() {
    return this.#gridElement;
  }

  getData() {
    return this.#gridData;
  }
}

export { DataGrid };

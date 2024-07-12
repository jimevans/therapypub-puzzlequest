/**
 * Class for creating a grid for supplied data.
 */
class DataGrid {
  static ROW_SELECTION_NONE = 0;
  static ROW_SELECTION_SINGLE = 1;
  static ROW_SELECTION_MULTIPLE = 2;

  #gridElement = document.createElement("div");
  #gridTable = document.createElement("table");
  #tableBody = document.createElement("tbody");
  #addNewDataLink = document.createElement("a");
  #titleTextElement = document.createElement("span");
  #gridData = [];
  #columnDefinitions = [];
  #draggedRow;

  showTitle = true;
  allowCreation = true;
  allowRowDeleting = true;
  allowRowEditing = false;
  allowRowReordering = false;
  allowRowSelecting = DataGrid.ROW_SELECTION_NONE;

  /**
   * Initializes a new instance of the DataGrid class.
   * @param {string} titleText the text to display as the title for the grid
   * @param {object[]} columnDefinitions the definitions for the columns of the grid
   * @param {object} gridOptions an object containing the options for the grid
   */
  constructor(titleText, columnDefinitions, gridOptions = {}) {
    this.showTitle = "showTitle" in gridOptions ? gridOptions.showTitle : true;
    this.allowCreation =
      "allowCreation" in gridOptions ? gridOptions.allowCreation : true;
    this.allowRowDeleting =
      "allowRowDeleting" in gridOptions ? gridOptions.allowRowDeleting : true;
    this.allowRowEditing =
      "allowRowEditing" in gridOptions ? gridOptions.allowRowEditing : false;
    this.allowRowReordering =
      "allowRowReordering" in gridOptions
        ? gridOptions.allowRowReordering
        : false;
    this.allowRowSelecting =
      "allowRowSelecting" in gridOptions
        ? gridOptions.allowRowSelecting
        : DataGrid.ROW_SELECTION_NONE;
    this.defineGrid(titleText, columnDefinitions);
  }

  /**
   * Creates the grid title element.
   * @param {String} titleText the text of the grid title
   * @param {String | undefined} createItemUrl the URL for creating a new data item in the grid
   */
  #createGrid() {
    const gridTitleElement = document.createElement("div");
    gridTitleElement.classList.add("pq-grid-title");

    this.#titleTextElement.classList.add("pq-grid-title-text");
    gridTitleElement.appendChild(this.#titleTextElement);

    if (this.allowCreation) {
      this.#addNewDataLink.classList.add("pq-menu-link", "pq-float-right");
      this.#addNewDataLink.href = "#";
      this.#addNewDataLink.innerText = "Create new";
      this.#addNewDataLink.addEventListener("click", (e) => {
        e.stopPropagation();
        this.onAddDataRequested(e);
      });
      gridTitleElement.appendChild(this.#addNewDataLink);
    }
    if (!this.showTitle) {
      gridTitleElement.classList.add("pq-hide");
    }

    this.#createGridColumns();
    this.#gridElement.appendChild(gridTitleElement);
    this.#gridElement.appendChild(this.#gridTable);
  }

  #createIcon(imagePath) {
    const svgElement = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svgElement.classList.add("pq-icon");
    svgElement.setAttribute("viewBox", "0 0 512 512");

    const useElement = document.createElementNS("http://www.w3.org/2000/svg", "use");
    useElement.setAttributeNS("http://www.w3.org/1999/xlink", "xlink:href", imagePath);
    useElement.setAttribute("href", imagePath);
    svgElement.appendChild(useElement);

    return svgElement;
  }

  /**
   * Creates the grid columns.
   */
  #createGridColumns() {
    const tableHeader = document.createElement("thead");
    const headerRow = document.createElement("tr");

    this.#columnDefinitions.forEach((columnDefinition) => {
      const tableCell = document.createElement("th");
      tableCell.classList.add("pq-grid-header-cell");
      tableCell.innerText = `${columnDefinition.title}`;
      headerRow.appendChild(tableCell);
    });

    // Add a filler column at the end, if needed
    if (this.allowRowEditing || this.allowRowDeleting) {
      const buttonEditingHeader = document.createElement("th");
      buttonEditingHeader.classList.add("pq-grid-header-cell");
      headerRow.appendChild(buttonEditingHeader);
    }

    tableHeader.appendChild(headerRow);
    this.#gridTable.appendChild(tableHeader);
    this.#gridTable.appendChild(this.#tableBody);
  }

  /**
   * Creates a table row element with cells for holding data.
   * @returns the table row element
   */
  #createRowElement() {
    const dataRow = document.createElement("tr");
    if (this.allowRowSelecting) {
      dataRow.addEventListener("click", (e) => {
        e.stopPropagation();
        if (e.currentTarget.hasAttribute("data-row-selected")) {
          this.#unselectRow(e.currentTarget);
        } else {
          if (this.allowRowSelecting < DataGrid.ROW_SELECTION_MULTIPLE) {
            this.#unselectRow(
              e.currentTarget.parentNode.querySelector("tr[data-row-selected]")
            );
          }
          this.#selectRow(e.currentTarget);
        }
      });
    }

    if (this.allowRowReordering) {
      dataRow.draggable = true;
      dataRow.addEventListener("dragstart", (e) => {
        this.#draggedRow = e.currentTarget;
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.dropEffect = "move";
        e.dataTransfer.setData("text/plain", e.currentTarget.rowIndex);
        console.log(`starting drag of ${e.currentTarget.rowIndex}`);
      });
      dataRow.addEventListener("dragover", (e) => {
        e.preventDefault();
      });
      dataRow.addEventListener("drop", (e) => {
        e.preventDefault();
        const sourceRowIndex =
          parseInt(e.dataTransfer.getData("text/plain")) - 1;
        if (this.#draggedRow != e.currentTarget) {
          const destinationRowIndex = e.currentTarget.rowIndex - 1;
          if (destinationRowIndex < sourceRowIndex) {
            // dragging up
            e.target.parentNode.before(this.#draggedRow);
          } else {
            //dragging down
            e.target.parentNode.after(this.#draggedRow);
          }
          const movingDataItem = this.#gridData[sourceRowIndex];
          this.#gridData = this.#gridData.flatMap((item, index) => {
            if (index === sourceRowIndex) return [];
            if (index === destinationRowIndex)
              return sourceRowIndex < destinationRowIndex
                ? [item, movingDataItem]
                : [movingDataItem, item];
            return item;
          });
        }
      });
      dataRow.addEventListener("dragend", (e) => {
        this.#draggedRow = undefined;
      });
    }

    this.#columnDefinitions.forEach((columnDefinition) => {
      const dataCell = document.createElement("td");
      dataCell.classList.add("pq-grid-data-cell");
      dataCell.setAttribute("data-field-name", columnDefinition.fieldName);
      dataRow.appendChild(dataCell);
    });

    // Create filler column with delete button at end.
    if (this.allowRowDeleting || this.allowRowEditing) {
      const fillerColumnDataCell = document.createElement("td");
      if (this.allowRowEditing) {
        const editIconElement = this.#createIcon("/image/edit.svg#edit");
        const editButton = document.createElement("button");
        editButton.classList.add("pq-icon-button");
        editButton.appendChild(editIconElement);
        editButton.addEventListener("click", (e) => {
          e.preventDefault();
          this.onRowEditRequested(e);
        });
        fillerColumnDataCell.appendChild(editButton);
      }
      if (this.allowRowDeleting) {
        const deleteIconElement = this.#createIcon("/image/trash.svg#trash");
        const deleteButton = document.createElement("button");
        deleteButton.classList.add("pq-icon-button");
        deleteButton.appendChild(deleteIconElement);
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

  #selectRow(rowElement) {
    if (rowElement) {
      rowElement.classList.add("pq-grid-row-selected");
      rowElement.setAttribute("data-row-selected", "true");
    }
  }

  #unselectRow(rowElement) {
    if (rowElement) {
      rowElement.classList.remove("pq-grid-row-selected");
      rowElement.removeAttribute("data-row-selected");
    }
  }

  /**
   * Adds a row of data to the grid.
   * @param {object} dataItem the data to add to the grid.
   */
  addDataRow(dataItem) {
    this.#gridData.push(dataItem);
    const tableRow = this.#createRowElement();
    this.#columnDefinitions.forEach((columnDefinition) => {
      const dataCell = tableRow.querySelector(
        `td[data-field-name='${columnDefinition.fieldName}']`
      );
      if (dataCell) {
        if (columnDefinition.type === "link") {
          const itemLinkUrl = columnDefinition.linkTemplate.replace(
            `:${columnDefinition.fieldName}`,
            dataItem[columnDefinition.fieldName]
          );
          const link = document.createElement("a");
          link.href = itemLinkUrl;
          link.innerText = dataItem[columnDefinition.fieldName];
          dataCell.appendChild(link);
        } else if (columnDefinition.type === "boolean") {
          const checkbox = document.createElement("input");
          checkbox.type = "checkbox";
          checkbox.readOnly = true;
          checkbox.checked = dataItem[columnDefinition.fieldName];
          checkbox.addEventListener("click", (e) => e.preventDefault());
          dataCell.appendChild(checkbox);
        } else {
          dataCell.innerText = dataItem[columnDefinition.fieldName];
        }
      }
    });
    this.#tableBody.appendChild(tableRow);
  }

  /**
   * Deletes a data row from the grid.
   * @param {number} rowIndex the index of the row to delete.
   */
  deleteDataRow(rowIndex) {
    if (this.allowRowDeleting) {
      this.#gridData.splice(rowIndex, 1);
      const row = this.#tableBody.querySelector(`tr:nth-of-type(${rowIndex + 1})`);
      this.#tableBody.removeChild(row);
    }
  }

  /**
   * Sets a data row to edit mode
   * @param {number} rowIndex the index of the row to edit
   */
  editDataRow(rowIndex) {
    if (this.allowRowEditing) {
      const row = this.#tableBody.querySelector(`tr:nth-of-type(${rowIndex + 1})`);
      const dataItem = this.#gridData[rowIndex];
      this.#columnDefinitions.forEach((columnDef) => {
        const cell = row.querySelector(`td[data-field-name='${columnDef.fieldName}']`);
        if (columnDef.editable) {
          if (columnDef.type === "boolean") {
            const checkbox = document.createElement("input");
            checkbox.type = "checkbox";
            checkbox.checked = dataItem[columnDef.fieldName];
            cell.replaceChildren(checkbox);
          } else {
            const textBox = document.createElement("input");
            textBox.value = dataItem[columnDef.fieldName];
            cell.replaceChildren(textBox);
          }
        }
      });
      const fillerCell = row.querySelector("td:last-of-type");
      [...fillerCell.querySelectorAll("button")].forEach(button => {
        button.classList.add("pq-hide");
      });
      const saveButtonIcon = this.#createIcon("/image/save.svg#save");
      const saveButton = document.createElement("button");
      saveButton.classList.add("pq-icon-button");
      saveButton.appendChild(saveButtonIcon);
      saveButton.addEventListener("click", (e) => {
        e.preventDefault();
        this.#columnDefinitions.forEach((columnDef) => {
          const cell = row.querySelector(`td[data-field-name='${columnDef.fieldName}']`);
          if (columnDef.editable) {
            if (columnDef.type === "boolean") {
              dataItem[columnDef.fieldName] = cell.querySelector("input").checked;
              const checkbox = document.createElement("input");
              checkbox.type = "checkbox";
              checkbox.checked = dataItem[columnDef.fieldName];
              checkbox.addEventListener("click", (e) => e.preventDefault());
              cell.replaceChildren(checkbox);
            } else {
              const textBox = cell.querySelector("input");
              dataItem[columnDef.fieldName] = textBox.value;
              cell.removeChild(textBox);
              cell.innerText = dataItem[columnDef.fieldName];
            }
          }
        });
        this.onRowEditCommit(e);
        fillerCell.removeChild(e.currentTarget);
        [...fillerCell.querySelectorAll("button")].forEach(button => {
          button.classList.remove("pq-hide");
        });
      });
      fillerCell.appendChild(saveButton);
    }
  }

  #clearData() {
    while (this.#tableBody.firstChild) {
      this.#tableBody.removeChild(this.#tableBody.firstChild);
    }
  }

  #clearGrid() {
    while (this.#gridElement.firstChild) {
      this.#gridElement.removeChild(this.#gridElement.firstChild);
    }
  }

  /**
   * Callback called when deletion of a row is requested.
   * @param {*} e
   */
  onDeleteDataRequested = (e) => {};

  /**
   * Callback called when addition of a new data row is requested.
   * @param {*} e
   */
  onAddDataRequested = (e) => { };

  /**
   * Callback called when edit of a data row is requested.
   * @param {*} e
   */
  onRowEditRequested = (e) => { };

  /**
   * Callback called when edit of a data row is saved.
   * @param {*} e
   */
  onRowEditCommit = (e) => { };

  /**
   * Renders the data to the grid. Will delete existing data in the grid when called.
   * @param {object[]} gridData an array of objects representing the data to render in the grid
   */
  render(gridData) {
    this.#clearData();
    gridData.forEach((item) => {
      this.addDataRow(item);
    });
  }

  /**
   * Defines the title and columns of the grid. Will reset the entire grid when called.
   * @param {string} titleText the text to display as the title for the grid
   * @param {object[]} columnDefinitions the definitions for the columns of the grid
   */
  defineGrid(titleText, columnDefinitions) {
    this.#columnDefinitions = columnDefinitions;
    this.#clearGrid();
    this.#createGrid();
    this.setTitleText(titleText);
  }

  /**
   * Sets the text of the link to add new data
   * @param {string} text the text of the link to add new data
   */
  setAddNewDataLinkText(text) {
    this.#addNewDataLink.innerText = text;
  }

  /**
   * Sets the text of the title of the grid
   * @param {string} text the text of the title of the grid
   */
  setTitleText(text) {
    this.#titleTextElement.innerText = text;
  }

  /**
   * Gets the number of data rows in the grid.
   * @returns {number} the number of rows in the grid.
   */
  getDataRowCount() {
    return this.#gridData.length;
  }

  /**
   * Gets the DOM element that is the root of the grid.
   * @returns {Element} the DOM element that is the root of the grid
   */
  getElement() {
    return this.#gridElement;
  }

  /**
   * Gets the data rendered by the grid.
   * @returns {object[]} the data rendered in the grid
   */
  getData() {
    return this.#gridData;
  }
}

export { DataGrid };

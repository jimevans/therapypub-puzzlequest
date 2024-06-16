/**
 * Class for creating a grid for supplied data.
 */
class DataGrid {
  #gridElement = document.createElement("div");

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

    if (createItemUrl) {
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
    const gridTemplateColumns = [];
    let columnNumber = 0;
    columnDefinitions.forEach((columnDefinition) => {
      columnNumber++;
      const headerCell = document.createElement("div");
      headerCell.classList.add("pq-grid-header-cell");
      headerCell.innerText = `${columnDefinition.title}`;
      headerCell.style.gridRow = "2";
      headerCell.style.gridColumn = `${columnNumber}`;
      gridTemplateColumns.push(`${columnDefinition.width}`);
      this.#gridElement.appendChild(headerCell);
    });

    // Add a filler column at the end
    columnNumber++;
    const fillerHeaderCell = document.createElement("div");
    fillerHeaderCell.classList.add("pq-grid-header-cell");
    fillerHeaderCell.style.gridRow = "2";
    fillerHeaderCell.style.gridColumn = `${columnNumber}`;
    this.#gridElement.appendChild(fillerHeaderCell);
    gridTemplateColumns.push("auto");
    this.#gridElement.style.gridTemplateColumns = gridTemplateColumns.join(" ");
  }

  #fillGridData(columnDefinitions, gridData) {
    // Create a row for each piece of data.
    let rowNumber = 2;
    let columnNumber = 0;
    gridData.forEach((item) => {
      columnNumber = 0;
      rowNumber++;
      let itemLinkUrl;
      columnDefinitions.forEach((columnDefinition) => {
        columnNumber++;
        const dataCell = document.createElement("div");
        dataCell.classList.add("pq-grid-data-cell");
        dataCell.style.gridRow = `${rowNumber}`;
        dataCell.style.gridColumn = `${columnNumber}`;
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
        this.#gridElement.appendChild(dataCell);
      });

      // Create filler column with delete button at end.
      columnNumber++;
      const fillerColumnDataCell = document.createElement("div");
      fillerColumnDataCell.classList.add("pq-grid-data-cell");
      fillerColumnDataCell.style.gridRow = `${rowNumber}`;
      fillerColumnDataCell.style.gridColumn = `${columnNumber}`;

      if (itemLinkUrl) {
        const deleteButton = document.createElement("button");
        deleteButton.innerText = "Delete";
        deleteButton.addEventListener("click", (e) => {
          e.preventDefault;
          this.onDeleteRequested(itemLinkUrl);
        });
        fillerColumnDataCell.appendChild(deleteButton);
      }

      this.#gridElement.appendChild(fillerColumnDataCell);
    });
  }

  onDeleteRequested = (itemLinkUrl) => {};

  initialize(titleText, createItemUrl, columnDefinitions, gridData) {
    this.#createGridTitle(titleText, columnDefinitions.length, createItemUrl);
    this.#createGridHeader(columnDefinitions);
    this.#fillGridData(columnDefinitions, gridData);
  }

  getElement() {
    return this.#gridElement;
  }
}

export { DataGrid };

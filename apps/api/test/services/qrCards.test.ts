import PDFDocument from "pdfkit";
import { describe, expect, it, vi } from "vitest";
import { type QrCard, drawQrCards } from "../../src/services/qrCards.js";

function cards(count: number): QrCard[] {
  return Array.from({ length: count }, (_, index) => ({
    questName: "Harbor Walk",
    stopNumber: index + 1,
    puzzleName: `Puzzle ${index + 1}`,
    activationCode: `code-${index + 1}`,
  }));
}

function draw(count: number) {
  const pdf = new PDFDocument({ autoFirstPage: false });
  const addPage = vi.spyOn(pdf, "addPage");
  const text = vi.spyOn(pdf, "text");
  drawQrCards(pdf, cards(count));
  pdf.end();
  return {
    addPage,
    written: text.mock.calls.map(([value]) => String(value)),
  };
}

describe("activation cards", () => {
  it.each([
    [1, 1],
    [10, 1],
    [11, 2],
    [20, 2],
  ])("print %i cards on %i Letter sheets", (count, sheets) => {
    const { addPage } = draw(count);

    expect(addPage).toHaveBeenCalledTimes(sheets);
    expect(addPage).toHaveBeenCalledWith({ size: "LETTER", margin: 0 });
  });

  it("show each stop's code, puzzle, number and quest", () => {
    const { written } = draw(2);

    expect(written).toEqual([
      "code-1",
      "Puzzle 1",
      "Save this card!",
      "1",
      "Harbor Walk",
      "code-2",
      "Puzzle 2",
      "Save this card!",
      "2",
      "Harbor Walk",
    ]);
  });
});

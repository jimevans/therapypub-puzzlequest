import PDFDocument from "pdfkit";
import { describe, expect, it, vi } from "vitest";
import { type QrCard, drawQrCards } from "../../src/services/qrCards.js";

function cards(count: number, words: string[] = []): QrCard[] {
  return Array.from({ length: count }, (_, index) => ({
    questName: "Harbor Walk",
    stopNumber: index + 1,
    activationCode: `code-${index + 1}`,
    ...(words[index] ? { cardWord: words[index] } : {}),
  }));
}

function draw(count: number, words: string[] = []) {
  const pdf = new PDFDocument({ autoFirstPage: false });
  const addPage = vi.spyOn(pdf, "addPage");
  const text = vi.spyOn(pdf, "text");
  drawQrCards(pdf, cards(count, words));
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

  it("show each stop's code, number and quest", () => {
    const { written } = draw(2);

    expect(written).toEqual([
      "code-1",
      "1",
      "Harbor Walk",
      "code-2",
      "2",
      "Harbor Walk",
    ]);
  });

  it("with words, show each one, and say to save all but the last", () => {
    const { written } = draw(3, ["SHOW", "", "PUZZLEQUEST"]);

    expect(written).toEqual([
      "code-1",
      "SHOW",
      "Save this card!",
      "1",
      "Harbor Walk",
      "code-2",
      "Save this card!",
      "2",
      "Harbor Walk",
      "code-3",
      "PUZZLEQUEST",
      "3",
      "Harbor Walk",
    ]);
  });
});

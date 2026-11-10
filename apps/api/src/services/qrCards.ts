// Printable activation cards: one per stop, each with its QR code, laid out
// for perforated business-card sheets, so a quest's cards take one click
// rather than a hand-made document.
import QRCode from "qrcode";

/** What one card shows. */
export interface QrCard {
  questName: string;
  stopNumber: number;
  activationCode: string;
  /**
   * A word or phrase printed large, for a mini-game in which the players put
   * the cards' words together. Optional.
   */
  cardWord?: string;
}

const INCH = 72;

/**
 * The sheet: US Letter with ten 3.5 × 2 inch cards, two across and five down,
 * edge to edge inside 3/4 inch side and 1/2 inch top margins. This is the
 * layout of standard perforated business-card sheets (Avery 8371 and
 * compatibles).
 */
export const SHEET = {
  width: 8.5 * INCH,
  height: 11 * INCH,
  left: 0.75 * INCH,
  top: 0.5 * INCH,
  columns: 2,
  rows: 5,
  slotWidth: 3.5 * INCH,
  slotHeight: 2 * INCH,
};

/** A card is read upright, 2 inches wide and 3.5 tall, turned in its slot. */
const CARD_WIDTH = SHEET.slotHeight;
const CARD_HEIGHT = SHEET.slotWidth;
const PADDING = 10;
const TEXT_WIDTH = CARD_WIDTH - 2 * PADDING;

/**
 * Draws a QR code as filled squares, so it prints sharp at any resolution.
 * @param pdf the document
 * @param text what the code holds
 * @param x its left edge
 * @param y its top edge
 * @param size its width and height
 */
function drawQrCode(
  pdf: PDFKit.PDFDocument,
  text: string,
  x: number,
  y: number,
  size: number
) {
  const { modules } = QRCode.create(text, { errorCorrectionLevel: "M" });
  const cell = size / modules.size;
  for (let row = 0; row < modules.size; row++) {
    for (let column = 0; column < modules.size; column++) {
      if (modules.get(row, column)) {
        // A hair larger than a cell, so neighbors print without seams.
        pdf.rect(x + column * cell, y + row * cell, cell + 0.05, cell + 0.05);
      }
    }
  }
  pdf.fill("black");
}

/**
 * The largest size, up to a limit, at which text fits a width on one line.
 * @param pdf the document, with the text's font set
 * @param text the text
 * @param width the width it must fit
 * @param largest the size to start from
 * @param smallest the size not to go below
 * @returns the font size
 */
function fittingSize(
  pdf: PDFKit.PDFDocument,
  text: string,
  width: number,
  largest: number,
  smallest: number
): number {
  let size = largest;
  while (size > smallest && pdf.fontSize(size).widthOfString(text) > width) {
    size -= 0.5;
  }
  return size;
}

/**
 * Draws one card, upright, with its top left corner at the origin.
 * @param pdf the document, already moved and turned to the card's place
 * @param card what the card shows
 * @param keep whether to tell the players to save the card
 */
function drawCard(pdf: PDFKit.PDFDocument, card: QrCard, keep: boolean) {
  const qrSize = 104;
  drawQrCode(pdf, card.activationCode, (CARD_WIDTH - qrSize) / 2, 12, qrSize);

  // The code, to type if the camera won't scan.
  pdf.font("Courier");
  pdf.fontSize(fittingSize(pdf, card.activationCode, TEXT_WIDTH, 9, 4));
  pdf.text(card.activationCode, PADDING, 124, {
    width: TEXT_WIDTH,
    align: "center",
    lineBreak: false,
  });

  // The card word, large: up to two lines, smaller if it's long, and never
  // breaking within a word.
  if (card.cardWord) {
    pdf.font("Helvetica-Bold");
    const words = card.cardWord.split(/\s+/);
    const fits = (size: number) =>
      words.every(
        (word) => pdf.fontSize(size).widthOfString(word) <= TEXT_WIDTH
      ) &&
      pdf.fontSize(size).heightOfString(card.cardWord!, {
        width: TEXT_WIDTH,
      }) <=
        2.4 * size;
    let size = 20;
    while (size > 9 && !fits(size)) {
      size -= 1;
    }
    pdf.fontSize(size).text(card.cardWord, PADDING, 144, {
      width: TEXT_WIDTH,
      align: "center",
      height: 2.4 * size,
      ellipsis: true,
    });
  }

  if (keep) {
    pdf.font("Helvetica").fontSize(11);
    pdf.text("Save this card!", PADDING, 198, {
      width: TEXT_WIDTH,
      align: "center",
      lineBreak: false,
    });
  }

  // Which quest and stop it belongs to, small, along the bottom.
  const bottom = CARD_HEIGHT - PADDING - 9;
  const stop = String(card.stopNumber);
  pdf.font("Helvetica-Bold").fontSize(10);
  const stopWidth = pdf.widthOfString(stop);
  pdf.text(stop, CARD_WIDTH - PADDING - stopWidth, bottom, {
    lineBreak: false,
  });
  pdf.font("Helvetica").fontSize(7);
  pdf.text(card.questName, PADDING, bottom + 2, {
    width: TEXT_WIDTH - stopWidth - 6,
    height: 9,
    ellipsis: true,
    lineBreak: false,
  });
}

/**
 * Draws the cards, ten to a sheet, in order. Each card is upright when its
 * slot is turned with the sheet's left edge at the top. When any card has a
 * word, the cards are a mini-game: every card but the last (which unlocks the
 * final stop) tells the players to save it.
 * @param pdf the document, without pages yet
 * @param cards the cards, in the order to print them
 */
export function drawQrCards(pdf: PDFKit.PDFDocument, cards: QrCard[]) {
  const perSheet = SHEET.columns * SHEET.rows;
  const collected = cards.some((card) => card.cardWord);
  cards.forEach((card, index) => {
    const place = index % perSheet;
    if (place === 0) {
      pdf.addPage({ size: "LETTER", margin: 0 });
    }
    const x = SHEET.left + (place % SHEET.columns) * SHEET.slotWidth;
    const y = SHEET.top + Math.floor(place / SHEET.columns) * SHEET.slotHeight;
    pdf.save();
    // The card's top left goes to the slot's bottom left, and its top runs
    // along the slot's left edge.
    pdf.translate(x, y + SHEET.slotHeight).rotate(-90);
    drawCard(pdf, card, collected && index < cards.length - 1);
    pdf.restore();
  });
}

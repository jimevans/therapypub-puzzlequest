import path from "path";
import type { RequestHandler } from "express";
import multer from "multer";
import { puzzleDataDirectory } from "../paths.js";

/** The largest puzzle media file that can be uploaded, in bytes. */
export const MAXIMUM_PUZZLE_MEDIA_BYTES = 100 * 1024 * 1024;

/** The largest scanned image accepted for puzzle activation, in bytes. */
export const MAXIMUM_ACTIVATION_IMAGE_BYTES = 20 * 1024 * 1024;

/**
 * File extensions accepted for puzzle media. Each determines the content type
 * the file is served with. SVG is deliberately absent: SVG images can contain
 * scripts, which would run as part of this site.
 */
export const PUZZLE_MEDIA_EXTENSIONS = new Set([
  // Images
  "avif",
  "bmp",
  "gif",
  "jpeg",
  "jpg",
  "png",
  "webp",
  // Audio
  "aac",
  "flac",
  "m4a",
  "mp3",
  "oga",
  "ogg",
  "opus",
  "wav",
  // Video
  "m4v",
  "mov",
  "mp4",
  "ogv",
  "webm",
]);

/**
 * An error rejecting an upload, reported to the client with its status code.
 */
class UploadError extends Error {
  /** The HTTP status code to respond with. */
  status: number;

  /** Always true: the message is meant for the client (see errorHandler). */
  expose: boolean;

  /**
   * @param status the HTTP status code
   * @param message the message for the client
   */
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.expose = true;
  }
}

/**
 * Gets the name to store an uploaded puzzle media file under, or throws if the
 * puzzle name or file extension is unacceptable. The name is the puzzle name
 * plus the lowercased extension, and must resolve to a file directly inside
 * the puzzle data directory.
 * @param puzzleName the puzzle name from the request
 * @param fileExtension the file extension from the request
 * @returns the file name
 * @throws {UploadError} if the name or extension is not acceptable
 */
export function getPuzzleMediaFileName(
  puzzleName: unknown,
  fileExtension: unknown
): string {
  if (typeof puzzleName !== "string" || typeof fileExtension !== "string") {
    throw new UploadError(
      400,
      "puzzleName and fileExtension must be sent before the file"
    );
  }
  const extension = fileExtension.toLowerCase();
  if (!PUZZLE_MEDIA_EXTENSIONS.has(extension)) {
    throw new UploadError(
      400,
      `Files of type .${fileExtension} cannot be uploaded`
    );
  }
  const fileName = `${puzzleName}.${extension}`;
  const isSafeName =
    puzzleName !== "" &&
    !puzzleName.startsWith(".") &&
    // eslint-disable-next-line no-control-regex -- rejecting control characters
    !/[/\\\u0000-\u001f\u007f]/.test(puzzleName) &&
    path.dirname(path.resolve(puzzleDataDirectory, fileName)) ===
      puzzleDataDirectory;
  if (!isSafeName) {
    throw new UploadError(400, `Invalid puzzle name for an upload`);
  }
  return fileName;
}

/**
 * Wraps multer middleware so that rejected uploads are reported as client
 * errors: 413 for files that are too large, 400 for anything else multer
 * rejects.
 * @param middleware the multer middleware
 * @returns the wrapped middleware
 */
function reportUploadErrors(middleware: RequestHandler): RequestHandler {
  return (req, res, next) => {
    middleware(req, res, (err) => {
      if (err instanceof multer.MulterError) {
        next(
          err.code === "LIMIT_FILE_SIZE"
            ? new UploadError(413, "The uploaded file is too large")
            : new UploadError(400, err.message)
        );
        return;
      }
      next(err);
    });
  };
}

/**
 * Stores a puzzle media file sent in the "binary" field in the puzzle data
 * directory, named after the puzzle. The "puzzleName" and "fileExtension"
 * fields must come before the file; they are checked before anything is
 * written.
 */
export const uploadPuzzleMedia = reportUploadErrors(
  multer({
    storage: multer.diskStorage({
      destination: puzzleDataDirectory,
      filename: (req, file, cb) => {
        try {
          cb(
            null,
            getPuzzleMediaFileName(req.body.puzzleName, req.body.fileExtension)
          );
        } catch (err) {
          cb(err, "");
        }
      },
    }),
    limits: { fileSize: MAXIMUM_PUZZLE_MEDIA_BYTES, files: 1 },
    fileFilter: (req, file, cb) => {
      try {
        getPuzzleMediaFileName(req.body.puzzleName, req.body.fileExtension);
        cb(null, true);
      } catch (err) {
        cb(err);
      }
    },
  }).single("binary")
);

/**
 * Keeps a scanned activation image sent in the "image" field in memory, for
 * the QR code reader.
 */
export const uploadActivationImage = reportUploadErrors(
  multer({
    limits: { fileSize: MAXIMUM_ACTIVATION_IMAGE_BYTES, files: 1 },
  }).single("image")
);

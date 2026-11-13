import { createRequire } from "node:module";
import path from "node:path";
import express from "express";

/**
 * The API's reference, at /api/v1/docs: Swagger UI showing the API's OpenAPI
 * description. Swagger UI's files are served from its package, never from a
 * CDN, and only the two the page needs; its starting script is
 * public/script/api-reference.js, since the site allows no inline scripts.
 */
export const ApiReferenceRouter = express.Router();

/** Swagger UI's folder, found as Node finds the package. */
const SWAGGER_UI = path.dirname(
  createRequire(import.meta.url).resolve("swagger-ui-dist/package.json")
);
const PAGE = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>API reference · PuzzleQuest</title>
    <link rel="icon" type="image/png" href="/image/favicon-32.png" sizes="32x32" />
    <link rel="icon" type="image/png" href="/image/favicon-16.png" sizes="16x16" />
    <link rel="apple-touch-icon" href="/image/apple-touch-icon.png" />
    <meta name="theme-color" content="#2a1638" />
    <link rel="stylesheet" href="/api/v1/docs/swagger-ui.css" />
  </head>
  <body>
    <div id="swagger-ui"></div>
    <script src="/api/v1/docs/swagger-ui-bundle.js"></script>
    <script src="/script/api-reference.js"></script>
  </body>
</html>
`;

ApiReferenceRouter.get("/", (_req, res) => {
  res.set("Cache-Control", "no-cache").type("html").send(PAGE);
});

for (const file of ["swagger-ui.css", "swagger-ui-bundle.js"]) {
  ApiReferenceRouter.get(`/${file}`, (_req, res) => {
    // Checked against its ETag on each use, so an upgraded Swagger UI is
    // picked up at once.
    res.sendFile(file, {
      root: SWAGGER_UI,
      headers: { "Cache-Control": "no-cache" },
    });
  });
}

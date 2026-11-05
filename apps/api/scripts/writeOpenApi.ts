// Writes the API's OpenAPI description to the API client's package, which
// generates its types from it (`npm run generate:api`). CI checks that the
// committed files match the routes.

// The description doesn't depend on any settings, but loading the routes
// requires them. NODE_ENV=test keeps a developer's .env out of it.
process.env.NODE_ENV = "test";
process.env.PQ_MONGODB_URI ??= "mongodb://unused";

const { writeFileSync } = await import("node:fs");
const { default: path } = await import("node:path");
const { v1Routes } = await import("../src/api/v1/index.js");
const { createOpenApiDocument } = await import("../src/api/v1/openapi.js");

writeFileSync(
  path.join(import.meta.dirname, "../../../packages/api-client/openapi.json"),
  `${JSON.stringify(createOpenApiDocument(v1Routes), null, 2)}\n`
);

// Loading the routes starts timers, such as the rate limiters', which would
// keep the process running.
process.exit(0);

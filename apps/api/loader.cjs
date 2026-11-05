// Startup file for the hosting environment (cPanel), which loads the
// application as CommonJS. The application is an ES module compiled into
// dist/ by `npm run build`.
async function loadApp() {
  // Report errors at their location in src/ rather than in compiled output.
  process.setSourceMapsEnabled(true);
  await import("./dist/app.js");
}

loadApp();

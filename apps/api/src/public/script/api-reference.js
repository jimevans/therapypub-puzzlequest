// Shows the API's reference, from its OpenAPI description, with Swagger UI
// (served by apps/api/src/routes/apiReference.ts). Kept in a file of its own,
// since the site's Content Security Policy allows no inline scripts.
/* global SwaggerUIBundle */
window.addEventListener("load", () => {
  SwaggerUIBundle({
    url: "/api/v1/openapi.json",
    dom_id: "#swagger-ui",
    deepLinking: true,
    presets: [SwaggerUIBundle.presets.apis],
    layout: "BaseLayout",
    // Checking the description would send it to swagger.io.
    validatorUrl: null,
  });
});

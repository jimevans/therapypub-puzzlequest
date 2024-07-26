
export async function callDataApi(apiEndpoint, method = "get", body = {}, serializeBody = true, headers = undefined) {
  const fetchArgs = {
    method: method,
  };
  if (!headers) {
    fetchArgs.headers = { "Content-Type" : "application/json" };
  } else {
    fetchArgs.headers = headers;
  }
  if (body && method !== "get") {
    fetchArgs.body = serializeBody ? JSON.stringify(body) : body;
  }
  try {
    const response = await fetch(apiEndpoint, fetchArgs);
    if (response.ok) {
      return await response.json();
    } else {
      const responseData = await response.json();
      if (responseData.status === "error") {
        console.log(
          `${response.status} received with error ${responseData.message}`
        );
      }
      return responseData;
    }
  } catch (err) {
    console.log("error: " + err);
    return { status: "error", message: err.message };
  }
}

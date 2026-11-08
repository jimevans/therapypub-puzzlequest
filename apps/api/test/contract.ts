// Contract tests: every v1 response the server's tests get is checked against
// the API's published description (packages/api-client/openapi.json), which
// generated clients, the web app and future native apps are built on. A test
// whose response doesn't match fails, saying what differs. Each test file
// also records which responses it saw, so that a full run can check that
// every documented success response is tested (see contractCoverage.ts).
//
// Responses are recorded by wrapping Express's response, so every test that
// sends requests through the app is a contract test without changing it.
// Only operations in the description are checked: webhooks, which are left
// out of it on purpose, and routes made up by a test aren't.
import { readFileSync } from "node:fs";
import express from "express";
import {
  type Exchange,
  createContract,
} from "@puzzlequest/api-client/contract";

/** The API's description, as published for clients. */
export const contract = createContract(
  JSON.parse(
    readFileSync(
      new URL("../../../packages/api-client/openapi.json", import.meta.url),
      "utf8"
    )
  ) as unknown
);

const BASE_PATH = "/api/v1";
const JSON_MEDIA_TYPE = /^application\/(?:[\w.+-]+\+)?json$/;

let exchanges: Exchange[] = [];
const seen = new Set<string>();

/**
 * Turns what a response was ended with into its body, as the contract
 * checks it: parsed if it's JSON, undefined if there's none.
 * @param chunk what end() was given
 * @param mediaType the response's media type
 * @returns the body
 */
function bodyOf(chunk: unknown, mediaType: string | undefined): unknown {
  if (chunk === undefined || chunk === null || chunk === "") {
    return undefined;
  }
  const text = Buffer.isBuffer(chunk) ? chunk.toString("utf8") : chunk;
  if (
    typeof text === "string" &&
    mediaType &&
    JSON_MEDIA_TYPE.test(mediaType)
  ) {
    try {
      return JSON.parse(text) as unknown;
    } catch {
      return text;
    }
  }
  return text;
}

/**
 * Records a v1 response as it ends.
 * @param res the response
 * @param chunk what end() was given
 */
function record(res: express.Response, chunk: unknown): void {
  const { req } = res;
  const [requestPath] = req.originalUrl.split("?");
  if (req.method === "HEAD" || !requestPath.startsWith(`${BASE_PATH}/`)) {
    return;
  }
  const path = contract.pathOf(requestPath.slice(BASE_PATH.length));
  if (path === undefined || !contract.has(req.method, path)) {
    return;
  }
  const contentType = res.getHeader("Content-Type");
  const mediaType =
    typeof contentType === "string"
      ? contentType.split(";")[0].trim()
      : undefined;
  exchanges.push({
    method: req.method,
    path,
    status: res.statusCode,
    mediaType,
    body: bodyOf(chunk, mediaType),
  });
}

const RECORDING = Symbol("recording contract responses");
const SENT = Symbol("the body given to send()");

type RecordedResponse = express.Response & { [SENT]?: unknown };

/** Starts recording the v1 responses the app sends. */
export function recordResponses(): void {
  const response = express.response as express.Response & {
    [RECORDING]?: true;
  };
  if (response[RECORDING]) {
    return;
  }
  response[RECORDING] = true;
  // The body is taken from send(), where there is one, because compression
  // replaces what reaches end() with compressed bytes; end() alone is used
  // for responses with no body, such as 204.
  const { send, end } = response;
  response.send = function (this: RecordedResponse, body?: unknown) {
    this[SENT] = body;
    return send.call(this, body);
  };
  response.end = function (this: RecordedResponse, ...args: unknown[]) {
    record(
      this,
      SENT in this
        ? this[SENT]
        : typeof args[0] === "function"
          ? undefined
          : args[0]
    );
    return (end as (...a: unknown[]) => express.Response).apply(this, args);
  } as typeof end;
}

/**
 * Checks the responses recorded since the last check, and forgets them.
 * @returns what didn't match the description, one line each
 */
export function checkResponses(): string[] {
  const mismatches: string[] = [];
  for (const exchange of exchanges) {
    seen.add(
      `${exchange.method.toUpperCase()} ${exchange.path} ${exchange.status}`
    );
    const mismatch = contract.check(exchange);
    if (mismatch !== undefined) {
      mismatches.push(mismatch);
    }
  }
  exchanges = [];
  return mismatches;
}

/**
 * Lists the responses seen so far, as "GET /users 200".
 * @returns the responses
 */
export function seenResponses(): string[] {
  return [...seen].sort();
}

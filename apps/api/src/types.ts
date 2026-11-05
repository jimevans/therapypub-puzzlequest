import type { Request } from "express";

// Types shared across the application.

/**
 * The result of a service operation. A successful result carries data unless
 * its data type is undefined; an error result always carries a message.
 * @template T the type of the data in a successful result, or undefined for
 *  an operation that returns no data
 */
export type ServiceResult<T> =
  | ([T] extends [undefined]
      ? {
          status: "success";
          statusCode: number;
          message?: string;
          data?: undefined;
        }
      : {
          status: "success";
          statusCode: number;
          message?: string;
          data: T;
        })
  | {
      status: "error";
      statusCode: number;
      message: string;
      /** Why it failed, for the API to report it precisely. */
      reason?: ServiceErrorReason;
      data?: undefined;
    };

/**
 * Why a service operation failed, beyond its status code: the v1 API
 * reports each reason as its own kind of problem (see api/problems.ts).
 */
export type ServiceErrorReason =
  | "not-found"
  | "already-exists"
  | "incorrect-password"
  | "password-not-allowed"
  | "wrong-join-code"
  | "email-not-verified"
  | "invalid-link"
  | "in-use"
  | "forbidden"
  | "invalid-quest"
  | "wrong-state"
  | "quest-paused"
  | "busy"
  | "wrong-activation-code"
  | "wrong-answer"
  | "no-recipients"
  | "messaging-failed";

/**
 * An Express request whose route provides the named parameters, each a single
 * string. (Express types route parameters as string | string[] to allow for
 * wildcard routes, which this application doesn't use.)
 * @template P the names of the route parameters
 * @template B the body, as parsed by the route's schema (see validate.ts)
 */
export type RouteRequest<P extends string, B = Request["body"]> = Request<
  Record<P, string>,
  unknown,
  B
>;

/**
 * An Express request whose body has been parsed by the route's schema (see
 * validate.ts), for routes without parameters.
 * @template B the parsed body
 */
export type BodyRequest<B> = RouteRequest<never, B>;

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
      data?: undefined;
    };

/**
 * An Express request whose route provides the named parameters, each a single
 * string. (Express types route parameters as string | string[] to allow for
 * wildcard routes, which this application doesn't use.)
 * @template P the names of the route parameters
 */
export type RouteRequest<P extends string> = Request<Record<P, string>>;

import { ApiError } from "./api";

/**
 * Finds what the API said about each field of a form. It reports validation
 * failures by where they are, such as body.email.
 * @param error why the request failed
 * @returns the fields it complained of, with what's wrong with each
 */
export function fieldErrorsOf<Field extends string>(
  error: Error | null
): { field: Field; message: string }[] {
  if (!(error instanceof ApiError)) {
    return [];
  }
  return (error.problem?.errors ?? []).flatMap(({ path, message }) =>
    path.startsWith("body.") ? [{ field: path.slice(5) as Field, message }] : []
  );
}

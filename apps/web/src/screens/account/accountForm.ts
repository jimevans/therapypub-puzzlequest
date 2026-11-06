import { ApiError } from "../../api";

/** What the forms for signing up and editing a profile ask for. */
export interface AccountFormValues {
  userName: string;
  displayName: string;
  email: string;
  phone: string;
  sms: boolean;
  password: string;
  confirmPassword: string;
  authorizationLevel: number;
}

const ADMINISTRATOR = 10;

/** The authorization levels an administrator can choose. */
export const AUTHORIZATION_LEVELS = [
  { value: 0, label: "Guest" },
  { value: 1, label: "Authorized user" },
  { value: ADMINISTRATOR, label: "Administrator" },
];

/**
 * Says whether a user is an administrator.
 * @param user the user, if any
 * @returns true if so
 */
export function isAdministrator(user?: {
  authorizationLevel: number;
}): boolean {
  return (user?.authorizationLevel ?? 0) >= ADMINISTRATOR;
}

/**
 * Formats a stored phone number for reading. Numbers are stored like
 * +13125550142, and only +1 numbers are accepted for now.
 * @param phone the number
 * @returns the text, such as (312) 555-0142
 */
export function formatPhone(phone: string): string {
  const parts = /^\+1(\d{3})(\d{3})(\d{4})$/.exec(phone);
  return parts ? `(${parts[1]}) ${parts[2]}-${parts[3]}` : phone;
}

/**
 * Finds what the API said about each field of a form. It reports validation
 * failures by where they are, such as body.email.
 * @param error why the request failed
 * @returns the fields it complained of, with what's wrong with each
 */
export function fieldErrorsOf(
  error: Error | null
): { field: keyof AccountFormValues; message: string }[] {
  if (!(error instanceof ApiError)) {
    return [];
  }
  return (error.problem?.errors ?? []).flatMap(({ path, message }) =>
    path.startsWith("body.")
      ? [{ field: path.slice(5) as keyof AccountFormValues, message }]
      : []
  );
}

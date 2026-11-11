import type { Schemas } from "@puzzlequest/api-client";

/** What the forms for signing up and editing a profile ask for. */
export interface AccountFormValues {
  userName: string;
  displayName: string;
  email: string;
  phone: string;
  sms: boolean;
  password: string;
  confirmPassword: string;
  role: Schemas["Role"];
}

/** The roles an administrator can choose. */
export const ROLES: { value: Schemas["Role"]; label: string }[] = [
  { value: "player", label: "Player" },
  { value: "staff", label: "Staff" },
  { value: "admin", label: "Administrator" },
];

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

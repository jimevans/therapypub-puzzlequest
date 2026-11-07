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

/** The authorization levels an administrator can choose. */
export const AUTHORIZATION_LEVELS = [
  { value: 0, label: "Guest" },
  { value: 1, label: "Authorized user" },
  { value: 10, label: "Administrator" },
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

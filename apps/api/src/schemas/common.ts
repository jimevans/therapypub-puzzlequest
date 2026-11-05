import { parsePhoneNumberFromString } from "libphonenumber-js/max";
import { z } from "zod";

/**
 * The name of something new, such as a user, team, puzzle, or quest. Names
 * appear in URLs, so they can't contain "/". Looking things up by name, as
 * signing in does, accepts any text, so existing names keep working.
 */
export const newName = z
  .string()
  .trim()
  .min(1, "Required")
  .max(100, "Must be at most 100 characters")
  .refine((name) => !name.includes("/"), 'Must not contain "/"');

/** A name shown to people. */
export const displayName = z
  .string()
  .trim()
  .max(200, "Must be at most 200 characters");

/** Text that must not be empty. */
export const requiredText = z.string().min(1, "Required");

/**
 * A phone number, typed however the user likes, stored in E.164 format
 * (such as "+13125550142"). The US is the default country. Only numbers with
 * the +1 country code (the US, Canada, and some Caribbean countries) are
 * accepted for now, matching the Twilio number; an empty value means none.
 */
export const phoneNumber = z
  .string()
  .trim()
  .transform((value, context) => {
    if (value === "") {
      return "";
    }
    const parsed = parsePhoneNumberFromString(value, "US");
    if (!parsed?.isValid() || parsed.countryCallingCode !== "1") {
      context.addIssue({
        code: "custom",
        message: "Enter a valid US or Canadian phone number",
      });
      return z.NEVER;
    }
    return parsed.number;
  });

/**
 * Formats a stored phone number for people to read, such as
 * "(312) 555-0142".
 * @param phone the number, in E.164 format
 * @returns the formatted number, or the value as it is if it isn't one
 */
export function formatPhoneNumber(phone: string): string {
  return parsePhoneNumberFromString(phone)?.formatNational() ?? phone;
}

/** A whole number that pages may send as text, such as from a select box. */
export const wholeNumber = z.coerce.number().int("Must be a whole number");

/** The server's rule is the one that counts; this just answers sooner. */
const MINIMUM_PASSWORD_LENGTH = 8;

const TOO_SHORT = `Must be at least ${MINIMUM_PASSWORD_LENGTH} characters long`;

/** The rules for a new password, for React Hook Form. */
export const newPasswordRules = {
  required: TOO_SHORT,
  minLength: { value: MINIMUM_PASSWORD_LENGTH, message: TOO_SHORT },
};

export const PASSWORDS_DIFFER = "The passwords don't match";

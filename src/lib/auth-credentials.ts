/** Member credential policy — keep in sync with register route and NextAuth authorize. */
export const MEMBER_PASSWORD_MIN_LENGTH = 6;

export const MEMBER_PASSWORD_REQUIREMENT = `At least ${MEMBER_PASSWORD_MIN_LENGTH} characters`;

export const MEMBER_WRONG_CREDENTIALS_MESSAGE = "Email or password is not correct.";

export const MEMBER_EXISTING_ACCOUNT_MESSAGE =
  "An account with this email already exists. Sign in instead.";

export const MEMBER_EXISTING_ACCOUNT_API_ERROR = "An account with this email already exists.";

export const MEMBER_GOOGLE_ONLY_ACCOUNT_API_ERROR =
  "An account already exists with this email. Continue with Google to sign in.";

export const MEMBER_GOOGLE_ONLY_ACCOUNT_MESSAGE = MEMBER_GOOGLE_ONLY_ACCOUNT_API_ERROR;

export const SIGNUP_SUBTITLE =
  "Create a Mesa account to save favorite recipes and leave ratings and reviews.";

export const EMAIL_CONSENT_LABEL = "Email me about new recipes and Mesa updates";

export const EMAIL_CONSENT_HELPER = "Optional. You can change this later.";

export const PRIVACY_ACKNOWLEDGMENT =
  "By creating an account, you acknowledge our Privacy Policy.";

export function isValidSignupEmail(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed);
}

export function validateSignupFields(input: {
  name: string;
  email: string;
  password: string;
}): { field: "name" | "email" | "password"; message: string } | null {
  if (!input.name.trim()) {
    return { field: "name", message: "Enter your name." };
  }
  if (!input.email.trim()) {
    return { field: "email", message: "Enter your email." };
  }
  if (!isValidSignupEmail(input.email)) {
    return { field: "email", message: "Enter a valid email." };
  }
  if (input.password.length < MEMBER_PASSWORD_MIN_LENGTH) {
    return {
      field: "password",
      message: `Use at least ${MEMBER_PASSWORD_MIN_LENGTH} characters.`,
    };
  }
  return null;
}

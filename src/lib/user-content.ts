const MAX_NAME_LENGTH = 80;
const MAX_COMMENT_LENGTH = 5000;

export function sanitizePlainText(value: string, maxLength: number) {
  return value
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

export function validateReviewInput(input: {
  authorName: string;
  authorEmail: string;
  body: string;
  minBodyLength?: number;
}) {
  const authorName = sanitizePlainText(input.authorName, MAX_NAME_LENGTH);
  const authorEmail = input.authorEmail.trim().toLowerCase().slice(0, 254);
  const body = sanitizePlainText(input.body, MAX_COMMENT_LENGTH);
  const minBody = input.minBodyLength ?? 10;

  if (!authorName || !authorEmail || !body) {
    throw new Error("Name, email, and comment are required.");
  }
  if (authorName.length < 2) {
    throw new Error("Enter a valid name.");
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(authorEmail)) {
    throw new Error("Enter a valid email address.");
  }
  if (body.length < minBody) {
    throw new Error(`Comments must be at least ${minBody} characters.`);
  }

  return { authorName, authorEmail, body };
}

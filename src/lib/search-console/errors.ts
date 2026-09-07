export class SearchConsoleError extends Error {
  readonly code: string;
  readonly detail?: string;

  constructor(code: string, message: string, detail?: string) {
    super(message);
    this.name = "SearchConsoleError";
    this.code = code;
    this.detail = detail;
  }
}

export function searchConsoleErrorMessage(error: unknown): string {
  if (error instanceof SearchConsoleError) return error.message;
  if (error instanceof Error && error.message) return error.message;
  return "Search Console request failed.";
}

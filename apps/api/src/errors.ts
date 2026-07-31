import type { ApiErrorCode } from "@freshtrack/contracts";

export class AppError extends Error {
  public constructor(
    public readonly code: ApiErrorCode,
    message: string,
    public readonly status: 400 | 401 | 404 | 409 | 500,
    public readonly fields: Record<string, string[]> | undefined = undefined
  ) {
    super(message);
    this.name = "AppError";
  }
}

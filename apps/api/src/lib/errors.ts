export class AppError extends Error {
  status: number;
  code?: string;

  constructor(status: number, message: string, code?: string) {
    super(message);
    this.name = "AppError";
    this.status = status;
    this.code = code;
  }
}

export class RateLimitError extends AppError {
  constructor(message = "Too many requests. Please try again later.") {
    super(429, message, "RATE_LIMITED");
    this.name = "RateLimitError";
  }
}

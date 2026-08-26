export class AppError extends Error {
  statusCode: number;
  details?: unknown;

  constructor(statusCode: number, message: string, details?: unknown) {
    super(message);
    this.statusCode = statusCode;
    this.details = details;
    Object.setPrototypeOf(this, AppError.prototype);
  }
}

export function ok<T>(data: T, meta?: Record<string, unknown>) {
  return { success: true, data, ...(meta ?? {}) };
}

export function notFound(message = "Resource not found"): never {
  throw new AppError(404, message);
}

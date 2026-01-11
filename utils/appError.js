export class AppError extends Error {
  constructor(message, statusCode = 400, meta = {}) {
    super(message);
    this.statusCode = statusCode;
    this.meta = meta;
  }
}

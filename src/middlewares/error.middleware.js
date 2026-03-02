import { logger } from "../utils/logger.js";
import { errorResponse } from "../utils/response.js";

const errorMiddleware = (err, req, res, next) => {
  const isUnexpectedFile = err?.code === "LIMIT_UNEXPECTED_FILE";
  const statusCode = isUnexpectedFile ? 400 : err.statusCode || err.status || 500;
  const message = isUnexpectedFile
    ? "Please upload audio/cover directly to Firebase and send only URL metadata to this endpoint"
    : err.message || "Internal server error";

  logger.error(message, {
    statusCode,
    path: req.originalUrl,
    method: req.method,
    stack: err.stack,
  });

  if (res.headersSent) {
    return next(err);
  }

  const errors =
    process.env.NODE_ENV !== "production" ? { stack: err.stack } : undefined;

  return errorResponse(res, message, statusCode, errors);
};

export default errorMiddleware;

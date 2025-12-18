const formatMessage = (level, message, meta = {}) => {
  const timestamp = new Date().toISOString();
  const metadata = Object.keys(meta).length
    ? ` | meta=${JSON.stringify(meta)}`
    : "";
  return `[${timestamp}] [${level.toUpperCase()}] ${message}${metadata}`;
};

export const logger = {
  info: (message, meta) => console.log(formatMessage("info", message, meta)),
  warn: (message, meta) => console.warn(formatMessage("warn", message, meta)),
  error: (message, meta) =>
    console.error(formatMessage("error", message, meta)),
  debug: (message, meta) =>
    console.debug(formatMessage("debug", message, meta)),
};

export const requestLogger = (req, res, next) => {
  const start = Date.now();

  res.on("finish", () => {
    const duration = Date.now() - start;
    logger.info(`${req.method} ${req.originalUrl}`, {
      status: res.statusCode,
      duration: `${duration}ms`,
    });
  });

  next();
};

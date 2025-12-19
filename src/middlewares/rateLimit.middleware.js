const buckets = new Map();

const parseNumber = (value, defaultValue) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? defaultValue : parsed;
};

const DEFAULT_WINDOW_MS = parseNumber(process.env.RATE_LIMIT_WINDOW_MS, 60_000);
const DEFAULT_MAX = parseNumber(process.env.RATE_LIMIT_MAX, 30);

const rateLimitMiddleware = (options = {}) => {
  const windowMs = options.windowMs || DEFAULT_WINDOW_MS;
  const max = options.max || DEFAULT_MAX;

  return (req, res, next) => {
    const key = req.ip;
    const now = Date.now();
    const windowStart = now - windowMs;

    const attempts = buckets.get(key) || [];
    const recentAttempts = attempts.filter(
      (timestamp) => timestamp > windowStart
    );

    if (recentAttempts.length >= max) {
      return res.status(429).json({
        success: false,
        message: "Too many requests, please try again later.",
      });
    }

    recentAttempts.push(now);
    buckets.set(key, recentAttempts);
    return next();
  };
};

export default rateLimitMiddleware;

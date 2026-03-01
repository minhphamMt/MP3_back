import env from "./env.js";

const allowedOrigins = env.corsOrigins
  ? env.corsOrigins.split(",").map((origin) => origin.trim())
  : [];

const corsOptions = {
  origin: function (origin, callback) {
    // Cho phép Postman / server-to-server (không có origin)
    if (!origin) return callback(null, true);

    // Nếu chưa cấu hình ENV → cho phép hết (tránh crash production)
    if (allowedOrigins.length === 0) {
      console.warn("⚠ CORS_ORIGINS not set. Allowing all origins.");
      return callback(null, true);
    }

    // Cho phép localhost dev
    if (origin.startsWith("http://localhost")) {
      return callback(null, true);
    }

    // Cho phép tất cả vercel preview domain
    if (origin.includes("vercel.app")) {
      return callback(null, true);
    }

    // Whitelist chính thức
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    console.error("❌ Blocked by CORS:", origin);
    return callback(new Error("Not allowed by CORS"));
  },

  credentials: true,
  optionsSuccessStatus: 200,
};

export default corsOptions;
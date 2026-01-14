import env from "./env.js";

const allowedOrigins = env.corsOrigins
  ? env.corsOrigins.split(",").map((origin) => origin.trim())
  : [];

const corsOptions = {
  origin: function (origin, callback) {
    // Cho phép tool như Postman (origin = undefined)
    if (!origin) return callback(null, true);

    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    return callback(new Error("Not allowed by CORS"));
  },
  credentials: true,
  optionsSuccessStatus: 200,
};

export default corsOptions;

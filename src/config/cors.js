import env from "./env.js";

const allowedOrigins = env.corsOrigins
  ? env.corsOrigins.split(",").map((origin) => origin.trim())
  : ["*"];

const corsOptions = {
  origin:
    allowedOrigins.length === 1 && allowedOrigins[0] === "*"
      ? "*"
      : allowedOrigins,
  credentials: true,
  optionsSuccessStatus: 200,
};

export default corsOptions;

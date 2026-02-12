import express from "express";
import cors from "cors";
import "./config/env.js";
import corsOptions from "./config/cors.js";
import routes from "./routes/index.js";
import errorMiddleware from "./middlewares/error.middleware.js";
import { requestLogger } from "./utils/logger.js";
import storageConfig from "./config/upload.js";
import { resolvePublicUrl } from "./services/storage.service.js";
import path from "path";
import { fileURLToPath } from "url";

const app = express();

app.disable("x-powered-by");
app.use(cors(corsOptions));
app.use(express.json());
app.use(requestLogger);

const staticCacheOptions = {
  maxAge: "1h",
  etag: true,
  lastModified: true,
};

const redirectToPublicUrl = (req, res) => {
  const queryIndex = req.originalUrl.indexOf("?");
  const pathPart =
    queryIndex === -1 ? req.originalUrl : req.originalUrl.slice(0, queryIndex);
  const query = queryIndex === -1 ? "" : req.originalUrl.slice(queryIndex + 1);
  const targetUrl = resolvePublicUrl(pathPart);
  return res.redirect(query ? `${targetUrl}?${query}` : targetUrl);
};

if (storageConfig.driver === "local") {
  app.use(
    storageConfig.local.baseUrl,
    express.static(storageConfig.local.uploadDir, staticCacheOptions)
  );
} else {
  app.get(/^\/uploads\/.*/, redirectToPublicUrl);
  app.get(/^\/music\/.*/, redirectToPublicUrl);
}
// fix __dirname cho ES module
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
app.use("/api", routes);
if (storageConfig.driver === "local") {
  app.use(
    "/music",
    express.static(path.join(__dirname, "../uploads/music"), staticCacheOptions)
  );
  app.use("/uploads", express.static("uploads", staticCacheOptions));
}

app.use(errorMiddleware);

console.log("✅ Express app configured");
export default app;

import express from "express";
import cors from "cors";
import "./config/env.js";
import corsOptions from "./config/cors.js";
import routes from "./routes/index.js";
import errorMiddleware from "./middlewares/error.middleware.js";
import { requestLogger } from "./utils/logger.js";
import storageConfig from "./config/upload.js";
import path from "path";
import { fileURLToPath } from "url";

const app = express();

app.use(cors(corsOptions));
app.use(express.json());
app.use(requestLogger);

if (storageConfig.driver === "local") {
  app.use(
    storageConfig.local.baseUrl,
    express.static(storageConfig.local.uploadDir)
  );
}
// fix __dirname cho ES module
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use("/music", express.static(path.join(__dirname, "../uploads/music")));
app.use("/api", routes);
app.use("/uploads", express.static("uploads"));

app.use(errorMiddleware);

export default app;

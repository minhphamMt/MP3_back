import express from "express";
import cors from "cors";
import "./config/env.js";
import corsOptions from "./config/cors.js";
import routes from "./routes/index.js";
import errorMiddleware from "./middlewares/error.middleware.js";
import { requestLogger } from "./utils/logger.js";

const app = express();

app.use(cors(corsOptions));
app.use(express.json());
app.use(requestLogger);

app.use("/api", routes);

app.use(errorMiddleware);

export default app;

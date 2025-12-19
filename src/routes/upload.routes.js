import { Router } from "express";
import authMiddleware from "../middlewares/auth.middleware.js";
import rateLimitMiddleware from "../middlewares/rateLimit.middleware.js";
import { requestUpload } from "../controllers/upload.controller.js";

const router = Router();

router.post("/", rateLimitMiddleware(), authMiddleware, requestUpload);

export default router;

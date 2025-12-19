import { Router } from "express";
import { getRecommendationsHandler } from "../controllers/recommendation.controller.js";
import authMiddleware from "../middlewares/auth.middleware.js";

const router = Router();

router.get("/", authMiddleware, getRecommendationsHandler);

export default router;

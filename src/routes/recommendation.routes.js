import { Router } from "express";
import {
  getColdStartRecommendationsHandler,
  getRecommendationsHandler,
} from "../controllers/recommendation.controller.js";
import authMiddleware from "../middlewares/auth.middleware.js";

const router = Router();

router.get("/cold-start", getColdStartRecommendationsHandler);
router.get("/", authMiddleware, getRecommendationsHandler);

export default router;

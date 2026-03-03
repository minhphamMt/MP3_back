import { Router } from "express";
import { getColdStartRecommendationsHandler } from "../controllers/recommendation.controller.js";

const router = Router();

router.get("/cold-start", getColdStartRecommendationsHandler);

export default router;

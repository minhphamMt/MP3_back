import { Router } from "express";
import authMiddleware from "../middlewares/auth.middleware.js";
import { getMyListeningHistory } from "../controllers/history.controller.js";

const router = Router();

router.get("/me", authMiddleware, getMyListeningHistory);

export default router;

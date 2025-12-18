import { Router } from "express";
import * as searchController from "../controllers/search.controller.js";
import authMiddleware from "../middlewares/auth.middleware.js";

const router = Router();

router.get("/", searchController.search);
router.get("/history", authMiddleware, searchController.getHistory);

export default router;

import { Router } from "express";
import * as searchController from "../controllers/search.controller.js";
import authMiddleware from "../middlewares/auth.middleware.js";
import optionalAuthMiddleware from "../middlewares/optionalAuth.middleware.js";
const router = Router();

router.get("/", optionalAuthMiddleware, searchController.search);
router.get("/history", authMiddleware, searchController.getHistory);
router.post(
  "/save-history",
  authMiddleware,
  searchController.saveHistory
);

export default router;

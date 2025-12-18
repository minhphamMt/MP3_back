import { Router } from "express";
import db from "../config/db.js";
import authRoutes from "./auth.routes.js";
import userRoutes from "./user.routes.js";
import artistRoutes from "./artist.routes.js";
import albumRoutes from "./album.routes.js";
import songRoutes from "./song.routes.js";

const router = Router();

router.get("/health", async (req, res, next) => {
  try {
    await db.query("SELECT 1");
    res.json({ status: "ok" });
  } catch (error) {
    next(error);
  }
});

router.use("/auth", authRoutes);
router.use("/users", userRoutes);
router.use("/artists", artistRoutes);
router.use("/albums", albumRoutes);
router.use("/songs", songRoutes);

export default router;

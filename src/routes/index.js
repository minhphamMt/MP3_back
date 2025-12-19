import { Router } from "express";
import db from "../config/db.js";
import authRoutes from "./auth.routes.js";
import userRoutes from "./user.routes.js";
import artistRoutes from "./artist.routes.js";
import albumRoutes from "./album.routes.js";
import songRoutes from "./song.routes.js";
import playlistRoutes from "./playlist.routes.js";
import searchRoutes from "./search.routes.js";
import analyticsRoutes from "./analytics.routes.js";
import adminRoutes from "./admin.routes.js";
import uploadRoutes from "./upload.routes.js";

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
router.use("/playlists", playlistRoutes);
router.use("/search", searchRoutes);
router.use("/analytics", analyticsRoutes);
router.use("/admin", adminRoutes);
router.use("/uploads", uploadRoutes);

export default router;

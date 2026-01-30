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
import recommendationRoutes from "./recommendation.routes.js";
import songRecommendRoutes from "./song-recommend.routes.js";
import trashRoutes from "./trash.routes.js";
import { errorResponse, successResponse } from "../utils/response.js";
import historyRoutes from "./history.routes.js";
import chartRoutes from "./chart.routes.js";
const router = Router();

router.get("/health", async (req, res, next) => {
  try {
    await db.query("SELECT 1");
    return successResponse(
      res,
      { status: "ok" },
      null,
      200,
      "Health check successful"
    );
  } catch (error) {
    return next(error);
  }
});

const routeMappings = [
  { path: "/auth", handler: authRoutes },
  { path: "/users", handler: userRoutes },
  { path: "/artists", handler: artistRoutes },
  { path: "/albums", handler: albumRoutes },
  { path: "/songs", handler: songRoutes },
  { path: "/playlists", handler: playlistRoutes },
  { path: "/search", handler: searchRoutes },
  { path: "/analytics", handler: analyticsRoutes },
  { path: "/admin", handler: adminRoutes },
  { path: "/uploads", handler: uploadRoutes },
  { path: "/recommendations", handler: recommendationRoutes },
  { path: "/recommend", handler: songRecommendRoutes },
  { path: "/history", handler: historyRoutes },
   { path: "/charts", handler: chartRoutes },
   { path: "/trash", handler: trashRoutes },
];

routeMappings.forEach(({ path, handler }) => {
  router.use(path, handler);
});

router.use((req, res) => errorResponse(res, "Route not found", 404));

export default router;

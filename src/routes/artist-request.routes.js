import { Router } from "express";
import authMiddleware from "../middlewares/auth.middleware.js";
import validate from "../middlewares/validate.middleware.js";
import {
  createArtistRequestHandler,
  getMyArtistRequest,
} from "../controllers/artist-request.controller.js";
import { createArtistRequestSchema } from "../validations/artist-request.schema.js";

const router = Router();

router.use(authMiddleware);

router.post(
  "/",
  validate(createArtistRequestSchema),
  createArtistRequestHandler
);
router.get("/me", getMyArtistRequest);

export default router;

import { Router } from "express";
import authMiddleware from "../middlewares/auth.middleware.js";
import validate from "../middlewares/validate.middleware.js";
import {
  createArtistRequestHandler,
  getMyArtistRequest,
  updateMyArtistRequestHandler,
} from "../controllers/artist-request.controller.js";
import {
  createArtistRequestSchema,
  updateArtistRequestSchema,
} from "../validations/artist-request.schema.js";

const router = Router();

router.use(authMiddleware);

router.post(
  "/",
  validate(createArtistRequestSchema),
  createArtistRequestHandler
);
router.patch(
  "/me",
  validate(updateArtistRequestSchema),
  updateMyArtistRequestHandler
);
router.get("/me", getMyArtistRequest);

export default router;

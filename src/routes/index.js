import { Router } from "express";
import db from "../config/db.js";

const router = Router();

router.get("/health", async (req, res, next) => {
  try {
    await db.query("SELECT 1");
    res.json({ status: "ok" });
  } catch (error) {
    next(error);
  }
});

export default router;

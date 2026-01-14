import { Router } from "express";
import * as chartController from "../controllers/chart.controller.js";
import { getRegionCharts } from "../controllers/chart.controller.js";
const router = Router();

router.get("/zing", chartController.zingChart);
router.get("/new-release", chartController.newReleaseChart);
router.get("/top-100", chartController.top100Chart);
router.get("/zing/series", chartController.zingChartSeries);
router.get("/regions", getRegionCharts);
router.get("/weekly/top5", chartController.getWeeklyTop5Songs);
router.get("/weekly/series", chartController.getWeeklyTop5Series);
router.get("/top-50/genres", chartController.getTop50ByGenres);
export default router;

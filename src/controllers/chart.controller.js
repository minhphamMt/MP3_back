import {
  getZingChart,
  getNewReleaseChart,
  getTop100Chart,
  getTopWeeklySongs,
  getWeeklyTop5,
  getTop50SongsByGenres 
} from "../services/chart.service.js";
import { successResponse } from "../utils/response.js";
import { getSongDailySeries } from "../services/chart.service.js";
import { buildDailySeries } from "../services/chart.utils.js";
import { getMultiRegionChart } from "../services/chart.service.js";
export const zingChart = async (req, res, next) => {
  try {
    const limit = Math.min(
      100,
      Math.max(1, Number.parseInt(req.query.limit, 10) || 10)
    );
    const period =
      typeof req.query.period === "string" ? req.query.period.trim() : undefined;

    const data = await getZingChart({ limit, period });
    return successResponse(res, data);
  } catch (error) {
    return next(error);
  }
};

export const newReleaseChart = async (req, res, next) => {
  try {
    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
    const limit = Math.min(
      50,
      Math.max(1, Number.parseInt(req.query.limit, 10) || 20)
    );

    const data = await getNewReleaseChart({ page, limit });
    return successResponse(res, data);
  } catch (error) {
    return next(error);
  }
};

export const top100Chart = async (req, res, next) => {
  try {
    const data = await getTop100Chart();
    return successResponse(res, data);
  } catch (error) {
    return next(error);
  }
};
export const zingChartSeries = async (req, res, next) => {
  try {
    const days = Number(req.query.days) || 7;

    // Lấy top 3 bài từ zing chart
    const topSongs = (await getZingChart()).slice(0, 5);

    const series = [];

    for (const item of topSongs) {
      const raw = await getSongDailySeries(item.song.id, days);
      const data = buildDailySeries(raw, days);

      series.push({
        song: item.song,
        artist: item.artist,
        data,
      });
    }

    return successResponse(res, {
      days,
      series,
    });
  } catch (error) {
    return next(error);
  }
};
export const getRegionCharts = async (req, res, next) => {
  try {
    const limit = Number(req.query.limit) || 5;
    const data = await getMultiRegionChart(limit);
    return successResponse(res, data);
  } catch (err) {
    return next(err);
  }
};
export const getWeeklyTop5Songs = async (req, res, next) => {
  try {
    const songs = await getTopWeeklySongs(5);
    return successResponse(res, songs);
  } catch (error) {
    return next(error);
  }
};
export const getWeeklyTop5Series = async (req, res, next) => {
  try {
    const data = await getWeeklyTop5();
    return successResponse(res, data);
  } catch (error) {
    return next(error);
  }
};
export const getTop50ByGenres = async (req, res, next) => {
  try {
    const data = await getTop50SongsByGenres();
    return successResponse(res, data);
  } catch (error) {
    next(error);
  }
};

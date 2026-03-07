import { jest } from "@jest/globals";
import {
  getCurrentDateInTimeZone,
  getStartOfWeekDateString,
  shiftDateString,
} from "../utils/date-tz.js";

const mockDb = {
  query: jest.fn(),
};

jest.unstable_mockModule("../config/db.js", () => ({
  default: mockDb,
}));

const {
  getTopWeeklySongs,
  getWeeklyTop5,
  getNewReleaseChart,
  getZingChart,
  getTop5ChartData,
} = await import(
  "../services/chart.service.js"
);



describe("chart.service new release pagination", () => {
  beforeEach(() => {
    mockDb.query.mockReset();
  });

  it("returns paginated songs with flat song payload", async () => {
    mockDb.query.mockResolvedValueOnce([[
      {
        id: 7,
        title: "Fresh Song",
        cover_url: "fresh.jpg",
        duration: 210,
        release_date: "2024-10-01",
        album_id: 9,
        album_title: "Fresh Album",
        artist_id: 3,
        artist_name: "Fresh Artist",
      },
    ]]);

    const result = await getNewReleaseChart({ page: 2, limit: 1 });

    expect(mockDb.query).toHaveBeenCalledWith(expect.stringContaining("LIMIT ? OFFSET ?"), [1, 1]);
    expect(result).toEqual({
      page: 2,
      limit: 1,
      hasMore: true,
      songs: [
        {
          id: 7,
          title: "Fresh Song",
          cover_url: "fresh.jpg",
          duration: 210,
          release_date: "2024-10-01",
          album: { id: 9, title: "Fresh Album" },
          artist: { id: 3, name: "Fresh Artist" },
        },
      ],
    });
  });

  it("normalizes invalid paging input", async () => {
    mockDb.query.mockResolvedValueOnce([[]]);

    const result = await getNewReleaseChart({ page: -2, limit: 999 });

    expect(mockDb.query).toHaveBeenCalledWith(expect.stringContaining("LIMIT ? OFFSET ?"), [50, 0]);
    expect(result).toEqual({
      page: 1,
      limit: 50,
      hasMore: false,
      songs: [],
    });
  });
});

describe("chart.service zing chart realtime ranking", () => {
  beforeEach(() => {
    mockDb.query.mockReset();
  });

  it("uses daily song_play_stats by default so chart updates within the current day", async () => {
    mockDb.query.mockResolvedValueOnce([
      [
        {
          id: 11,
          title: "Today Hit",
          cover_url: "today.jpg",
          duration: 200,
          total_play_count: 1000,
          period_play_count: 48,
          artist_id: 7,
          artist_name: "Realtime Artist",
        },
      ],
    ]);

    const result = await getZingChart({ limit: 1 });

    expect(mockDb.query).toHaveBeenCalledWith(
      expect.stringContaining("FROM song_play_stats sp"),
      ["day", expect.any(String), 1]
    );
    expect(result).toEqual([
      {
        rank: 1,
        song: {
          id: 11,
          title: "Today Hit",
          cover_url: "today.jpg",
          duration: 200,
        },
        artist: {
          id: 7,
          name: "Realtime Artist",
        },
        playCount: 1000,
        periodPlayCount: 48,
        period: "day",
      },
    ]);
  });

  it("fills remaining slots from all-time plays when the current period has too few songs", async () => {
    mockDb.query
      .mockResolvedValueOnce([
        [
          {
            id: 1,
            title: "Daily Winner",
            cover_url: "daily.jpg",
            duration: 210,
            total_play_count: 500,
            period_play_count: 20,
            artist_id: 4,
            artist_name: "Daily Artist",
          },
        ],
      ])
      .mockResolvedValueOnce([
        [
          {
            id: 2,
            title: "Catalog Hit",
            cover_url: "catalog.jpg",
            duration: 180,
            total_play_count: 9999,
            period_play_count: 0,
            artist_id: 5,
            artist_name: "Legacy Artist",
          },
        ],
      ]);

    const result = await getZingChart({ limit: 2 });

    expect(mockDb.query).toHaveBeenCalledTimes(2);
    expect(mockDb.query.mock.calls[1][0]).toContain("s.id NOT IN (?)");
    expect(mockDb.query.mock.calls[1][1]).toEqual([1, 1]);
    expect(result.map((item) => item.song.id)).toEqual([1, 2]);
    expect(result[1].periodPlayCount).toBe(0);
  });

  it("supports total period for clients that still need the legacy all-time ranking", async () => {
    mockDb.query.mockResolvedValueOnce([
      [
        {
          id: 21,
          title: "All Time Hit",
          cover_url: "alltime.jpg",
          duration: 190,
          total_play_count: 12345,
          period_play_count: 0,
          artist_id: 8,
          artist_name: "Archive Artist",
        },
      ],
    ]);

    const result = await getZingChart({ period: "total", limit: 1 });

    expect(mockDb.query).toHaveBeenCalledTimes(1);
    expect(mockDb.query.mock.calls[0][0]).toContain("ORDER BY s.play_count DESC");
    expect(mockDb.query.mock.calls[0][1]).toEqual([1]);
    expect(result[0].period).toBe("total");
    expect(result[0].playCount).toBe(12345);
  });
});

describe("chart.service top5 chart data", () => {
  beforeEach(() => {
    mockDb.query.mockReset();
  });

  it("returns a daily top 5 chart with 7 labels ending at today when today has data", async () => {
    const currentDay = getCurrentDateInTimeZone();
    const labelStart = shiftDateString(currentDay, -6);
    const previousDay = shiftDateString(currentDay, -1);

    mockDb.query
      .mockResolvedValueOnce([[{ day_start: currentDay }]])
      .mockResolvedValueOnce([
        [
          {
            id: 1,
            title: "Daily Song",
            cover_url: "daily.jpg",
            duration: 200,
            total_play_count: 500,
            period_play_count: 25,
            artist_id: 2,
            artist_name: "Daily Artist",
          },
        ],
      ])
      .mockResolvedValueOnce([
        [
          { song_id: 1, period_start: previousDay, play_count: 12 },
          { song_id: 1, period_start: currentDay, play_count: 25 },
        ],
      ]);

    const result = await getTop5ChartData({ period: "day", limit: 5 });

    expect(result.period).toBe("day");
    expect(result.requestedPeriodStart).toBe(currentDay);
    expect(result.effectivePeriodStart).toBe(currentDay);
    expect(result.fallbackApplied).toBe(false);
    expect(result.labels).toEqual(
      Array.from({ length: 7 }, (_, index) => shiftDateString(labelStart, index))
    );
    expect(result.songs[0]).toMatchObject({
      rank: 1,
      period: "day",
      playCount: 500,
      periodPlayCount: 25,
    });
    expect(result.songs[0].series).toEqual([0, 0, 0, 0, 0, 12, 25]);
  });

  it("falls back to the latest available day within the last 7 days when today has no listens", async () => {
    const currentDay = getCurrentDateInTimeZone();
    const effectiveDay = shiftDateString(currentDay, -2);
    const labelStart = shiftDateString(effectiveDay, -6);

    mockDb.query
      .mockResolvedValueOnce([[{ day_start: effectiveDay }]])
      .mockResolvedValueOnce([
        [
          {
            id: 9,
            title: "Fallback Song",
            cover_url: "fallback.jpg",
            duration: 180,
            total_play_count: 900,
            period_play_count: 19,
            artist_id: 4,
            artist_name: "Fallback Artist",
          },
        ],
      ])
      .mockResolvedValueOnce([
        [
          { song_id: 9, period_start: shiftDateString(effectiveDay, -4), play_count: 3 },
          { song_id: 9, period_start: shiftDateString(effectiveDay, -2), play_count: 7 },
          { song_id: 9, period_start: effectiveDay, play_count: 19 },
        ],
      ]);

    const result = await getTop5ChartData({ period: "day" });

    expect(result.requestedPeriodStart).toBe(currentDay);
    expect(result.effectivePeriodStart).toBe(effectiveDay);
    expect(result.fallbackApplied).toBe(true);
    expect(result.fallbackReason).toBe("latest_available_day_in_last_7_days");
    expect(result.labels).toEqual(
      Array.from({ length: 7 }, (_, index) => shiftDateString(labelStart, index))
    );
    expect(result.songs[0].series).toEqual([0, 0, 3, 0, 7, 0, 19]);
  });

  it("returns weekly chart data for the latest available week", async () => {
    const currentDay = getCurrentDateInTimeZone();
    const currentWeekStart = getStartOfWeekDateString(currentDay);

    mockDb.query
      .mockResolvedValueOnce([[{ week_start: currentWeekStart }]])
      .mockResolvedValueOnce([
        [
          {
            id: 3,
            title: "Weekly Song",
            cover_url: "weekly.jpg",
            duration: 220,
            total_play_count: 1500,
            period_play_count: 70,
            artist_id: 6,
            artist_name: "Weekly Artist",
          },
        ],
      ])
      .mockResolvedValueOnce([
        [
          { song_id: 3, period_start: shiftDateString(currentWeekStart, 0), play_count: 10 },
          { song_id: 3, period_start: shiftDateString(currentWeekStart, 1), play_count: 11 },
          { song_id: 3, period_start: shiftDateString(currentWeekStart, 2), play_count: 12 },
          { song_id: 3, period_start: shiftDateString(currentWeekStart, 3), play_count: 13 },
          { song_id: 3, period_start: shiftDateString(currentWeekStart, 4), play_count: 8 },
          { song_id: 3, period_start: shiftDateString(currentWeekStart, 5), play_count: 9 },
          { song_id: 3, period_start: shiftDateString(currentWeekStart, 6), play_count: 7 },
        ],
      ]);

    const result = await getTop5ChartData({ period: "week", limit: 5 });

    expect(result.period).toBe("week");
    expect(result.effectivePeriodStart).toBe(currentWeekStart);
    expect(result.labels).toEqual(
      Array.from({ length: 7 }, (_, index) =>
        shiftDateString(currentWeekStart, index)
      )
    );
    expect(result.songs[0].series).toEqual([10, 11, 12, 13, 8, 9, 7]);
  });
});

describe("chart.service weekly fallback", () => {
  beforeEach(() => {
    mockDb.query.mockReset();
  });

  it("falls back to top songs from recent 3 months when no weekly snapshot exists", async () => {
    mockDb.query
      .mockResolvedValueOnce([[{ week_start: null }]])
      .mockResolvedValueOnce([
        [
          {
            id: 10,
            title: "Recent Song",
            cover_url: "cover.jpg",
            duration: 180,
            artist_name: "Recent Artist",
            weekly_play_count: 321,
          },
        ],
      ])
      .mockResolvedValueOnce([[]]);

    const result = await getTopWeeklySongs(5);

    expect(result).toHaveLength(1);
    expect(result[0].title).toBe("Recent Song");
    expect(mockDb.query).toHaveBeenCalledTimes(3);
    expect(mockDb.query.mock.calls[1][0]).toContain(
      "DATE_SUB(CURDATE(), INTERVAL 3 MONTH)"
    );
  });

  it("adds an extended fallback layer when recent 3-month songs are not enough", async () => {
    mockDb.query
      .mockResolvedValueOnce([[{ week_start: null }]])
      .mockResolvedValueOnce([
        [
          {
            id: 1,
            title: "Recent Song",
            cover_url: "recent.jpg",
            duration: 200,
            artist_name: "Recent Artist",
            weekly_play_count: 90,
          },
        ],
      ])
      .mockResolvedValueOnce([
        [
          {
            id: 2,
            title: "Older Song",
            cover_url: "older.jpg",
            duration: 210,
            artist_name: "Older Artist",
            weekly_play_count: 80,
          },
        ],
      ]);

    const result = await getTopWeeklySongs(2);

    expect(result).toHaveLength(2);
    expect(result.map((item) => item.id)).toEqual([1, 2]);
    expect(mockDb.query.mock.calls[2][0]).toContain("s.id NOT IN (?)");
    expect(mockDb.query.mock.calls[2][1]).toEqual([1, 1]);
  });

  it("uses latest available week instead of returning empty", async () => {
    mockDb.query
      .mockResolvedValueOnce([[{ week_start: "2024-09-02" }]])
      .mockResolvedValueOnce([
        [
          {
            id: 1,
            title: "Week Song",
            cover_url: "week.jpg",
            duration: 200,
            artist_name: "Week Artist",
            weekly_play_count: 99,
          },
        ],
      ]);

    const result = await getTopWeeklySongs(5);

    expect(result).toHaveLength(1);
    expect(result[0].weekly_play_count).toBe(99);
    expect(mockDb.query.mock.calls[0][1]).toEqual([expect.any(String)]);
    expect(mockDb.query.mock.calls[1][1]).toEqual(["2024-09-02", 5]);
  });

  it("returns empty series when no weekly data is available", async () => {
    mockDb.query.mockResolvedValueOnce([[{ week_start: null }]]);

    const result = await getWeeklyTop5();

    expect(result).toEqual([]);
    expect(mockDb.query).toHaveBeenCalledTimes(1);
    expect(mockDb.query.mock.calls[0][1]).toEqual([expect.any(String)]);
  });
});

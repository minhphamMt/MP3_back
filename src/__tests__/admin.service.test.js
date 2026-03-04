import { jest } from "@jest/globals";

const mockQuery = jest.fn();
const mockGetTopWeeklySongs = jest.fn();

jest.unstable_mockModule("../config/db.js", () => ({
  default: {
    query: mockQuery,
  },
}));

jest.unstable_mockModule("../services/chart.service.js", () => ({
  getTopWeeklySongs: mockGetTopWeeklySongs,
}));

const { getAdminCharts, __private__ } = await import("../services/admin.service.js");

describe("admin.service charts", () => {
  beforeEach(() => {
    jest.clearAllMocks();

    mockQuery.mockImplementation((sql) => {
      if (String(sql).includes("information_schema.columns")) {
        return Promise.resolve([[{ COLUMN_NAME: "is_deleted" }]]);
      }

      if (String(sql).startsWith("CREATE INDEX")) {
        return Promise.resolve([[]]);
      }

      if (String(sql).includes("FROM songs s") && String(sql).includes("GROUP BY status")) {
        return Promise.resolve([[{ status: "approved", value: 2 }]]);
      }

      if (String(sql).includes("FROM song_genres")) {
        return Promise.resolve([
          [
            {
              genre: "Pop",
              pending: 1,
              approved: 2,
              rejected: 0,
              total: 3,
            },
          ],
        ]);
      }

      if (String(sql).includes("GROUP BY role")) {
        return Promise.resolve([[{ role: "USER", total: 5 }]]);
      }

      if (String(sql).includes("SUM(CASE WHEN is_active = 1")) {
        return Promise.resolve([[{ active: 4, inactive: 1 }]]);
      }

      if (String(sql).includes("FROM artist_requests")) {
        return Promise.resolve([[{ bucket_key: "2026-03-02", count: 3 }]]);
      }

      if (String(sql).includes("FROM albums al")) {
        return Promise.resolve([[{ month: "2026-03", count: 7 }]]);
      }

      return Promise.resolve([[]]);
    });

    mockGetTopWeeklySongs.mockResolvedValue([
      { id: 1, title: "Song A", artist_name: "Artist A", score: 99 },
    ]);
  });

  it("fills missing dates/months with zero and groups by timezone", async () => {
    const result = await getAdminCharts({
      from: "2026-03-01",
      to: "2026-03-03",
      tz: "Asia/Ho_Chi_Minh",
      include: "artist_request_trend,album_by_month",
    });

    expect(result.artist_request_trend).toEqual([
      { date: "2026-03-01", count: 0 },
      { date: "2026-03-02", count: 3 },
      { date: "2026-03-03", count: 0 },
    ]);

    expect(result.album_by_month).toEqual([{ month: "2026-03", count: 7 }]);

    const trendQueryCall = mockQuery.mock.calls.find(([sql]) =>
      String(sql).includes("FROM artist_requests")
    );
    expect(trendQueryCall[1][0]).toBe("Asia/Ho_Chi_Minh");
  });

  it("returns standardized chart response shape", async () => {
    const result = await getAdminCharts({
      from: "2026-03-01",
      to: "2026-03-03",
      tz: "Asia/Ho_Chi_Minh",
      include:
        "song_status,weekly_top,genre_status,user_distribution,artist_request_trend,album_by_month",
    });

    expect(result.meta).toEqual({
      from: "2026-03-01",
      to: "2026-03-03",
      tz: "Asia/Ho_Chi_Minh",
      bucket: "day",
    });
    expect(result.song_status).toBeDefined();
    expect(result.weekly_top).toBeDefined();
    expect(result.genre_status).toBeDefined();
    expect(result.user_distribution).toEqual({
      role: { USER: 5, ARTIST: 0, ADMIN: 0 },
      activity: { active: 4, inactive: 1 },
    });
  });

  it("normalizes include list", () => {
    expect(__private__.normalizeInclude("song_status,abc")).toEqual([
      "song_status",
    ]);
  });
});

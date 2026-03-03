import { jest } from "@jest/globals";

const mockDb = {
  query: jest.fn(),
};

jest.unstable_mockModule("../config/db.js", () => ({
  default: mockDb,
}));

const { getTopWeeklySongs, getWeeklyTop5 } = await import(
  "../services/chart.service.js"
);

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
    expect(mockDb.query.mock.calls[1][1]).toEqual(["2024-09-02", 5]);
  });

  it("returns empty series when no weekly data is available", async () => {
    mockDb.query.mockResolvedValueOnce([[{ week_start: null }]]);

    const result = await getWeeklyTop5();

    expect(result).toEqual([]);
    expect(mockDb.query).toHaveBeenCalledTimes(1);
  });
});

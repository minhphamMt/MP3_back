import { jest } from "@jest/globals";

const mockDb = {
  query: jest.fn(),
};

jest.unstable_mockModule("../config/db.js", () => ({
  default: mockDb,
}));

const { getTopSongsAnalytics, getTopArtistsAnalytics } = await import(
  "../services/analytics.service.js"
);

describe("analytics.service", () => {
  const startDate = "2024-01-01T00:00:00.000Z";
  const endDate = "2024-01-02T23:59:59.000Z";

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date("2024-02-01T12:00:00.000Z"));
    mockDb.query.mockReset();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("returns top songs metrics using listened_at and duration", async () => {
    mockDb.query
      .mockResolvedValueOnce([
        [
          {
            song_id: 1,
            title: "Song A",
            artist_id: 2,
            artist_name: "Artist B",
            total_plays: 3,
            total_duration: 180000,
          },
        ],
      ])
      .mockResolvedValueOnce([
        [
          {
            song_id: 1,
            period_start: "2024-01-01",
            plays: 2,
            duration: 120000,
          },
          {
            song_id: 1,
            period_start: "2024-01-02",
            plays: 1,
            duration: 60000,
          },
        ],
      ]);

    const response = await getTopSongsAnalytics({
      startDate,
      endDate,
      interval: "day",
      limit: 5,
    });

    expect(mockDb.query).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining("WHERE lh.listened_at BETWEEN ? AND ?"),
      [expect.any(Date), expect.any(Date), 5]
    );
    expect(mockDb.query.mock.calls[1][0]).toContain("DATE(lh.listened_at)");

    expect(response).toEqual({
      range: { start: "2024-01-01", end: "2024-01-02", interval: "day" },
      items: [
        {
          id: 1,
          totalPlays: 3,
          totalDuration: 180000,
          song: { id: 1, title: "Song A" },
          artist: { id: 2, name: "Artist B" },
          series: [
            { period: "2024-01-01", plays: 2, duration: 120000 },
            { period: "2024-01-02", plays: 1, duration: 60000 },
          ],
        },
      ],
    });
  });

  it("returns an empty response when no artist history exists", async () => {
    mockDb.query.mockResolvedValueOnce([[]]);

    const response = await getTopArtistsAnalytics({
      startDate: "2024-02-01T00:00:00.000Z",
      endDate: "2024-02-03T00:00:00.000Z",
      interval: "week",
    });

    expect(mockDb.query).toHaveBeenCalledTimes(1);
    expect(mockDb.query.mock.calls[0][0]).toContain(
      "WHERE lh.listened_at BETWEEN ? AND ?"
    );
    expect(response).toEqual({
      range: { start: "2024-02-01", end: "2024-02-03", interval: "week" },
      items: [],
    });
  });
});

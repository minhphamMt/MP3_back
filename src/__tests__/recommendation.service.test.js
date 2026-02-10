import { jest } from "@jest/globals";

const mockDb = {
  query: jest.fn(),
};

const loadService = async () => {
  jest.unstable_mockModule("../config/db.js", () => ({
    default: mockDb,
  }));

  const module = await import("../services/recommendation.service.js");
  return module;
};

describe("getColdStartRecommendations", () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  it("returns diversified results for guests in cold-start mode", async () => {
    mockDb.query.mockResolvedValueOnce([
      [
        {
          id: 1,
          title: "Popular One",
          artist_id: 10,
          artist_name: "Artist A",
          cover_url: "cover-1.jpg",
          play_count: 900000,
          release_date: "2026-01-01",
          source: "popular",
        },
        {
          id: 2,
          title: "Popular Two",
          artist_id: 10,
          artist_name: "Artist A",
          cover_url: "cover-2.jpg",
          play_count: 800000,
          release_date: "2026-01-01",
          source: "popular",
        },
        {
          id: 3,
          title: "Popular Three",
          artist_id: 10,
          artist_name: "Artist A",
          cover_url: "cover-3.jpg",
          play_count: 700000,
          release_date: "2026-01-01",
          source: "popular",
        },
      ],
    ]);

    mockDb.query.mockResolvedValueOnce([
      [
        {
          id: 4,
          title: "Fresh One",
          artist_id: 11,
          artist_name: "Artist B",
          cover_url: "cover-4.jpg",
          play_count: 100000,
          release_date: "2026-02-01",
          source: "fresh",
        },
      ],
    ]);

    mockDb.query.mockResolvedValueOnce([
      [
        {
          id: 5,
          title: "Explore One",
          artist_id: 12,
          artist_name: "Artist C",
          cover_url: "cover-5.jpg",
          play_count: 5000,
          release_date: "2025-12-01",
          source: "explore",
        },
      ],
    ]);

    const { getColdStartRecommendations } = await loadService();

    const result = await getColdStartRecommendations(5);

    expect(mockDb.query).toHaveBeenCalledTimes(3);
    expect(result).toHaveLength(4);
    expect(result.map((item) => item.songId)).toEqual([1, 2, 4, 5]);
    expect(result.filter((item) => item.artistId === 10)).toHaveLength(2);
    expect(result[0]).toMatchObject({
      songId: 1,
      title: "Popular One",
      reason: "popular",
    });
  });
});

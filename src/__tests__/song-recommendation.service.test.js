import { jest } from "@jest/globals";

const mockDb = {
  query: jest.fn(),
};

const loadService = async () => {
  jest.unstable_mockModule("../config/db.js", () => ({
    default: mockDb,
  }));

  return import("../services/song-recommendation.service.js");
};

describe("song recommendation service", () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  it("filters out low-similarity candidates to avoid off-topic recommendations", async () => {
    mockDb.query.mockResolvedValueOnce([
      [
        {
          id: 1,
          title: "Chiu Cach Minh Noi Thua",
          artist_id: 10,
          album_id: 100,
          genres: "V-Pop,Rap",
        },
      ],
    ]);

    mockDb.query.mockResolvedValueOnce([
      [
        { type: "audio", vector: JSON.stringify([1, 0]) },
        { type: "metadata", vector: JSON.stringify([1, 0]) },
      ],
    ]);

    mockDb.query.mockResolvedValueOnce([
      [
        {
          id: 2,
          title: "Song cùng style",
          artist_id: 11,
          album_id: 101,
          genres: "V-Pop,Rap",
          audio_vector: JSON.stringify([0.9, 0.1]),
          meta_vector: JSON.stringify([0.95, 0.05]),
        },
        {
          id: 3,
          title: "Nhạc cổ không liên quan",
          artist_id: 99,
          album_id: 999,
          genres: "Bolero",
          audio_vector: JSON.stringify([0, 1]),
          meta_vector: JSON.stringify([0, 1]),
        },
      ],
    ]);

    const { getSimilarSongs } = await loadService();

    const result = await getSimilarSongs(1, null);

    expect(result).toHaveLength(1);
    expect(result[0].songId).toBe(2);
    expect(result[0].score).toBeGreaterThan(0.3);
  });

  it("prioritizes specific genre overlap over broad country genres in fallback mode", async () => {
    mockDb.query.mockResolvedValueOnce([
      [
        {
          id: 10,
          title: "Track nguồn",
          artist_id: 20,
          album_id: 200,
          genres: "Rap Việt,Việt Nam",
        },
      ],
    ]);

    mockDb.query.mockResolvedValueOnce([
      [
        { type: "audio", vector: JSON.stringify([1, 0]) },
        { type: "metadata", vector: JSON.stringify([1, 0]) },
      ],
    ]);

    // Stage candidates fail thresholds -> trigger fallback
    mockDb.query.mockResolvedValueOnce([
      [
        {
          id: 11,
          title: "Yếu embedding",
          artist_id: 21,
          album_id: 201,
          genres: "Việt Nam",
          audio_vector: JSON.stringify([0, 1]),
          meta_vector: JSON.stringify([0, 1]),
        },
      ],
    ]);

    mockDb.query.mockResolvedValueOnce([
      [
        {
          id: 30,
          title: "Rap đúng gu",
          artist_id: 31,
          album_id: 301,
          play_count: 100,
          genres: "Rap Việt",
          same_artist: 0,
          same_album: 0,
        },
        {
          id: 31,
          title: "Chỉ cùng quốc gia",
          artist_id: 32,
          album_id: 302,
          play_count: 100000,
          genres: "Việt Nam",
          same_artist: 0,
          same_album: 0,
        },
      ],
    ]);

    const { getSimilarSongs } = await loadService();

    const result = await getSimilarSongs(10, null);

    expect(result.length).toBeGreaterThan(0);
    expect(result[0].songId).toBe(30);
    expect(result.find((item) => item.songId === 31)).toBeUndefined();
  });
});

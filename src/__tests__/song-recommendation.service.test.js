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

  it("uses same artist, genre, and album when the source song has no embeddings", async () => {
    mockDb.query.mockResolvedValueOnce([
      [
        {
          id: 50,
          title: "Bai nguon khong embedding",
          artist_id: 7,
          album_id: 70,
          genres: "Ballad",
        },
      ],
    ]);

    mockDb.query.mockResolvedValueOnce([[]]);

    mockDb.query.mockResolvedValueOnce([
      [
        {
          id: 51,
          title: "Cung nghe si cung album",
          artist_id: 7,
          album_id: 70,
          play_count: 1000,
          genres: "Ballad",
          same_artist: 1,
          same_album: 1,
        },
        {
          id: 52,
          title: "Cung the loai",
          artist_id: 8,
          album_id: 80,
          play_count: 500000,
          genres: "Ballad",
          same_artist: 0,
          same_album: 0,
        },
        {
          id: 53,
          title: "Hit khong lien quan",
          artist_id: 99,
          album_id: 900,
          play_count: 2000000,
          genres: "EDM",
          same_artist: 0,
          same_album: 0,
        },
      ],
    ]);

    const { getSimilarSongs } = await loadService();

    const result = await getSimilarSongs(50, null);

    expect(mockDb.query).toHaveBeenCalledTimes(3);
    expect(result.map((item) => item.songId)).toEqual([51, 52]);
    expect(result.find((item) => item.songId === 53)).toBeUndefined();
    expect(result[0].score).toBeGreaterThan(result[1].score);
  });

  it("keeps same-artist fallback results ahead of popular genre-only songs", async () => {
    mockDb.query.mockResolvedValueOnce([
      [
        {
          id: 70,
          title: "Nguon fallback",
          artist_id: 7,
          album_id: 70,
          genres: "Ballad",
        },
      ],
    ]);

    mockDb.query.mockResolvedValueOnce([[]]);

    mockDb.query.mockResolvedValueOnce([
      [
        {
          id: 71,
          title: "Same artist same album",
          artist_id: 7,
          album_id: 70,
          play_count: 100,
          genres: "Ballad",
          same_artist: 1,
          same_album: 1,
        },
        {
          id: 72,
          title: "Same artist 1",
          artist_id: 7,
          album_id: 701,
          play_count: 200,
          genres: "Ballad",
          same_artist: 1,
          same_album: 0,
        },
        {
          id: 73,
          title: "Same artist 2",
          artist_id: 7,
          album_id: 702,
          play_count: 300,
          genres: "Ballad",
          same_artist: 1,
          same_album: 0,
        },
        {
          id: 74,
          title: "Same artist 3",
          artist_id: 7,
          album_id: 703,
          play_count: 400,
          genres: "Ballad",
          same_artist: 1,
          same_album: 0,
        },
        {
          id: 75,
          title: "Same artist 4",
          artist_id: 7,
          album_id: 704,
          play_count: 500,
          genres: "Ballad",
          same_artist: 1,
          same_album: 0,
        },
        {
          id: 90,
          title: "Popular genre 1",
          artist_id: 90,
          album_id: 900,
          play_count: 2000000,
          genres: "Ballad",
          same_artist: 0,
          same_album: 0,
        },
        {
          id: 91,
          title: "Popular genre 2",
          artist_id: 91,
          album_id: 901,
          play_count: 1900000,
          genres: "Ballad",
          same_artist: 0,
          same_album: 0,
        },
      ],
    ]);

    const { getSimilarSongs } = await loadService();

    const result = await getSimilarSongs(70, null);
    const topFiveIds = result.slice(0, 5).map((item) => item.songId);

    expect(topFiveIds.sort((a, b) => a - b)).toEqual([71, 72, 73, 74, 75]);
    expect(result.findIndex((item) => item.songId === 90)).toBeGreaterThanOrEqual(5);
    expect(result.findIndex((item) => item.songId === 91)).toBeGreaterThanOrEqual(5);
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

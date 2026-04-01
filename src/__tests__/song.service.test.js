import { jest } from "@jest/globals";

const mockConnection = {
  beginTransaction: jest.fn(),
  query: jest.fn(),
  commit: jest.fn(),
  rollback: jest.fn(),
  release: jest.fn(),
};

const mockRecordListeningHistory = jest.fn();

const mockDb = {
  query: jest.fn(),
  getConnection: jest.fn(),
};

const loadService = async () => {
  jest.unstable_mockModule("../config/db.js", () => ({
    default: mockDb,
  }));
  jest.unstable_mockModule("../services/history.service.js", () => ({
    recordListeningHistory: mockRecordListeningHistory,
  }));

  return import("../services/song.service.js");
};

describe("song.service artist draft handling", () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();

    mockDb.getConnection.mockResolvedValue(mockConnection);
    mockConnection.beginTransaction.mockResolvedValue(undefined);
    mockConnection.query.mockResolvedValue([{}]);
    mockConnection.commit.mockResolvedValue(undefined);
    mockConnection.rollback.mockResolvedValue(undefined);
    mockConnection.release.mockReturnValue(undefined);
    mockRecordListeningHistory.mockReset();
  });

  it("returns pending song details after createSong", async () => {
    mockDb.query
      .mockResolvedValueOnce([{ insertId: 501 }])
      .mockResolvedValueOnce([{}])
      .mockResolvedValueOnce([{}])
      .mockResolvedValueOnce([
        [
          {
            id: 501,
            title: "Pending Song",
            artist_id: 77,
            album_id: 123,
            genres: null,
          },
        ],
      ])
      .mockResolvedValueOnce([
        [
          {
            song_id: 501,
            artist_id: 77,
            artist_role: "main",
            sort_order: 0,
            artist_name: "Artist A",
          },
        ],
      ]);

    const { createSong } = await loadService();
    const result = await createSong({
      title: "Pending Song",
      artist_id: 77,
      album_id: 123,
      status: "pending",
    });

    const [selectSql] = mockDb.query.mock.calls[3];

    expect(selectSql).not.toContain("s.status = 'approved'");
    expect(result).toMatchObject({
      id: 501,
      title: "Pending Song",
      artist_id: 77,
      album_id: 123,
      artists: [
        {
          id: 77,
          name: "Artist A",
          role: "main",
          sort_order: 0,
        },
      ],
    });
  });

  it("normalizes an empty album_id to null when updating a song", async () => {
    mockDb.query
      .mockResolvedValueOnce([
        [
          {
            id: 501,
            artist_id: 77,
            album_id: 123,
          },
        ],
      ])
      .mockResolvedValueOnce([{}])
      .mockResolvedValueOnce([
        [
          {
            id: 501,
            title: "Standalone Song",
            artist_id: 77,
            album_id: null,
            genres: null,
          },
        ],
      ])
      .mockResolvedValueOnce([[]]);

    const { updateSong } = await loadService();
    const result = await updateSong(501, {
      album_id: "",
    });

    const [, updateParams] = mockDb.query.mock.calls[1];
    const [selectSql] = mockDb.query.mock.calls[2];

    expect(updateParams).toEqual([null, 501]);
    expect(selectSql).not.toContain("s.status = 'approved'");
    expect(result).toMatchObject({
      id: 501,
      album_id: null,
      artists: [],
    });
  });

  it("includes featured songs when listing songs by artist", async () => {
    mockDb.query
      .mockResolvedValueOnce([
        [
          {
            id: 77,
            name: "Artist A",
          },
        ],
      ])
      .mockResolvedValueOnce([
        [
          {
            id: 901,
            title: "Collab Song",
            album_id: 15,
            album_title: "Collab Album",
            artist_id: 99,
            release_date: "2026-02-01 00:00:00",
            created_at: "2026-01-20 00:00:00",
            published_date: "2026-02-01",
          },
        ],
      ]);

    const { listSongsByArtist } = await loadService();
    const result = await listSongsByArtist(77, { includeUnreleased: true });

    const [selectSql, selectParams] = mockDb.query.mock.calls[1];

    expect(selectSql).toContain("FROM song_artists sa_artist");
    expect(selectSql).toContain(
      "ORDER BY COALESCE(s.release_date, DATE(s.created_at)) DESC, s.id DESC"
    );
    expect(selectParams).toEqual([77, 77]);
    expect(result).toMatchObject({
      artist: {
        id: 77,
        name: "Artist A",
      },
      songs: [
        {
          id: 901,
          title: "Collab Song",
          artist_id: 99,
          album_id: 15,
          album_title: "Collab Album",
          published_date: "2026-02-01",
        },
      ],
    });
  });

  it("requires a non-empty audio_path for public song visibility queries", async () => {
    mockDb.query.mockResolvedValueOnce([[]]);

    const { getSongById } = await loadService();
    const result = await getSongById(501);

    const [selectSql] = mockDb.query.mock.calls[0];

    expect(selectSql).toContain("s.audio_path IS NOT NULL");
    expect(selectSql).toContain("s.audio_path <> ''");
    expect(result).toBeNull();
  });
});

describe("song.service play stats aggregation", () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();

    mockDb.getConnection.mockResolvedValue(mockConnection);
    mockConnection.beginTransaction.mockResolvedValue(undefined);
    mockConnection.query.mockResolvedValue([{ affectedRows: 1 }]);
    mockConnection.commit.mockResolvedValue(undefined);
    mockConnection.rollback.mockResolvedValue(undefined);
    mockConnection.release.mockReturnValue(undefined);
    mockRecordListeningHistory.mockReset();
  });

  it("upserts one daily row and one weekly row when a valid play is recorded", async () => {
    mockDb.query
      .mockResolvedValueOnce([[{ id: 10 }]])
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([[{ play_count: 11 }]])
      .mockResolvedValueOnce([[{ likes: 2 }]]);

    const { recordSongPlay } = await loadService();
    const result = await recordSongPlay(10, 5, 45);

    expect(mockConnection.beginTransaction).toHaveBeenCalledTimes(1);
    expect(mockConnection.query).toHaveBeenCalledTimes(3);
    expect(mockConnection.query.mock.calls[0]).toEqual([
      "UPDATE songs SET play_count = play_count + 1 WHERE id = ?",
      [10],
    ]);
    expect(mockConnection.query.mock.calls[1][0]).toContain(
      "INSERT INTO song_play_stats (song_id, period_type, period_start, play_count)"
    );
    expect(mockConnection.query.mock.calls[1][0]).not.toContain("CURDATE()");
    expect(mockConnection.query.mock.calls[1][1]).toEqual([
      10,
      "day",
      expect.any(String),
    ]);
    expect(mockConnection.query.mock.calls[2][0]).toContain(
      "ON DUPLICATE KEY UPDATE play_count = play_count + 1"
    );
    expect(mockConnection.query.mock.calls[2][1]).toEqual([
      10,
      "week",
      expect.any(String),
    ]);
    expect(mockConnection.commit).toHaveBeenCalledTimes(1);
    expect(mockConnection.rollback).not.toHaveBeenCalled();
    expect(mockRecordListeningHistory).toHaveBeenCalledWith(5, 10, 45);
    expect(result).toEqual({ playCount: 11, likeCount: 2 });
  });

  it("rolls back song and stat updates when one of the upserts fails", async () => {
    mockDb.query
      .mockResolvedValueOnce([[{ id: 10 }]])
      .mockResolvedValueOnce([[]]);
    mockConnection.query
      .mockResolvedValueOnce([{ affectedRows: 1 }])
      .mockRejectedValueOnce(new Error("stat write failed"));

    const { recordSongPlay } = await loadService();

    await expect(recordSongPlay(10, 5, 45)).rejects.toThrow("stat write failed");
    expect(mockConnection.beginTransaction).toHaveBeenCalledTimes(1);
    expect(mockConnection.commit).not.toHaveBeenCalled();
    expect(mockConnection.rollback).toHaveBeenCalledTimes(1);
    expect(mockRecordListeningHistory).not.toHaveBeenCalled();
  });

  it("does not write stats when the listen duration is below the counting threshold", async () => {
    mockDb.query
      .mockResolvedValueOnce([[{ id: 10 }]])
      .mockResolvedValueOnce([[{ play_count: 3 }]])
      .mockResolvedValueOnce([[{ likes: 1 }]]);

    const { recordSongPlay } = await loadService();
    const result = await recordSongPlay(10, 5, 20);

    expect(mockDb.getConnection).not.toHaveBeenCalled();
    expect(mockConnection.query).not.toHaveBeenCalled();
    expect(mockRecordListeningHistory).not.toHaveBeenCalled();
    expect(result).toEqual({ playCount: 3, likeCount: 1 });
  });
});

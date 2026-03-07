import { jest } from "@jest/globals";

const mockConnection = {
  beginTransaction: jest.fn(),
  query: jest.fn(),
  commit: jest.fn(),
  rollback: jest.fn(),
  release: jest.fn(),
};

const mockDb = {
  query: jest.fn(),
  getConnection: jest.fn(),
};

const loadService = async () => {
  jest.unstable_mockModule("../config/db.js", () => ({
    default: mockDb,
  }));
  jest.unstable_mockModule("../services/history.service.js", () => ({
    recordListeningHistory: jest.fn(),
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
});

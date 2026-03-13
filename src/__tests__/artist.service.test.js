import { jest } from "@jest/globals";

const mockDb = {
  query: jest.fn(),
};

const loadService = async () => {
  jest.unstable_mockModule("../config/db.js", () => ({
    default: mockDb,
  }));

  return import("../services/artist.service.js");
};

describe("artist.service song participation", () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  it("returns songs where the artist appears in song_artists and sorts by release date", async () => {
    mockDb.query
      .mockResolvedValueOnce([
        [
          {
            id: 77,
            name: "Artist A",
            is_deleted: 0,
          },
        ],
      ])
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([
        [
          {
            id: 901,
            title: "Collab Song",
            artist_id: 99,
            album_id: 15,
            album_title: "Collab Album",
            genres: "pop,rnb",
            release_date: "2026-02-01 00:00:00",
            created_at: "2026-01-20 00:00:00",
            published_date: "2026-02-01",
          },
        ],
      ]);

    const { getArtistById } = await loadService();
    const result = await getArtistById(77, { includeUnreleased: true });

    const [songSql, songParams] = mockDb.query.mock.calls[2];

    expect(songSql).toContain("FROM song_artists sa_artist");
    expect(songSql).toContain(
      "ORDER BY COALESCE(s.release_date, DATE(s.created_at)) DESC, s.id DESC"
    );
    expect(songParams).toEqual([77, 77]);
    expect(result).toMatchObject({
      id: 77,
      songs: [
        {
          id: 901,
          title: "Collab Song",
          artist_id: 99,
          album: {
            id: 15,
            title: "Collab Album",
          },
          genres: ["pop", "rnb"],
          published_date: "2026-02-01",
        },
      ],
    });
  });
});

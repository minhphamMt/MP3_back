import { jest } from "@jest/globals";

const mockDb = {
  query: jest.fn(),
};

const loadService = async () => {
  jest.unstable_mockModule("../config/db.js", () => ({
    default: mockDb,
  }));

  const module = await import("../services/search.service.js");
  return module.searchEntities;
};

describe("searchEntities", () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  it("returns an empty result set when no records match", async () => {
    mockDb.query.mockResolvedValueOnce([[{ total: 0 }]]);

    const searchEntities = await loadService();

    const result = await searchEntities(" no-results ", {
      page: 2,
      limit: 5,
      offset: 5,
    });

    expect(result).toEqual({
      items: [],
      meta: {
        page: 2,
        limit: 5,
        total: 0,
        totalPages: 1,
      },
    });

    expect(mockDb.query).toHaveBeenCalledTimes(1);
    const [, params] = mockDb.query.mock.calls[0];
    expect(params).toEqual([
      "%no-results%",
      "%no-results%",
      "%no-results%",
      "%no-results%",
      "%no-results%",
      "%no-results%",
    ]);
  });

  it("returns highlighted rows using the new Zing identifier columns", async () => {
    mockDb.query.mockResolvedValueOnce([[{ total: 3 }]]);
    mockDb.query.mockResolvedValueOnce([
      [
        {
          id: 1,
          type: "song",
          display_name: "Zing Song Title",
          zing_song_id: "zingSong001",
          zing_artist_id: null,
          zing_album_id: null,
          artist_name: "Artist Alpha",
          album_title: "Album One",
          relevance: 3,
        },
        {
          id: 2,
          type: "artist",
          display_name: "Artist Beta",
          zing_song_id: null,
          zing_artist_id: "zingArtist002",
          zing_album_id: null,
          artist_name: null,
          album_title: null,
          relevance: 1,
        },
        {
          id: 3,
          type: "album",
          display_name: "Greatest Hits",
          zing_song_id: null,
          zing_artist_id: null,
          zing_album_id: "zingAlbum003",
          artist_name: null,
          album_title: null,
          relevance: 1,
        },
      ],
    ]);

    const searchEntities = await loadService();

    const result = await searchEntities(" zing ", {
      page: 1,
      limit: 10,
      offset: 0,
    });

    expect(mockDb.query).toHaveBeenCalledTimes(2);

    const [countSql, countParams] = mockDb.query.mock.calls[0];
    expect(countSql).toContain("SELECT COUNT(*) AS total FROM");
    expect(countParams).toEqual([
      "%zing%",
      "%zing%",
      "%zing%",
      "%zing%",
      "%zing%",
      "%zing%",
    ]);

    const [searchSql, searchParams] = mockDb.query.mock.calls[1];
    expect(searchSql).toContain("zing_song_id");
    expect(searchSql).toContain("zing_artist_id");
    expect(searchSql).toContain("zing_album_id");
    expect(searchParams).toEqual([
      "zing",
      "%zing%",
      "%zing%",
      "%zing%",
      "zing",
      "%zing%",
      "%zing%",
      "%zing%",
      "zing",
      "%zing%",
      "%zing%",
      "%zing%",
      10,
      0,
    ]);

    expect(result.items).toHaveLength(3);
    expect(result.items[0]).toMatchObject({
      id: 1,
      type: "song",
      zing_song_id: "zingSong001",
    });
    expect(result.items[0].highlight).toMatchObject({
      display_name: "<em>Zing</em> Song Title",
      zing_song_id: "<em>zing</em>Song001",
      zing_artist_id: null,
      zing_album_id: null,
      artist_name: "<em>Zing</em> Artist Alpha",
      album_title: "Album One",
    });

    expect(result.meta).toEqual({
      page: 1,
      limit: 10,
      total: 3,
      totalPages: 1,
    });
  });
});

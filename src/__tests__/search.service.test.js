import { jest } from "@jest/globals";

const mockDb = {
  query: jest.fn(),
};

const loadService = async () => {
  jest.unstable_mockModule("../config/db.js", () => ({
    default: mockDb,
  }));

  return import("../services/search.service.js");
};

describe("search.service", () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  it("returns grouped empty search results with stable pagination metadata", async () => {
    mockDb.query
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([[]]);

    const { searchEntities } = await loadService();

    const result = await searchEntities(" no-results ", {
      page: 2,
      limit: 5,
      offset: 5,
    });

    expect(result).toEqual({
      items: {
        songs: [],
        artists: [],
        albums: [],
      },
      meta: {
        page: 2,
        limit: 5,
        total: 0,
        totalPages: 1,
      },
    });

    expect(mockDb.query).toHaveBeenCalledTimes(3);
  });

  it("returns grouped search results and counts the returned entities in meta.total", async () => {
    mockDb.query
      .mockResolvedValueOnce([
        [
          {
            id: 11,
            title: "Zing Song",
            artist_id: 21,
            album_id: 31,
            artist_name: "Artist Alpha",
            album_title: "Album One",
            score: 99,
          },
        ],
      ])
      .mockResolvedValueOnce([
        [
          {
            id: 21,
            name: "Artist Alpha",
            alias: "zing alpha",
            song_count: 10,
            score: 50,
          },
        ],
      ])
      .mockResolvedValueOnce([
        [
          {
            id: 31,
            title: "Album One",
            artist_name: "Artist Alpha",
            score: 25,
          },
        ],
      ])
      .mockResolvedValueOnce([
        [
          {
            song_id: 11,
            artist_id: 21,
            artist_role: "primary",
            sort_order: 1,
            artist_name: "Artist Alpha",
          },
        ],
      ]);

    const { searchEntities } = await loadService();

    const result = await searchEntities(" zing ", {
      page: 1,
      limit: 10,
      offset: 0,
    });

    expect(result.meta).toEqual({
      page: 1,
      limit: 10,
      total: 3,
      totalPages: 1,
    });
    expect(result.items.songs).toEqual([
      expect.objectContaining({
        id: 11,
        title: "Zing Song",
        artists: [
          {
            id: 21,
            name: "Artist Alpha",
            role: "primary",
            sort_order: 1,
          },
        ],
      }),
    ]);
    expect(result.items.artists).toEqual([
      expect.objectContaining({
        id: 21,
        name: "Artist Alpha",
      }),
    ]);
    expect(result.items.albums).toEqual([
      expect.objectContaining({
        id: 31,
        title: "Album One",
      }),
    ]);

    const [artistSearchSql] = mockDb.query.mock.calls[1];
    expect(artistSearchSql).toContain(
      "LEFT JOIN albums al_song_visibility ON al_song_visibility.id = s.album_id"
    );
    expect(artistSearchSql).toContain("COUNT(DISTINCT CASE");
    expect(mockDb.query).toHaveBeenCalledTimes(4);
  });

  it("returns distinct search history with accurate total count", async () => {
    mockDb.query
      .mockResolvedValueOnce([[{ total: 7 }]])
      .mockResolvedValueOnce([
        [
          {
            id: 1,
            keyword: "zing mp3",
            searched_at: "2026-03-08T10:00:00.000Z",
          },
          {
            id: 2,
            keyword: "son tung",
            searched_at: "2026-03-08T09:00:00.000Z",
          },
        ],
      ]);

    const { listSearchHistory } = await loadService();

    const result = await listSearchHistory(5, {
      page: 2,
      limit: 2,
      offset: 2,
    });

    expect(result).toEqual({
      items: [
        {
          id: 1,
          keyword: "zing mp3",
          searched_at: "2026-03-08T10:00:00.000Z",
        },
        {
          id: 2,
          keyword: "son tung",
          searched_at: "2026-03-08T09:00:00.000Z",
        },
      ],
      meta: {
        page: 2,
        limit: 2,
        total: 7,
        totalPages: 4,
      },
    });
    expect(mockDb.query).toHaveBeenCalledTimes(2);
  });
});

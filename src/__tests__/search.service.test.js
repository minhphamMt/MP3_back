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

    expect(mockDb.query).toHaveBeenCalledTimes(4);
  });

  it("returns close typo matches without spamming unrelated results", async () => {
    mockDb.query
      .mockResolvedValueOnce([
        [
          {
            id: 11,
            title: "Tetvovo",
            artist_id: 21,
            album_id: null,
            duration: 200,
            audio_path: "/music/tetvovo.mp3",
            cover_url: "/covers/tetvovo.jpg",
            status: "approved",
            play_count: 500,
            release_date: "2025-01-01",
            created_at: "2025-01-01T00:00:00.000Z",
            artist_name: "Wxrdie",
            artist_alias: "wrx",
            artist_realname: "Nguyen Vu",
            artist_names: "Wxrdie",
            artist_aliases: "wrx",
            artist_realnames: "Nguyen Vu",
            album_title: "",
            like_count: 50,
            genre_names: "rap hip hop",
          },
        ],
      ])
      .mockResolvedValueOnce([
        [
          {
            id: 21,
            user_id: 2,
            name: "Wxrdie",
            alias: "wrx",
            bio: "Rapper",
            short_bio: "Rapper",
            avatar_url: "/artists/wxrdie.jpg",
            cover_url: "/artists/wxrdie-cover.jpg",
            birthday: "2000-01-01",
            realname: "Nguyen Vu",
            national: "VN",
            follow_count: 1200,
            zing_artist_id: "zing-21",
            is_deleted: 0,
            deleted_at: null,
            deleted_by: null,
            deleted_by_role: null,
            created_at: "2025-01-01T00:00:00.000Z",
            updated_at: null,
            song_count: 10,
            song_titles: "Tetvovo || Lau Dai Tinh Ai",
            album_titles: "Wxrdie Collection",
            genre_names: "rap hip hop",
          },
          {
            id: 99,
            user_id: 5,
            name: "Random Artist",
            alias: "random",
            bio: "Other",
            short_bio: "Other",
            avatar_url: "/artists/random.jpg",
            cover_url: "/artists/random-cover.jpg",
            birthday: "1990-01-01",
            realname: "Other Artist",
            national: "VN",
            follow_count: 50,
            zing_artist_id: "zing-99",
            is_deleted: 0,
            deleted_at: null,
            deleted_by: null,
            deleted_by_role: null,
            created_at: "2025-01-01T00:00:00.000Z",
            updated_at: null,
            song_count: 2,
            song_titles: "Khong lien quan",
            album_titles: "No Match",
            genre_names: "pop",
          },
        ],
      ])
      .mockResolvedValueOnce([
        [
          {
            id: 31,
            zing_album_id: "zing-31",
            title: "Wxrdie Collection",
            artist_id: 21,
            cover_url: "/albums/wxrdie.jpg",
            release_date: "2025-01-01",
            created_at: "2025-01-01T00:00:00.000Z",
            is_deleted: 0,
            deleted_at: null,
            deleted_by: null,
            deleted_by_role: null,
            artist_name: "Wxrdie",
            like_count: 70,
            song_count: 8,
            song_titles: "Tetvovo || Lau Dai Tinh Ai",
            genre_names: "rap hip hop",
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
            artist_name: "Wxrdie",
          },
        ],
      ]);

    const { searchEntities } = await loadService();

    const result = await searchEntities(" wrxdie ", {
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
    expect(result.items.artists).toEqual([
      expect.objectContaining({
        id: 21,
        name: "Wxrdie",
      }),
    ]);
    expect(result.items.artists).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 99,
        }),
      ])
    );
    expect(result.items.songs).toEqual([
      expect.objectContaining({
        id: 11,
        title: "Tetvovo",
        artists: [
          {
            id: 21,
            name: "Wxrdie",
            role: "primary",
            sort_order: 1,
          },
        ],
      }),
    ]);
    expect(result.items.albums).toEqual([
      expect.objectContaining({
        id: 31,
        title: "Wxrdie Collection",
      }),
    ]);
  });

  it("matches artist realname and surfaces related songs and albums tightly", async () => {
    mockDb.query
      .mockResolvedValueOnce([
        [
          {
            id: 41,
            title: "Khong The Say",
            artist_id: 51,
            album_id: 61,
            duration: 215,
            audio_path: "/music/khong-the-say.mp3",
            cover_url: "/covers/hieuthuhai.jpg",
            status: "approved",
            play_count: 900,
            release_date: "2025-01-01",
            created_at: "2025-01-01T00:00:00.000Z",
            artist_name: "HIEUTHUHAI",
            artist_alias: "hth",
            artist_realname: "Hieu Thu Hai",
            artist_names: "HIEUTHUHAI",
            artist_aliases: "hth",
            artist_realnames: "Hieu Thu Hai",
            album_title: "Ai Cung Phai Bat Dau Tu Dau Do",
            like_count: 120,
            genre_names: "rap hip hop",
          },
        ],
      ])
      .mockResolvedValueOnce([
        [
          {
            id: 51,
            user_id: 7,
            name: "HIEUTHUHAI",
            alias: "hth",
            bio: "Rapper",
            short_bio: "Rapper",
            avatar_url: "/artists/hieuthuhai.jpg",
            cover_url: "/artists/hieuthuhai-cover.jpg",
            birthday: "1999-01-01",
            realname: "Hieu Thu Hai",
            national: "VN",
            follow_count: 3400,
            zing_artist_id: "zing-51",
            is_deleted: 0,
            deleted_at: null,
            deleted_by: null,
            deleted_by_role: null,
            created_at: "2025-01-01T00:00:00.000Z",
            updated_at: null,
            song_count: 12,
            song_titles: "Khong The Say || Exit Sign",
            album_titles: "Ai Cung Phai Bat Dau Tu Dau Do",
            genre_names: "rap hip hop",
          },
        ],
      ])
      .mockResolvedValueOnce([
        [
          {
            id: 61,
            zing_album_id: "zing-61",
            title: "Ai Cung Phai Bat Dau Tu Dau Do",
            artist_id: 51,
            cover_url: "/albums/hieuthuhai.jpg",
            release_date: "2025-01-01",
            created_at: "2025-01-01T00:00:00.000Z",
            is_deleted: 0,
            deleted_at: null,
            deleted_by: null,
            deleted_by_role: null,
            artist_name: "HIEUTHUHAI",
            artist_alias: "hth",
            artist_realname: "Hieu Thu Hai",
            like_count: 220,
            song_count: 10,
            song_titles: "Khong The Say || Exit Sign",
            genre_names: "rap hip hop",
          },
        ],
      ])
      .mockResolvedValueOnce([
        [
          {
            song_id: 41,
            artist_id: 51,
            artist_role: "primary",
            sort_order: 1,
            artist_name: "HIEUTHUHAI",
          },
        ],
      ]);

    const { searchEntities } = await loadService();

    const result = await searchEntities(" hiếu thứ hai ", {
      page: 1,
      limit: 10,
      offset: 0,
    });

    expect(result.items.artists[0]).toEqual(
      expect.objectContaining({
        id: 51,
        name: "HIEUTHUHAI",
      })
    );
    expect(result.items.songs[0]).toEqual(
      expect.objectContaining({
        id: 41,
        artist_name: "HIEUTHUHAI",
      })
    );
    expect(result.items.albums[0]).toEqual(
      expect.objectContaining({
        id: 61,
        artist_name: "HIEUTHUHAI",
      })
    );
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

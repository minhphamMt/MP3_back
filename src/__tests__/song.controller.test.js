import { jest } from "@jest/globals";

const mockSongService = {
  createSong: jest.fn(),
  deleteSong: jest.fn(),
  softDeleteSong: jest.fn(),
  restoreSong: jest.fn(),
  getSongById: jest.fn(),
  recordSongPlay: jest.fn(),
  likeSong: jest.fn(),
  listSongs: jest.fn(),
  unlikeSong: jest.fn(),
  updateSong: jest.fn(),
  updateSongMedia: jest.fn(),
  listSongsByArtist: jest.fn(),
  getLikedSongs: jest.fn(),
};

const mockArtistService = {
  getArtistByUserId: jest.fn(),
  getArtistByUserIdWithDeleted: jest.fn(),
};

const mockAlbumService = {
  getAlbumById: jest.fn(),
};

const mockStorageService = {
  uploadMediaFile: jest.fn(),
};

const mockPagination = {
  getPaginationParams: jest.fn(() => ({ page: 1, limit: 10, offset: 0 })),
};

const loadController = async () => {
  jest.unstable_mockModule("../services/song.service.js", () => mockSongService);
  jest.unstable_mockModule("../services/artist.service.js", () => mockArtistService);
  jest.unstable_mockModule("../services/album.service.js", () => mockAlbumService);
  jest.unstable_mockModule("../services/storage.service.js", () => mockStorageService);
  jest.unstable_mockModule("../utils/pagination.js", () => mockPagination);

  return import("../controllers/song.controller.js");
};

const createResponse = () => {
  const res = {
    status: jest.fn(),
    json: jest.fn(),
  };

  res.status.mockReturnValue(res);
  res.json.mockReturnValue(res);

  return res;
};

describe("song.controller artist album handling", () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  it("allows artists to create a song inside an unreleased album they own", async () => {
    mockArtistService.getArtistByUserId.mockResolvedValue({ id: 77 });
    mockAlbumService.getAlbumById.mockResolvedValue({
      id: 123,
      artist_id: 77,
      release_date: "2026-04-01 00:00:00",
    });
    mockSongService.createSong.mockResolvedValue({
      id: 501,
      title: "Future Album Track",
      status: "pending",
    });

    const { createSongHandler } = await loadController();
    const req = {
      body: {
        title: "Future Album Track",
        album_id: "123",
      },
      user: {
        id: 9,
        role: "artist",
      },
    };
    const res = createResponse();
    const next = jest.fn();

    await createSongHandler(req, res, next);

    expect(mockAlbumService.getAlbumById).toHaveBeenCalledWith(123, {
      includeSongs: false,
      includeUnreleased: true,
    });
    expect(mockSongService.createSong).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Future Album Track",
        album_id: 123,
        artist_id: 77,
        artist_ids: [77],
        status: "pending",
      })
    );
    expect(res.status).toHaveBeenCalledWith(201);
    expect(next).not.toHaveBeenCalled();
  });

  it("allows artists to remove album assignment when updating a song", async () => {
    mockArtistService.getArtistByUserId.mockResolvedValue({ id: 77 });
    mockSongService.getSongById.mockResolvedValue({
      id: 501,
      artist_id: 77,
    });
    mockSongService.updateSong.mockResolvedValue({
      id: 501,
      album_id: null,
    });

    const { updateSongHandler } = await loadController();
    const req = {
      params: { id: "501" },
      body: {
        title: "Standalone Song",
        album_id: "",
      },
      user: {
        id: 9,
        role: "artist",
      },
    };
    const res = createResponse();
    const next = jest.fn();

    await updateSongHandler(req, res, next);

    expect(mockAlbumService.getAlbumById).not.toHaveBeenCalled();
    expect(mockSongService.updateSong).toHaveBeenCalledWith(
      "501",
      expect.objectContaining({
        title: "Standalone Song",
        album_id: null,
      })
    );
    expect(res.status).toHaveBeenCalledWith(200);
    expect(next).not.toHaveBeenCalled();
  });
});

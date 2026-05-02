import { jest } from "@jest/globals";

const mockDb = {
  query: jest.fn(),
};

const mockCreateArtist = jest.fn();
const mockGetArtistByUserIdWithDeleted = jest.fn();
const mockRestoreArtist = jest.fn();
const mockSetUserRole = jest.fn();

const loadArtistRequestService = async () => {
  jest.unstable_mockModule("../config/db.js", () => ({
    default: mockDb,
  }));

  jest.unstable_mockModule("../services/artist.service.js", () => ({
    createArtist: mockCreateArtist,
    getArtistByUserIdWithDeleted: mockGetArtistByUserIdWithDeleted,
    restoreArtist: mockRestoreArtist,
  }));

  jest.unstable_mockModule("../services/user.service.js", () => ({
    setUserRole: mockSetUserRole,
  }));

  return import("../services/artist-request.service.js");
};

describe("artist-request.service admin review", () => {
  beforeEach(() => {
    jest.resetModules();
    mockDb.query.mockReset();
    mockCreateArtist.mockReset();
    mockGetArtistByUserIdWithDeleted.mockReset();
    mockRestoreArtist.mockReset();
    mockSetUserRole.mockReset();
  });

  it("demotes artist access when an approved request is changed to rejected", async () => {
    mockDb.query
      .mockResolvedValueOnce([
        [
          {
            id: 9,
            user_id: 22,
            artist_name: "Former Artist",
            status: "approved",
          },
        ],
      ])
      .mockResolvedValueOnce([{ affectedRows: 1 }])
      .mockResolvedValueOnce([
        [
          {
            id: 9,
            user_id: 22,
            artist_name: "Former Artist",
            status: "rejected",
            reject_reason: "Thong tin khong hop le",
          },
        ],
      ]);

    const { reviewArtistRequest } = await loadArtistRequestService();

    await reviewArtistRequest(9, {
      status: "rejected",
      reviewerId: 1,
      rejectReason: "Thong tin khong hop le",
    });

    expect(mockSetUserRole).toHaveBeenCalledWith(22, "USER", {
      reviewerId: 1,
      rejectReason: "Thong tin khong hop le",
      syncArtistRequest: false,
    });
    expect(mockDb.query).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining("UPDATE artist_requests"),
      ["rejected", 1, "Thong tin khong hop le", 9]
    );
  });

  it("allows admin to edit request fields before approving", async () => {
    mockDb.query
      .mockResolvedValueOnce([
        [
          {
            id: 9,
            user_id: 22,
            artist_name: "Old Name",
            status: "pending",
          },
        ],
      ])
      .mockResolvedValueOnce([{ affectedRows: 1 }])
      .mockResolvedValueOnce([
        [
          {
            id: 9,
            user_id: 22,
            artist_name: "New Name",
            bio: "New bio",
            avatar_url: null,
            status: "pending",
          },
        ],
      ])
      .mockResolvedValueOnce([{ affectedRows: 1 }])
      .mockResolvedValueOnce([
        [
          {
            id: 9,
            user_id: 22,
            artist_name: "New Name",
            status: "approved",
          },
        ],
      ]);

    mockGetArtistByUserIdWithDeleted.mockResolvedValue(null);
    mockCreateArtist.mockResolvedValue({ id: 3 });

    const { updateArtistRequestByAdmin } = await loadArtistRequestService();

    await updateArtistRequestByAdmin(9, {
      artistName: "New Name",
      bio: "New bio",
      status: "approved",
      reviewerId: 1,
    });

    expect(mockDb.query).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining("SET artist_name = ?, bio = ?"),
      ["New Name", "New bio", 9]
    );
    expect(mockCreateArtist).toHaveBeenCalledWith({
      name: "New Name",
      bio: "New bio",
      avatar_url: null,
      user_id: 22,
    });
    expect(mockSetUserRole).toHaveBeenCalledWith(22, "ARTIST", {
      reviewerId: 1,
      syncArtistRequest: false,
    });
  });
});

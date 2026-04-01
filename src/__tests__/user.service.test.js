import { jest } from "@jest/globals";

const mockDb = {
  query: jest.fn(),
};

const mockCreateArtist = jest.fn();
const mockGetArtistByUserIdWithDeleted = jest.fn();

const loadUserService = async () => {
  jest.unstable_mockModule("../config/db.js", () => ({
    default: mockDb,
  }));

  jest.unstable_mockModule("bcrypt", () => ({
    default: {
      hash: jest.fn().mockResolvedValue("hashed-password"),
    },
  }));

  jest.unstable_mockModule("../services/artist.service.js", () => ({
    createArtist: mockCreateArtist,
    getArtistByUserIdWithDeleted: mockGetArtistByUserIdWithDeleted,
  }));

  return import("../services/user.service.js");
};

describe("user.service artist profile bootstrap", () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  it("createUser auto-creates artist profile when role is artist", async () => {
    mockDb.query
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([{ insertId: 10 }])
      .mockResolvedValueOnce([[{ id: 10, display_name: "Artist A", role: "ARTIST" }]]);

    mockGetArtistByUserIdWithDeleted.mockResolvedValue(null);
    mockCreateArtist.mockResolvedValue({ id: 5 });

    const { createUser } = await loadUserService();

    await createUser({
      display_name: "Artist A",
      email: "a@example.com",
      password: "123456",
      role: "ARTIST",
    });

    expect(mockDb.query).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining("artist_register_intent"),
      ["Artist A", "a@example.com", "hashed-password", "ARTIST", 1, null, 1]
    );
    expect(mockGetArtistByUserIdWithDeleted).toHaveBeenCalledWith(10);
    expect(mockCreateArtist).toHaveBeenCalledWith({
      user_id: 10,
      name: "Artist A",
    });
  });

  it("setUserRole restores soft-deleted artist profile when promoting to artist", async () => {
    mockDb.query
      .mockResolvedValueOnce([[{ id: 22 }]])
      .mockResolvedValueOnce([{ affectedRows: 1 }])
      .mockResolvedValueOnce([[{ id: 22, display_name: "Restored", role: "ARTIST" }]])
      .mockResolvedValueOnce([{ affectedRows: 1 }])
      .mockResolvedValueOnce([[{ id: 22, display_name: "Restored", role: "ARTIST" }]]);

    mockGetArtistByUserIdWithDeleted.mockResolvedValue({ id: 7, is_deleted: 1 });

    const { setUserRole } = await loadUserService();

    await setUserRole(22, "ARTIST");

    expect(mockGetArtistByUserIdWithDeleted).toHaveBeenCalledWith(22);
    expect(mockDb.query).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining("artist_register_intent"),
      ["ARTIST", "ARTIST", "ARTIST", 22]
    );
    expect(mockDb.query).toHaveBeenCalledWith(
      "UPDATE artists SET is_deleted = 0 WHERE id = ?",
      [7]
    );
    expect(mockCreateArtist).not.toHaveBeenCalled();
  });
});

import { jest } from "@jest/globals";
import { PASSWORD_ALLOWED_MESSAGE } from "../utils/password.util.js";

const mockDb = {
  query: jest.fn(),
};

const mockCreateArtist = jest.fn();
const mockGetArtistByUserIdWithDeleted = jest.fn();
const mockBcryptHash = jest.fn().mockResolvedValue("hashed-password");
const mockBcryptCompare = jest.fn();

const loadUserService = async () => {
  jest.unstable_mockModule("../config/db.js", () => ({
    default: mockDb,
  }));

  jest.unstable_mockModule("bcrypt", () => ({
    default: {
      hash: mockBcryptHash,
      compare: mockBcryptCompare,
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
    mockDb.query.mockReset();
    mockCreateArtist.mockReset();
    mockGetArtistByUserIdWithDeleted.mockReset();
    mockBcryptHash.mockReset();
    mockBcryptHash.mockResolvedValue("hashed-password");
    mockBcryptCompare.mockReset();
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

  it("createUser rejects password containing emoji or icon characters", async () => {
    const { createUser } = await loadUserService();

    await expect(
      createUser({
        display_name: "Artist A",
        email: "a@example.com",
        password: "123456😀",
        role: "ARTIST",
      })
    ).rejects.toMatchObject({
      status: 400,
      message: PASSWORD_ALLOWED_MESSAGE,
    });

    expect(mockDb.query).not.toHaveBeenCalled();
    expect(mockCreateArtist).not.toHaveBeenCalled();
  });

  it("setUserRole restores soft-deleted artist profile when promoting to artist", async () => {
    mockDb.query
      .mockResolvedValueOnce([[{ id: 22 }]])
      .mockResolvedValueOnce([{ affectedRows: 1 }])
      .mockResolvedValueOnce([[{ id: 22, display_name: "Restored", role: "ARTIST" }]])
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([{ affectedRows: 1 }])
      .mockResolvedValueOnce([[{ id: 22, display_name: "Restored", role: "ARTIST" }]]);

    mockGetArtistByUserIdWithDeleted.mockResolvedValue({ id: 7, is_deleted: 1 });

    const { setUserRole } = await loadUserService();

    await setUserRole(22, "ARTIST");

    expect(mockGetArtistByUserIdWithDeleted).toHaveBeenCalledWith(22);
    expect(mockDb.query).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining("artist_register_intent"),
      ["ARTIST", "ARTIST", "ARTIST", "ARTIST", "USER", 22]
    );
    expect(mockDb.query).toHaveBeenNthCalledWith(
      5,
      expect.stringContaining("UPDATE artists"),
      ["Restored", null, null, 7]
    );
    expect(mockCreateArtist).not.toHaveBeenCalled();
  });

  it("setUserRole approves existing artist request when promoting to artist", async () => {
    mockDb.query
      .mockResolvedValueOnce([[{ id: 22 }]])
      .mockResolvedValueOnce([{ affectedRows: 1 }])
      .mockResolvedValueOnce([[{ id: 22, display_name: "User Name", role: "ARTIST" }]])
      .mockResolvedValueOnce([
        [
          {
            id: 9,
            artist_name: "Request Artist",
            bio: "Request bio",
            avatar_url: "https://cdn.example/avatar.jpg",
            status: "rejected",
          },
        ],
      ])
      .mockResolvedValueOnce([{ affectedRows: 1 }])
      .mockResolvedValueOnce([[{ id: 22, display_name: "User Name", role: "ARTIST" }]]);

    mockGetArtistByUserIdWithDeleted.mockResolvedValue(null);
    mockCreateArtist.mockResolvedValue({ id: 7 });

    const { setUserRole } = await loadUserService();

    await setUserRole(22, "ARTIST", {
      reviewerId: 1,
    });

    expect(mockCreateArtist).toHaveBeenCalledWith({
      user_id: 22,
      name: "Request Artist",
      bio: "Request bio",
      avatar_url: "https://cdn.example/avatar.jpg",
    });
    expect(mockDb.query).toHaveBeenNthCalledWith(
      5,
      expect.stringContaining("UPDATE artist_requests"),
      [1, 22]
    );
  });

  it("setUserRole rejects artist request and soft-deletes artist profile when demoting to user", async () => {
    mockDb.query
      .mockResolvedValueOnce([[{ id: 22 }]])
      .mockResolvedValueOnce([{ affectedRows: 1 }])
      .mockResolvedValueOnce([{ affectedRows: 1 }])
      .mockResolvedValueOnce([{ affectedRows: 1 }])
      .mockResolvedValueOnce([[{ id: 22, display_name: "Former Artist", role: "USER" }]]);

    const { setUserRole } = await loadUserService();

    await setUserRole(22, "USER", {
      reviewerId: 1,
      rejectReason: "Khong con la nghe si",
    });

    expect(mockDb.query).toHaveBeenNthCalledWith(
      3,
      expect.stringContaining("UPDATE artists"),
      [1, "ADMIN", 22]
    );
    expect(mockDb.query).toHaveBeenNthCalledWith(
      4,
      expect.stringContaining("UPDATE artist_requests"),
      ["Khong con la nghe si", 1, 22]
    );
  });

  it("changePassword rejects new password containing emoji or icon characters", async () => {
    mockDb.query.mockResolvedValueOnce([
      [
        {
          id: 44,
          password_hash: "hashed-current-password",
        },
      ],
    ]);
    mockBcryptCompare.mockResolvedValueOnce(true);

    const { changePassword } = await loadUserService();

    await expect(
      changePassword(44, "CurrentPass1!", "NextPass😀1")
    ).rejects.toMatchObject({
      status: 400,
      message: PASSWORD_ALLOWED_MESSAGE,
    });

    expect(mockDb.query).toHaveBeenCalledTimes(1);
    expect(mockBcryptHash).not.toHaveBeenCalled();
  });
});

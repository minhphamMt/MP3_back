import { jest } from "@jest/globals";

const mockQuery = jest.fn();
const mockGetTopWeeklySongs = jest.fn();
const mockGetUserListeningHistory = jest.fn();
const mockListSearchHistory = jest.fn();

jest.unstable_mockModule("../config/db.js", () => ({
  default: {
    query: mockQuery,
  },
}));

jest.unstable_mockModule("../services/chart.service.js", () => ({
  getTopWeeklySongs: mockGetTopWeeklySongs,
}));

jest.unstable_mockModule("../services/history.service.js", () => ({
  getUserListeningHistory: mockGetUserListeningHistory,
}));

jest.unstable_mockModule("../services/search.service.js", () => ({
  listSearchHistory: mockListSearchHistory,
}));

const { getAdminUserDetail } = await import("../services/admin.service.js");

describe("admin.service user detail", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns profile with listening and search history", async () => {
    mockQuery.mockResolvedValueOnce([
      [
        {
          id: 15,
          display_name: "Test User",
          email: "test@example.com",
          role: "USER",
          is_active: 1,
          avatar_url: "https://cdn.example.com/avatar.jpg",
          firebase_uid: "firebase-15",
          auth_provider: "local",
          artist_register_intent: 0,
          created_at: "2026-03-01T00:00:00.000Z",
          updated_at: "2026-03-02T00:00:00.000Z",
        },
      ],
    ]);
    mockGetUserListeningHistory.mockResolvedValue({
      items: [{ id: 1 }],
      meta: { page: 2, limit: 5, total: 11, totalPages: 3 },
    });
    mockListSearchHistory.mockResolvedValue({
      items: [{ id: 7, keyword: "lofi" }],
      meta: { page: 1, limit: 3, total: 4, totalPages: 2 },
    });

    const result = await getAdminUserDetail("15", {
      listening: { page: 2, limit: 5, offset: 5 },
      search: { page: 1, limit: 3, offset: 0 },
    });

    expect(result).toEqual({
      profile: expect.objectContaining({
        id: 15,
        display_name: "Test User",
        email: "test@example.com",
      }),
      listening_history: [{ id: 1 }],
      listening_history_meta: { page: 2, limit: 5, total: 11, totalPages: 3 },
      search_history: [{ id: 7, keyword: "lofi" }],
      search_history_meta: { page: 1, limit: 3, total: 4, totalPages: 2 },
    });
    expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining("FROM users u"), ["15"]);
    expect(mockGetUserListeningHistory).toHaveBeenCalledWith("15", {
      page: 2,
      limit: 5,
      offset: 5,
    });
    expect(mockListSearchHistory).toHaveBeenCalledWith("15", {
      page: 1,
      limit: 3,
      offset: 0,
    });
  });

  it("throws 404 when user does not exist", async () => {
    mockQuery.mockResolvedValueOnce([[]]);

    await expect(getAdminUserDetail("999")).rejects.toMatchObject({
      status: 404,
      message: "User not found",
    });
    expect(mockGetUserListeningHistory).not.toHaveBeenCalled();
    expect(mockListSearchHistory).not.toHaveBeenCalled();
  });
});

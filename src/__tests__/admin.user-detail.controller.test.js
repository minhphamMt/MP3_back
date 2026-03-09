import request from "supertest";
import jwt from "jsonwebtoken";
import { jest } from "@jest/globals";

const mockGetAdminUserDetail = jest.fn();

const loadApp = async () => {
  jest.unstable_mockModule("../services/admin.service.js", () => ({
    getSystemOverview: jest.fn(),
    getWeeklyTopSongs: jest.fn(),
    getAdminCharts: jest.fn(),
    getAdminUserDetail: mockGetAdminUserDetail,
  }));

  jest.unstable_mockModule("../config/db.js", () => ({
    default: {
      query: jest.fn().mockResolvedValue([[{ 1: 1 }]]),
    },
  }));

  const { default: app } = await import("../app.js");
  return app;
};

describe("GET /api/admin/users/:id", () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    process.env.JWT_SECRET = "test-secret";
  });

  it("rejects unauthenticated requests", async () => {
    const app = await loadApp();

    const response = await request(app).get("/api/admin/users/9");

    expect(response.status).toBe(401);
  });

  it("rejects non-admin requests", async () => {
    const app = await loadApp();
    const token = jwt.sign({ id: 1, role: "USER" }, process.env.JWT_SECRET);

    const response = await request(app)
      .get("/api/admin/users/9")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(403);
  });

  it("allows admin and returns user detail payload", async () => {
    mockGetAdminUserDetail.mockResolvedValue({
      profile: { id: 9, display_name: "Listener" },
      listening_history: {
        items: [{ id: 1 }],
        meta: { page: 2, limit: 5, total: 8, totalPages: 2 },
      },
      search_history: {
        items: [{ id: 3, keyword: "ballad" }],
        meta: { page: 1, limit: 3, total: 3, totalPages: 1 },
      },
    });

    const app = await loadApp();
    const token = jwt.sign({ id: 2, role: "ADMIN" }, process.env.JWT_SECRET);

    const response = await request(app)
      .get("/api/admin/users/9?listeningPage=2&listeningLimit=5&search_page=1&search_limit=3")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.profile.id).toBe(9);
    expect(mockGetAdminUserDetail).toHaveBeenCalledWith("9", {
      listening: { page: 2, limit: 5, offset: 5 },
      search: { page: 1, limit: 3, offset: 0 },
    });
  });

  it("returns 404 when admin requests a missing user", async () => {
    mockGetAdminUserDetail.mockRejectedValue(
      Object.assign(new Error("User not found"), { status: 404 })
    );

    const app = await loadApp();
    const token = jwt.sign({ id: 2, role: "ADMIN" }, process.env.JWT_SECRET);

    const response = await request(app)
      .get("/api/admin/users/999")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(404);
    expect(response.body.success).toBe(false);
    expect(response.body.message).toBe("User not found");
  });
});

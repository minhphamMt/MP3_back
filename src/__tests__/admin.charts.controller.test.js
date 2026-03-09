import request from "supertest";
import jwt from "jsonwebtoken";
import { jest } from "@jest/globals";

const mockGetAdminCharts = jest.fn();

const loadApp = async () => {
  jest.unstable_mockModule("../services/admin.service.js", () => ({
    getSystemOverview: jest.fn(),
    getWeeklyTopSongs: jest.fn(),
    getAdminCharts: mockGetAdminCharts,
    getAdminUserDetail: jest.fn(),
  }));

  jest.unstable_mockModule("../config/db.js", () => ({
    default: {
      query: jest.fn().mockResolvedValue([[{ 1: 1 }]]),
    },
  }));

  const { default: app } = await import("../app.js");
  return app;
};

describe("GET /api/admin/reports/charts", () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    process.env.JWT_SECRET = "test-secret";

    mockGetAdminCharts.mockResolvedValue({
      meta: {
        from: "2026-03-01",
        to: "2026-03-03",
        tz: "Asia/Ho_Chi_Minh",
        bucket: "day",
      },
      song_status: [],
    });
  });

  it("rejects unauthenticated requests", async () => {
    const app = await loadApp();

    const response = await request(app).get("/api/admin/reports/charts");

    expect(response.status).toBe(401);
  });

  it("rejects non-admin requests", async () => {
    const app = await loadApp();
    const token = jwt.sign({ id: 1, role: "USER" }, process.env.JWT_SECRET);

    const response = await request(app)
      .get("/api/admin/reports/charts")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(403);
  });

  it("allows admin and returns standardized response", async () => {
    const app = await loadApp();
    const token = jwt.sign({ id: 2, role: "ADMIN" }, process.env.JWT_SECRET);

    const response = await request(app)
      .get("/api/admin/reports/charts?from=2026-03-01&to=2026-03-03")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.meta.from).toBe("2026-03-01");
    expect(mockGetAdminCharts).toHaveBeenCalledWith(
      expect.objectContaining({
        from: "2026-03-01",
        to: "2026-03-03",
      })
    );
  });
});

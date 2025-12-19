import request from "supertest";
import { jest } from "@jest/globals";

const mockDb = {
  query: jest.fn(),
};

jest.unstable_mockModule("../config/db.js", () => ({
  default: mockDb,
}));

const { default: app } = await import("../app.js");

describe("App routing", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockDb.query.mockResolvedValueOnce([[{ 1: 1 }]]);
  });

  it("returns a standardized health check response", async () => {
    const response = await request(app).get("/api/health");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      success: true,
      data: { status: "ok" },
      message: "Health check successful",
    });
    expect(mockDb.query).toHaveBeenCalledWith("SELECT 1");
  });

  it("returns a standardized 404 response for unknown routes", async () => {
    const response = await request(app).get("/api/unknown-route");

    expect(response.status).toBe(404);
    expect(response.body).toEqual({
      success: false,
      data: null,
      message: "Route not found",
    });
  });
});

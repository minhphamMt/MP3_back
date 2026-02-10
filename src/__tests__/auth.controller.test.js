import request from "supertest";
import { jest } from "@jest/globals";

const mockVerifyEmailRegistration = jest.fn();

const loadApp = async () => {
  jest.unstable_mockModule("../services/auth.service.js", () => ({
    registerUser: jest.fn(),
    loginUser: jest.fn(),
    refreshTokens: jest.fn(),
    resendVerificationEmail: jest.fn(),
    verifyEmailRegistration: mockVerifyEmailRegistration,
    firebaseLoginUser: jest.fn(),
  }));

  jest.unstable_mockModule("../config/db.js", () => ({
    default: {
      query: jest.fn().mockResolvedValue([[{ 1: 1 }]]),
    },
  }));

  const { default: app } = await import("../app.js");
  return app;
};

describe("auth verify email from link", () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  it("returns deprecation message for link verification endpoint", async () => {
    const app = await loadApp();

    const response = await request(app).get("/api/auth/verify-email/confirm");

    expect(response.status).toBe(410);
    expect(response.body.message).toContain("đã ngừng hỗ trợ");
    expect(mockVerifyEmailRegistration).not.toHaveBeenCalled();
  });
});

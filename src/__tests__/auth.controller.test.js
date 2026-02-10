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
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    process.env = {
      ...originalEnv,
      FRONTEND_URL: "http://localhost:5173",
    };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it("redirects to frontend login after successful verification", async () => {
    const app = await loadApp();
    mockVerifyEmailRegistration.mockResolvedValue({ message: "ok" });

    const response = await request(app)
      .get("/api/auth/verify-email/confirm")
      .query({ token: "valid-token" });

    expect(response.status).toBe(302);
    expect(response.headers.location).toBe("http://localhost:5173/login");
    expect(mockVerifyEmailRegistration).toHaveBeenCalledWith({
      token: "valid-token",
    });
  });
});

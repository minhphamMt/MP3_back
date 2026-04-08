import request from "supertest";
import { jest } from "@jest/globals";
import { PASSWORD_ALLOWED_MESSAGE } from "../utils/password.util.js";

const mockRegisterUser = jest.fn();
const mockVerifyEmailRegistration = jest.fn();

const loadApp = async () => {
  jest.unstable_mockModule("../services/auth.service.js", () => ({
    registerUser: mockRegisterUser,
    loginUser: jest.fn(),
    logoutUser: jest.fn(),
    refreshTokens: jest.fn(),
    resendVerificationEmail: jest.fn(),
    verifyEmailRegistration: mockVerifyEmailRegistration,
    firebaseLoginUser: jest.fn(),
    requestPasswordReset: jest.fn(),
    resetPassword: jest.fn(),
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
    expect(response.body.message).toContain("link");
    expect(mockVerifyEmailRegistration).not.toHaveBeenCalled();
  });

  it("rejects register password containing emoji before reaching controller service", async () => {
    const app = await loadApp();

    const response = await request(app).post("/api/auth/register").send({
      display_name: "Tester",
      email: "tester@example.com",
      password: "secret123😀",
    });

    expect(response.status).toBe(400);
    expect(response.body.message).toBe("Validation error");
    expect(response.body.errors).toEqual(
      expect.arrayContaining([
        {
          field: "password",
          message: PASSWORD_ALLOWED_MESSAGE,
        },
      ])
    );
    expect(mockRegisterUser).not.toHaveBeenCalled();
  });
});

import { jest } from "@jest/globals";

const mockDb = {
  query: jest.fn(),
  getConnection: jest.fn(),
};

const mockSendVerificationEmail = jest.fn();

const mockConnection = {
  beginTransaction: jest.fn(),
  query: jest.fn(),
  commit: jest.fn(),
  rollback: jest.fn(),
  release: jest.fn(),
};

const loadAuthService = async () => {
  jest.unstable_mockModule("../config/db.js", () => ({
    default: mockDb,
  }));

  jest.unstable_mockModule("../services/email.service.js", () => ({
    sendVerificationEmail: mockSendVerificationEmail,
  }));

  jest.unstable_mockModule("bcrypt", () => ({
    default: {
      hash: jest.fn().mockResolvedValue("hashed-password"),
      compare: jest.fn(),
    },
  }));

  jest.unstable_mockModule("jsonwebtoken", () => ({
    default: {
      sign: jest.fn().mockReturnValue("signed-token"),
      verify: jest.fn(),
    },
  }));

  jest.unstable_mockModule("../config/firebase.js", () => ({
    default: {
      auth: () => ({
        verifyIdToken: jest.fn(),
      }),
    },
  }));

  return import("../services/auth.service.js");
};

describe("auth.service email verification flow", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    process.env = {
      ...originalEnv,
      JWT_SECRET: "test-secret",
      FRONTEND_URL: "http://localhost:5173",
      EMAIL_VERIFY_EXPIRES_MINUTES: "30",
    };
    mockDb.getConnection.mockReturnValue(mockConnection);
    mockConnection.beginTransaction.mockResolvedValue();
    mockConnection.commit.mockResolvedValue();
    mockConnection.rollback.mockResolvedValue();
    mockConnection.release.mockResolvedValue();
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it("registerUser stores pending verification and sends verification email", async () => {
    mockDb.query
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([{ affectedRows: 1 }]);

    const { registerUser } = await loadAuthService();

    const result = await registerUser({
      display_name: "Tester",
      email: "tester@example.com",
      password: "secret123",
    });

    expect(result).toEqual({
      message:
        "Đăng ký thành công bước 1. Vui lòng kiểm tra email để xác nhận tài khoản.",
      requires_email_verification: true,
    });

    expect(mockDb.query).toHaveBeenCalledTimes(2);
    expect(mockDb.query.mock.calls[0][0]).toContain("SELECT id FROM users");
    expect(mockDb.query.mock.calls[1][0]).toContain("INSERT INTO email_verifications");
    expect(mockSendVerificationEmail).toHaveBeenCalledTimes(1);
    expect(mockSendVerificationEmail.mock.calls[0][0]).toMatchObject({
      email: "tester@example.com",
      displayName: "Tester",
    });
    expect(mockSendVerificationEmail.mock.calls[0][0].verificationUrl).toContain(
      "http://localhost:5173/verify-email?token="
    );
  });

  it("verifyEmailRegistration creates user and marks verification as used", async () => {
    const token = "abc123token";

    mockDb.query.mockResolvedValueOnce([
      [
        {
          id: 99,
          email: "tester@example.com",
          display_name: "Tester",
          password_hash: "hashed-password",
          artist_register_intent: 0,
          expires_at: new Date(Date.now() + 60_000),
        },
      ],
    ]);

    mockConnection.query
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([{ insertId: 123 }])
      .mockResolvedValueOnce([{ affectedRows: 1 }]);

    const { verifyEmailRegistration } = await loadAuthService();

    const result = await verifyEmailRegistration({ token });

    expect(mockConnection.beginTransaction).toHaveBeenCalled();
    expect(mockConnection.query.mock.calls[1][0]).toContain("INSERT INTO users");
    expect(mockConnection.query.mock.calls[2][0]).toContain(
      "UPDATE email_verifications SET used_at = NOW()"
    );
    expect(mockConnection.commit).toHaveBeenCalled();
    expect(result).toMatchObject({
      message: "Xác nhận email thành công",
      user: {
        id: 123,
        email: "tester@example.com",
      },
      accessToken: "signed-token",
      refreshToken: "signed-token",
    });
  });

  it("resendVerificationEmail always returns generic success message", async () => {
    mockDb.query
      .mockResolvedValueOnce([[{ id: 1 }]])
      .mockResolvedValueOnce([[]]);

    const { resendVerificationEmail } = await loadAuthService();

    const result = await resendVerificationEmail({ email: "existing@example.com" });

    expect(result).toEqual({
      message:
        "Nếu email hợp lệ, chúng tôi đã gửi lại hướng dẫn xác thực tài khoản.",
    });
    expect(mockSendVerificationEmail).not.toHaveBeenCalled();
  });
});

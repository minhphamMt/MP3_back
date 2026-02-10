import { jest } from "@jest/globals";

const mockLoggerInfo = jest.fn();
const mockSendMail = jest.fn();

const loadEmailService = async () => {
  jest.unstable_mockModule("../utils/logger.js", () => ({
    logger: {
      info: mockLoggerInfo,
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    },
  }));

  jest.unstable_mockModule("nodemailer", () => ({
    default: {
      createTransport: jest.fn(() => ({
        sendMail: mockSendMail,
      })),
    },
  }));

  return import("../services/email.service.js");
};

describe("email.service transport selection", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it("logs verification url when smtp is not configured", async () => {
    delete process.env.EMAIL_TRANSPORT;
    delete process.env.SMTP_HOST;

    const { sendVerificationEmail } = await loadEmailService();

    await sendVerificationEmail({
      email: "tester@example.com",
      displayName: "Tester",
      verificationUrl: "http://localhost:5173/verify-email?token=abc",
    });

    expect(mockLoggerInfo).toHaveBeenCalledWith(
      "Email verification link generated",
      expect.objectContaining({
        email: "tester@example.com",
        transportMode: "log",
      })
    );
    expect(mockSendMail).not.toHaveBeenCalled();
  });

  it("auto-uses smtp when SMTP_HOST is configured", async () => {
    delete process.env.EMAIL_TRANSPORT;
    process.env.SMTP_HOST = "smtp.example.com";
    process.env.SMTP_PORT = "587";
    process.env.SMTP_USER = "mailer@example.com";
    process.env.SMTP_PASS = "app-password";
    process.env.MAIL_FROM = "Music App <no-reply@example.com>";

    const { sendVerificationEmail } = await loadEmailService();

    mockSendMail.mockResolvedValueOnce({ messageId: "abc" });

    await sendVerificationEmail({
      email: "tester@example.com",
      displayName: "Tester",
      verificationUrl: "http://localhost:5173/verify-email?token=abc",
    });

    expect(mockSendMail).toHaveBeenCalledTimes(1);
    expect(mockSendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "tester@example.com",
        subject: "Xác nhận email đăng ký tài khoản",
      })
    );
  });
});

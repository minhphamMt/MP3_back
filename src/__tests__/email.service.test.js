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
  const originalFetch = global.fetch;

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    process.env = { ...originalEnv };
    global.fetch = jest.fn();
  });

  afterAll(() => {
    process.env = originalEnv;
    global.fetch = originalFetch;
  });

  it("logs verification code when smtp and resend are not configured", async () => {
    delete process.env.EMAIL_TRANSPORT;
    delete process.env.SMTP_HOST;
    delete process.env.RESEND_API_KEY;

    const { sendVerificationEmail } = await loadEmailService();

    await sendVerificationEmail({
      email: "tester@example.com",
      displayName: "Tester",
      verificationCode: "123456",
    });

    expect(mockLoggerInfo).toHaveBeenCalledWith(
      "Email verification code generated",
      expect.objectContaining({
        email: "tester@example.com",
        transportMode: "log",
      })
    );
    expect(mockSendMail).not.toHaveBeenCalled();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("auto-uses smtp when SMTP_HOST is configured", async () => {
    delete process.env.EMAIL_TRANSPORT;
    delete process.env.RESEND_API_KEY;
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
      verificationCode: "123456",
    });

    expect(mockSendMail).toHaveBeenCalledTimes(1);
    expect(mockSendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "tester@example.com",
        subject: "Xác nhận email đăng ký tài khoản",
      })
    );
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("auto-uses resend when RESEND_API_KEY is configured", async () => {
    delete process.env.EMAIL_TRANSPORT;
    delete process.env.SMTP_HOST;
    process.env.RESEND_API_KEY = "re_test_key";
    process.env.MAIL_FROM = "Music App <onboarding@resend.dev>";

    global.fetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: async () => "",
    });

    const { sendVerificationEmail } = await loadEmailService();

    await sendVerificationEmail({
      email: "tester@example.com",
      displayName: "Tester",
      verificationCode: "123456",
    });

    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(global.fetch).toHaveBeenCalledWith(
      "https://api.resend.com/emails",
      expect.objectContaining({
        method: "POST",
      })
    );
    expect(mockSendMail).not.toHaveBeenCalled();
  });

  it("sends password reset email using smtp transport", async () => {
    process.env.EMAIL_TRANSPORT = "smtp";
    process.env.SMTP_HOST = "smtp.example.com";
    process.env.SMTP_PORT = "587";

    const { sendPasswordResetEmail } = await loadEmailService();

    mockSendMail.mockResolvedValueOnce({ messageId: "xyz" });

    await sendPasswordResetEmail({
      email: "tester@example.com",
      displayName: "Tester",
      verificationCode: "654321",
    });

    expect(mockSendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "tester@example.com",
        subject: "Mã đặt lại mật khẩu",
      })
    );
  });
});
console.log("✅ Email service test configured");
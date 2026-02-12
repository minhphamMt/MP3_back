import { jest } from "@jest/globals";

const mockLoggerInfo = jest.fn();
const mockSendMail = jest.fn();
const mockVerify = jest.fn();
const mockCreateTransport = jest.fn(() => ({
  verify: mockVerify,
  sendMail: mockSendMail,
}));

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
      createTransport: mockCreateTransport,
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

  it("logs verification code when transport is not configured", async () => {
    delete process.env.EMAIL_TRANSPORT;
    delete process.env.SMTP_HOST;
    delete process.env.BREVO_API_KEY;

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

  it("auto-uses brevo when BREVO_API_KEY is configured", async () => {
    delete process.env.EMAIL_TRANSPORT;
    process.env.BREVO_API_KEY = "test-api-key";
    process.env.BREVO_SENDER_EMAIL = "no-reply@example.com";
    process.env.BREVO_SENDER_NAME = "Music App";

    global.fetch.mockResolvedValueOnce({
      ok: true,
      status: 201,
      text: jest.fn().mockResolvedValue(""),
    });

    const { sendVerificationEmail } = await loadEmailService();

    await sendVerificationEmail({
      email: "tester@example.com",
      displayName: "Tester",
      verificationCode: "123456",
    });

    expect(global.fetch).toHaveBeenCalledWith(
      "https://api.brevo.com/v3/smtp/email",
      expect.objectContaining({ method: "POST" })
    );
    expect(mockSendMail).not.toHaveBeenCalled();
  });

  it("uses smtp when EMAIL_TRANSPORT=smtp", async () => {
    process.env.EMAIL_TRANSPORT = "smtp";
    process.env.SMTP_HOST = "smtp.example.com";
    process.env.SMTP_PORT = "465";
    process.env.SMTP_USER = "mailer@example.com";
    process.env.SMTP_PASS = "app-password";
    process.env.MAIL_FROM = "Music App <no-reply@example.com>";

    mockVerify.mockResolvedValueOnce(true);
    mockSendMail.mockResolvedValueOnce({ messageId: "abc" });

    const { sendVerificationEmail } = await loadEmailService();

    await sendVerificationEmail({
      email: "tester@example.com",
      displayName: "Tester",
      verificationCode: "123456",
    });

    expect(mockCreateTransport).toHaveBeenCalledWith(
      expect.objectContaining({
        host: "smtp.example.com",
        port: 465,
        secure: true,
      })
    );
    expect(mockSendMail).toHaveBeenCalledTimes(1);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("sends password reset email using brevo transport", async () => {
    process.env.EMAIL_TRANSPORT = "brevo";
    process.env.BREVO_API_KEY = "test-api-key";
    process.env.BREVO_SENDER_EMAIL = "no-reply@example.com";

    global.fetch.mockResolvedValueOnce({
      ok: true,
      status: 201,
      text: jest.fn().mockResolvedValue(""),
    });

    const { sendPasswordResetEmail } = await loadEmailService();

    await sendPasswordResetEmail({
      email: "tester@example.com",
      displayName: "Tester",
      verificationCode: "654321",
    });

    const [, request] = global.fetch.mock.calls[0];
    const payload = JSON.parse(request.body);

    expect(payload.subject).toBe("Mã đặt lại mật khẩu");
    expect(payload.to).toEqual([{ email: "tester@example.com" }]);
  });
});

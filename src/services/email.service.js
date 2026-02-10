import { logger } from "../utils/logger.js";

const parsePort = (value, fallback) => {
  const parsed = Number(value);
  if (Number.isNaN(parsed)) return fallback;
  return parsed;
};

const buildTransportConfig = () => {
  const port = parsePort(process.env.SMTP_PORT, 587);
  return {
    host: process.env.SMTP_HOST,
    port,
    secure: port === 465,
    auth:
      process.env.SMTP_USER && process.env.SMTP_PASS
        ? {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS,
          }
        : undefined,
  };
};

export const sendVerificationEmail = async ({
  email,
  displayName,
  verificationCode,
}) => {
  const transportMode =
    process.env.EMAIL_TRANSPORT || (process.env.SMTP_HOST ? "smtp" : "log");

  if (transportMode !== "smtp") {
    logger.info("Email verification code generated", {
      email,
      displayName,
      verificationCode,
      transportMode,
    });
    return;
  }

  let nodemailer;
  try {
    ({ default: nodemailer } = await import("nodemailer"));
  } catch (error) {
    const err = new Error(
      "nodemailer is required for SMTP transport. Please install dependencies."
    );
    err.status = 500;
    throw err;
  }

  if (!process.env.SMTP_HOST) {
    const err = new Error("SMTP_HOST is required when EMAIL_TRANSPORT=smtp");
    err.status = 500;
    throw err;
  }

  const from = process.env.MAIL_FROM || "no-reply@example.com";
  const transporter = nodemailer.createTransport(buildTransportConfig());

  await transporter.sendMail({
    from,
    to: email,
    subject: "Xác nhận email đăng ký tài khoản",
    text: `Xin chào ${displayName},\n\nMã xác nhận đăng ký tài khoản của bạn là: ${verificationCode}\n\nMã có hiệu lực trong thời gian giới hạn. Nếu không phải bạn, hãy bỏ qua email này.`,
    html: `<div style="font-family:Arial,sans-serif;line-height:1.6;color:#111827"><p>Xin chào <strong>${displayName}</strong>,</p><p>Mã xác nhận đăng ký tài khoản của bạn là:</p><p style="font-size:28px;font-weight:700;letter-spacing:6px;color:#2563eb;margin:8px 0 12px;">${verificationCode}</p><p style="font-size:13px;color:#6b7280">Mã có hiệu lực trong thời gian giới hạn. Nếu không phải bạn, hãy bỏ qua email này.</p></div>`,
  });
};

export default {
  sendVerificationEmail,
};

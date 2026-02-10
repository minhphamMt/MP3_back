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

export const sendVerificationEmail = async ({ email, displayName, verificationUrl }) => {
  const transportMode =
    process.env.EMAIL_TRANSPORT || (process.env.SMTP_HOST ? "smtp" : "log");

  if (transportMode !== "smtp") {
    logger.info("Email verification link generated", {
      email,
      displayName,
      verificationUrl,
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
    text: `Xin chào ${displayName},\n\nVui lòng xác nhận email để hoàn tất đăng ký bằng cách mở liên kết sau: ${verificationUrl}\n\nNếu không phải bạn, hãy bỏ qua email này.`,
    html: `<div style="font-family:Arial,sans-serif;line-height:1.6;color:#111827"><p>Xin chào <strong>${displayName}</strong>,</p><p>Vui lòng xác nhận email để hoàn tất đăng ký tài khoản.</p><p><a href="${verificationUrl}" style="display:inline-block;background:#2563eb;color:#ffffff;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:600">Xác nhận tài khoản</a></p><p style="font-size:13px;color:#6b7280">Nếu nút không hoạt động, vui lòng bấm vào liên kết này: <a href="${verificationUrl}">Xác nhận email</a>.</p><p>Nếu không phải bạn, hãy bỏ qua email này.</p></div>`,
  });
};

export default {
  sendVerificationEmail,
};

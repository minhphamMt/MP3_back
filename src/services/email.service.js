import { logger } from "../utils/logger.js";

const parsePort = (value, fallback) => {
  const parsed = Number(value);
  if (Number.isNaN(parsed)) return fallback;
  return parsed;
};

const detectTransportMode = () => {
  if (process.env.EMAIL_TRANSPORT) return process.env.EMAIL_TRANSPORT;
  if (process.env.RESEND_API_KEY) return "resend";
  if (process.env.SMTP_HOST) return "smtp";
  return "log";
};

const getFromAddress = () => process.env.MAIL_FROM || "no-reply@example.com";

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

const sendWithSmtp = async ({ email, subject, text, html }) => {
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

  const transporter = nodemailer.createTransport(buildTransportConfig());

  await transporter.sendMail({
    from: getFromAddress(),
    to: email,
    subject,
    text,
    html,
  });
};

const sendWithResend = async ({ email, subject, html, text }) => {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    const err = new Error(
      "RESEND_API_KEY is required when EMAIL_TRANSPORT=resend"
    );
    err.status = 500;
    throw err;
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: getFromAddress(),
      to: [email],
      subject,
      html,
      text,
    }),
  });

  if (!response.ok) {
    const responseText = await response.text();
    const err = new Error(`Resend API error: ${response.status} ${responseText}`);
    err.status = 502;
    throw err;
  }
};

const sendEmail = async ({ email, displayName, verificationCode, kind }) => {
  const transportMode = detectTransportMode();

  const isVerification = kind === "verification";
  const subject = isVerification
    ? "Xác nhận email đăng ký tài khoản"
    : "Mã đặt lại mật khẩu";
  const actionText = isVerification
    ? "Mã xác nhận đăng ký tài khoản của bạn là"
    : "Mã đặt lại mật khẩu của bạn là";

  const text = `Xin chào ${displayName},\n\n${actionText}: ${verificationCode}\n\nMã có hiệu lực trong thời gian giới hạn. Nếu không phải bạn, hãy bỏ qua email này.`;
  const html = `<div style="font-family:Arial,sans-serif;line-height:1.6;color:#111827"><p>Xin chào <strong>${displayName}</strong>,</p><p>${actionText}:</p><p style="font-size:28px;font-weight:700;letter-spacing:6px;color:#2563eb;margin:8px 0 12px;">${verificationCode}</p><p style="font-size:13px;color:#6b7280">Mã có hiệu lực trong thời gian giới hạn. Nếu không phải bạn, hãy bỏ qua email này.</p></div>`;

  if (transportMode === "smtp") {
    await sendWithSmtp({ email, subject, text, html });
    return;
  }

  if (transportMode === "resend") {
    await sendWithResend({ email, subject, text, html });
    return;
  }

  logger.info(
    isVerification
      ? "Email verification code generated"
      : "Password reset code generated",
    {
      email,
      displayName,
      verificationCode,
      transportMode,
    }
  );
};

export const sendVerificationEmail = async ({
  email,
  displayName,
  verificationCode,
}) => {
  await sendEmail({
    email,
    displayName,
    verificationCode,
    kind: "verification",
  });
};

export const sendPasswordResetEmail = async ({
  email,
  displayName,
  verificationCode,
}) => {
  await sendEmail({
    email,
    displayName,
    verificationCode,
    kind: "password_reset",
  });
};

export default {
  sendVerificationEmail,
  sendPasswordResetEmail,
};

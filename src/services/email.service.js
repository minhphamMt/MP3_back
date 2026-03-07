import { logger } from "../utils/logger.js";

const parsePort = (value, fallback) => {
  const parsed = Number(value);
  return Number.isNaN(parsed) ? fallback : parsed;
};

const detectTransportMode = () => {
  const mode = (process.env.EMAIL_TRANSPORT || "").toLowerCase();

  if (mode === "log") return "log";
  if (mode === "smtp") return "smtp";
  if (mode === "brevo") return "brevo";

  // Auto-detect
  if (process.env.BREVO_API_KEY) return "brevo";
  if (process.env.SMTP_HOST) return "smtp";
  return "log";
};

const getFromAddress = () => process.env.MAIL_FROM || "no-reply@example.com";
const getBrandName = () => process.env.BREVO_SENDER_NAME || "Music App";
const getBrandAvatarUrl = () => process.env.EMAIL_BRAND_AVATAR_URL || "";

const parseExpiryMinutes = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const buildExpiryMessage = (minutes) => {
  if (minutes <= 1) {
    return "Mã có hiệu lực trong 1 phút.";
  }

  return `Mã có hiệu lực trong ${minutes} phút.`;
};

// Ép Gmail dùng IPv4 để tránh IPv6 ENETUNREACH trên một số môi trường (Render hay gặp)
// Bạn có thể để SMTP_HOST=smtp.gmail.com và code sẽ tự ép sang IPv4
const resolveSmtpHost = (host) => {
  if (!host) return host;
  if (host === "smtp.gmail.com") return process.env.SMTP_HOST_IPV4 || "74.125.206.108";
  return host;
};

const buildTransportConfig = () => {
  const port = parsePort(process.env.SMTP_PORT, 587);
  const host = resolveSmtpHost(process.env.SMTP_HOST);

  // Quy ước:
  // - 587: STARTTLS => secure=false, requireTLS=true
  // - 465: SMTPS   => secure=true
  const is465 = port === 465;
  const is587 = port === 587;

  return {
    host,
    port,
    secure: is465, // chỉ true khi 465
    requireTLS: is587 ? true : undefined,

    auth:
      process.env.SMTP_USER && process.env.SMTP_PASS
        ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
        : undefined,

    // Timeout để tránh treo lâu
    connectionTimeout: parsePort(process.env.SMTP_CONNECTION_TIMEOUT_MS, 15000),
    greetingTimeout: parsePort(process.env.SMTP_GREETING_TIMEOUT_MS, 15000),
    socketTimeout: parsePort(process.env.SMTP_SOCKET_TIMEOUT_MS, 20000),

    // TLS settings (giúp ổn hơn trên vài môi trường)
    tls: {
      // Đừng tắt verify trong production. Nhưng nhiều bạn deploy demo hay bị lỗi cert chain.
      // Nếu bạn muốn strict: set SMTP_TLS_REJECT_UNAUTHORIZED=true
      rejectUnauthorized: (process.env.SMTP_TLS_REJECT_UNAUTHORIZED || "false").toLowerCase() === "true",
      servername: process.env.SMTP_HOST || undefined,
    },
  };
};

const sendWithSmtp = async ({ email, subject, text, html }) => {
  let nodemailer;
  try {
    ({ default: nodemailer } = await import("nodemailer"));
  } catch {
    const err = new Error("nodemailer is required for SMTP transport. Please install dependencies.");
    err.status = 500;
    throw err;
  }

  if (!process.env.SMTP_HOST) {
    const err = new Error("SMTP_HOST is required when EMAIL_TRANSPORT=smtp (or when SMTP_HOST is used).");
    err.status = 500;
    throw err;
  }

  const config = buildTransportConfig();

  const transporter = nodemailer.createTransport({
    ...config,
    // Debug tùy chọn (bật khi cần)
    logger: (process.env.SMTP_DEBUG || "false").toLowerCase() === "true",
    debug: (process.env.SMTP_DEBUG || "false").toLowerCase() === "true",
  });

  // Verify để fail sớm (rất hữu ích khi deploy)
  const verifyFirst = (process.env.SMTP_VERIFY_FIRST || "true").toLowerCase() === "true";
  if (verifyFirst) {
    await transporter.verify();
  }

  await transporter.sendMail({
    from: getFromAddress(),
    to: email,
    subject,
    text,
    html,
  });
};

const sendWithBrevo = async ({ email, subject, text, html }) => {
  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey) {
    const err = new Error("BREVO_API_KEY is required when EMAIL_TRANSPORT=brevo (or when BREVO_API_KEY is used).");
    err.status = 500;
    throw err;
  }

  const senderEmail = process.env.BREVO_SENDER_EMAIL;
  if (!senderEmail) {
    const err = new Error("BREVO_SENDER_EMAIL is required for Brevo transport.");
    err.status = 500;
    throw err;
  }

  const senderName = process.env.BREVO_SENDER_NAME || "Music App";

  const response = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "api-key": apiKey,
    },
    body: JSON.stringify({
      sender: { email: senderEmail, name: senderName },
      to: [{ email }],
      subject,
      textContent: text,
      htmlContent: html,
      replyTo: { email: senderEmail, name: senderName },
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    const err = new Error(`Brevo API error (${response.status}): ${body}`);
    err.status = response.status;
    throw err;
  }
};

const sendEmail = async ({ email, displayName, verificationCode, kind, expiresInMinutes }) => {
  const transportMode = detectTransportMode();

  const isVerification = kind === "verification";
  const subject = isVerification ? "Xác nhận email đăng ký tài khoản" : "Mã đặt lại mật khẩu";
  const actionText = isVerification
    ? "Mã xác nhận đăng ký tài khoản của bạn là"
    : "Mã đặt lại mật khẩu của bạn là";

  const safeName = displayName || "bạn";
  const safeExpiresInMinutes = parseExpiryMinutes(
    expiresInMinutes,
    isVerification ? 30 : 15
  );
  const expiryMessage = buildExpiryMessage(safeExpiresInMinutes);
  const reminderMessage = `${expiryMessage} Nếu không phải bạn, hãy bỏ qua email này.`;
  const brandName = getBrandName();
  const brandAvatarUrl = getBrandAvatarUrl();

  const text = `Xin chào ${safeName},\n\n${actionText}: ${verificationCode}\n\n${reminderMessage}`;
  const avatarBlock = brandAvatarUrl
    ? `<img src="${brandAvatarUrl}" alt="${brandName}" width="56" height="56" style="display:block;width:56px;height:56px;border-radius:50%;object-fit:cover;border:1px solid #e5e7eb" />`
    : `<div style="width:56px;height:56px;border-radius:50%;background:#2563eb;color:#fff;font-size:22px;font-weight:700;line-height:56px;text-align:center;">${brandName.charAt(
        0
      )}</div>`;

  const html = `<div style="font-family:Arial,sans-serif;line-height:1.6;color:#111827">
    <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px;">
      ${avatarBlock}
      <div style="font-size:16px;font-weight:700;color:#111827">${brandName}</div>
    </div>
    <p>Xin chào <strong>${safeName}</strong>,</p>
    <p>${actionText}:</p>
    <p style="font-size:28px;font-weight:700;letter-spacing:6px;color:#2563eb;margin:8px 0 12px;">${verificationCode}</p>
    <p style="font-size:13px;color:#6b7280">${reminderMessage}</p>
  </div>`;

  try {
    if (transportMode === "smtp") {
      await sendWithSmtp({ email, subject, text, html });
      return;
    }

    if (transportMode === "brevo") {
      await sendWithBrevo({ email, subject, text, html });
      return;
    }

    // Nếu không dùng transport gửi mail thật, default log
    logger.info(isVerification ? "Email verification code generated" : "Password reset code generated", {
      email,
      displayName: safeName,
      verificationCode,
      transportMode,
    });
  } catch (error) {
    logger.error("Send email failed", {
      transportMode,
      email,
      smtpHost: process.env.SMTP_HOST,
      smtpPort: process.env.SMTP_PORT,
      message: error?.message,
    });
    throw error;
  }
};

export const sendVerificationEmail = async ({
  email,
  displayName,
  verificationCode,
  expiresInMinutes,
}) => {
  await sendEmail({
    email,
    displayName,
    verificationCode,
    kind: "verification",
    expiresInMinutes,
  });
};

export const sendPasswordResetEmail = async ({
  email,
  displayName,
  verificationCode,
  expiresInMinutes,
}) => {
  await sendEmail({
    email,
    displayName,
    verificationCode,
    kind: "password_reset",
    expiresInMinutes,
  });
};


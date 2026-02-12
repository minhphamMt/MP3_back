import dotenv from "dotenv";

dotenv.config();

const env = {
  nodeEnv: process.env.NODE_ENV || "development",
  port: process.env.PORT || 3000,
  corsOrigins: process.env.CORS_ORIGINS,
  dbHost: process.env.DB_HOST,
  dbUser: process.env.DB_USER,
  dbPassword: process.env.DB_PASS,
  dbName: process.env.DB_NAME,
  embeddingServiceUrl: process.env.EMBEDDING_SERVICE_URL,
  frontendUrl: process.env.FRONTEND_URL,
  emailTransport:
    process.env.EMAIL_TRANSPORT || (process.env.BREVO_API_KEY ? "brevo" : process.env.SMTP_HOST ? "smtp" : "log"),
  backendUrl: process.env.BACKEND_URL || process.env.API_BASE_URL,
  brevoApiKey: process.env.BREVO_API_KEY,
  brevoSenderEmail: process.env.BREVO_SENDER_EMAIL,
  brevoSenderName: process.env.BREVO_SENDER_NAME,
  smtpHost: process.env.SMTP_HOST,
  smtpPort: process.env.SMTP_PORT || "465",
  smtpUser: process.env.SMTP_USER,
  mailFrom: process.env.MAIL_FROM,
  emailVerifyExpiresMinutes: process.env.EMAIL_VERIFY_EXPIRES_MINUTES,
};

export default env;

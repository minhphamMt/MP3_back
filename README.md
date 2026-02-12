## Cấu hình gửi email trên Render (khuyên dùng Resend)

Render có thể chặn outbound SMTP port 587, vì vậy backend này hỗ trợ gửi email qua Resend API (HTTPS/443).

### 1) Thiết lập biến môi trường

```bash
EMAIL_TRANSPORT=resend
RESEND_API_KEY=re_xxx
MAIL_FROM=Music App <onboarding@resend.dev>
```

> `MAIL_FROM` cần dùng domain/sender đã được Resend xác thực.

### 2) Cơ chế chọn transport

- Nếu `EMAIL_TRANSPORT` được đặt, hệ thống dùng đúng giá trị đó (`resend`, `smtp`, `log`).
- Nếu không đặt `EMAIL_TRANSPORT`:
  - Có `RESEND_API_KEY` -> tự dùng `resend`.
  - Có `SMTP_HOST` -> tự dùng `smtp`.
  - Không có gì -> `log` (chỉ log mã xác thực).

### 3) Fallback

Để debug local mà không gửi mail thật, dùng:

```bash
EMAIL_TRANSPORT=log
```

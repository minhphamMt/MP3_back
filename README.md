## Cấu hình gửi email trên Render bằng NodeMailer (SMTP)

Backend đã chuyển về dùng **NodeMailer** để gửi email xác thực/đặt lại mật khẩu.

### 1) Thiết lập biến môi trường

```bash
EMAIL_TRANSPORT=smtp
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_USER=your_email@gmail.com
SMTP_PASS=your_app_password
MAIL_FROM="Music App <your_email@gmail.com>"
```

> Mặc định dùng cổng `465` (SMTPS), thường ổn định hơn `587` trên một số môi trường triển khai.

### 2) Cơ chế chọn transport

- Nếu `EMAIL_TRANSPORT=smtp` -> gửi mail qua SMTP.
- Nếu `EMAIL_TRANSPORT=log` -> không gửi mail thật, chỉ log mã xác thực.
- Nếu không đặt `EMAIL_TRANSPORT`:
  - Có `SMTP_HOST` -> tự dùng `smtp`.
  - Không có -> `log`.

### 3) Fallback local debug

```bash
EMAIL_TRANSPORT=log
```

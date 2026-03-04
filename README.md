## Cấu hình gửi email trên Render (khuyến nghị: Brevo API)

Backend hỗ trợ 3 chế độ gửi email xác thực/đặt lại mật khẩu:

- **Brevo API (khuyến nghị trên Render)**: gửi qua HTTPS, không phụ thuộc SMTP port.
- **SMTP (NodeMailer)**: vẫn hỗ trợ cho local hoặc hạ tầng không chặn SMTP.
- **log**: không gửi mail thật, chỉ log mã xác thực.

### 1) Thiết lập biến môi trường cho Brevo

```bash
EMAIL_TRANSPORT=brevo
BREVO_API_KEY=your_brevo_api_key
BREVO_SENDER_EMAIL=your_sender@example.com
BREVO_SENDER_NAME="Music App"
```

> Nếu không đặt `EMAIL_TRANSPORT` nhưng có `BREVO_API_KEY`, hệ thống sẽ tự dùng `brevo`.

### 2) Thiết lập SMTP (tuỳ chọn)

```bash
EMAIL_TRANSPORT=smtp
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_USER=your_email@gmail.com
SMTP_PASS=your_app_password
MAIL_FROM="Music App <your_email@gmail.com>"
```

### 3) Cơ chế chọn transport

- Nếu `EMAIL_TRANSPORT=brevo` -> gửi mail qua Brevo API.
- Nếu `EMAIL_TRANSPORT=smtp` -> gửi mail qua SMTP.
- Nếu `EMAIL_TRANSPORT=log` -> không gửi mail thật, chỉ log mã xác thực.
- Nếu không đặt `EMAIL_TRANSPORT`:
  - Có `BREVO_API_KEY` -> tự dùng `brevo`.
  - Nếu không có nhưng có `SMTP_HOST` -> tự dùng `smtp`.
  - Không có cả 2 -> `log`.

## Admin report charts API

### GET `/api/admin/reports/charts`

Endpoint mới để phục vụ dashboard chart cho admin (đã aggregate sẵn ở backend).

Query params:
- `from` (`YYYY-MM-DD`, optional)
- `to` (`YYYY-MM-DD`, optional)
- `tz` (IANA timezone, default `Asia/Ho_Chi_Minh`)
- `bucket` (`day` | `month`, default `day`)
- `include` (comma-separated, optional):
  - `song_status`
  - `weekly_top`
  - `genre_status`
  - `user_distribution`
  - `artist_request_trend`
  - `album_by_month`

Ghi chú:
- Chỉ ADMIN mới truy cập được.
- Backend group theo timezone từ `tz`.
- Timeline được fill liên tục (thiếu thì count = 0).
- Có cache in-memory theo bộ tham số `from/to/tz/include/bucket` (TTL 10 phút).

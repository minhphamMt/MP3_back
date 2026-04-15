# Backend Nghe Nhạc

REST API cho ứng dụng nghe nhạc xây dựng bằng Node.js, Express và MySQL. Dự án hỗ trợ xác thực người dùng, quản lý bài hát/album/nghệ sĩ, playlist, tìm kiếm, lịch sử nghe, bảng xếp hạng, gợi ý bài hát, dashboard admin và upload media lên local, Google Cloud Storage hoặc Amazon S3.

## Tính năng chính

- Đăng ký, đăng nhập, refresh token, logout và reset mật khẩu.
- Xác thực email bằng mã 6 số, gửi mail qua `brevo`, `smtp` hoặc `log`.
- Đăng nhập bằng Firebase ID token.
- Phân quyền theo vai trò `USER`, `ARTIST`, `ADMIN`.
- CRUD cho `songs`, `albums`, `artists`, `playlists`, `genres`, `users`.
- Like bài hát, like album, follow nghệ sĩ, lưu lịch sử nghe và lịch sử tìm kiếm.
- Tìm kiếm theo bài hát, album, nghệ sĩ và user admin.
- Bảng xếp hạng Zing, new release, top 100, top 5 theo ngày/tuần, top 50 theo thể loại.
- Gợi ý cold-start và gợi ý bài hát tương tự bằng embedding kết hợp heuristic.
- Dashboard admin với overview, chart aggregate, duyệt bài hát và duyệt yêu cầu lên artist.
- Upload avatar, cover, audio qua `multer` và lưu trên `local`, `gcs` hoặc `s3`.

## Công nghệ sử dụng

- Node.js 18+ khuyến nghị.
- Express 5.
- MySQL 8+.
- JWT cho access token và refresh token.
- Firebase Admin SDK cho đăng nhập Firebase.
- Multer cho upload file.
- Fuse.js cho bộ máy tìm kiếm in-memory.
- Jest và Supertest cho test.

## Cấu trúc thư mục

```text
src/
  app.js                 Khởi tạo Express app
  server.js              Start server
  config/                ENV, DB, CORS, Firebase, upload
  controllers/           Xử lý request/response
  middlewares/           Auth, RBAC, validate, upload, error
  models/                Truy vấn và model liên quan
  routes/                Định nghĩa endpoint /api/*
  services/              Business logic chính
  validations/           Schema validate input
  utils/                 Helper về response, pagination, logger, timezone...
  __tests__/             Test cho app, auth, search, song, chart, admin, email...

database/migrations/     Migration bổ sung cho search và lyrics
uploads/                 Thư mục local upload khi dùng STORAGE_DRIVER=local
publicimg/               Tài nguyên ảnh công khai
```

## Yêu cầu trước khi chạy

- Đã cài Node.js và npm.
- Đã có MySQL schema nền cho hệ thống nghe nhạc.
- Nếu dùng Firebase login hoặc GCS, cần service account hợp lệ.
- Nếu upload local, nên đặt `STORAGE_DRIVER=local` khi phát triển local.

Lưu ý quan trọng: repo hiện có thư mục `database/migrations`, nhưng không chứa full schema gốc cho toàn bộ bảng như `users`, `songs`, `artists`, `albums`... Nghĩa là để chạy dự án, bạn cần có sẵn schema nền trong MySQL trước, sau đó mới áp thêm các migration bổ sung trong repo này.

## Cài đặt nhanh

```bash
npm install
cp .env.example .env
```

Cập nhật `.env` ít nhất với các biến sau:

```env
NODE_ENV=development
PORT=3000

CORS_ORIGINS=http://localhost:5173,http://localhost:3000

DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASS=secret
DB_NAME=music_app

JWT_SECRET=your-access-secret
JWT_REFRESH_SECRET=your-refresh-secret

STORAGE_DRIVER=local
LOCAL_UPLOAD_DIR=./uploads
LOCAL_UPLOAD_BASE_URL=/uploads

EMAIL_TRANSPORT=log
FRONTEND_URL=http://localhost:5173
BACKEND_URL=http://localhost:3000
```

Sau đó chạy server:

```bash
npm run dev
```

Server mặc định sẽ chạy tại `http://localhost:3000`.

## Scripts

```bash
npm run dev
npm start
npm test
```

## Health Check

```http
GET /api/health
```

Endpoint này vừa check server, vừa kiểm tra kết nối MySQL bằng `SELECT 1`.

## Biến môi trường quan trọng

### 1. Core server

- `PORT`: cổng chạy API.
- `CORS_ORIGINS`: danh sách origin cách nhau bằng dấu phẩy.
- `FRONTEND_URL`: URL frontend để dùng trong luồng auth/email.
- `BACKEND_URL`: URL backend công khai.

### 2. Database

- `DB_HOST`
- `DB_PORT`
- `DB_USER`
- `DB_PASS`
- `DB_NAME`

Lưu ý: `src/config/db.js` đang tạo kết nối MySQL với SSL CA tại `src/config/ca.pem`. Nếu môi trường local của bạn không dùng SSL, bạn có thể cần điều chỉnh file cấu hình này cho phù hợp với database thực tế.

### 3. Authentication

- `JWT_SECRET`
- `JWT_EXPIRES_IN`
- `JWT_REFRESH_SECRET`
- `JWT_REFRESH_EXPIRES_IN`

### 4. Firebase

- `FIREBASE_SERVICE_ACCOUNT_PATH`
- `FIREBASE_SERVICE_ACCOUNT_JSON`
- `FIREBASE_SERVICE_ACCOUNT__JSON`

Backend hỗ trợ đọc service account từ file, JSON string hoặc JSON đã mã hóa base64.

### 5. Storage

- `STORAGE_DRIVER=local|gcs|s3`
- `STORAGE_CDN_BASE_URL`
- `LOCAL_UPLOAD_DIR`
- `LOCAL_UPLOAD_BASE_URL`
- `S3_BUCKET`
- `S3_REGION`
- `S3_ACCESS_KEY_ID`
- `S3_SECRET_ACCESS_KEY`
- `S3_SIGNED_URL_EXPIRES`
- `GCS_BUCKET`
- `GCS_PROJECT_ID`
- `GCS_KEY_FILE`
- `GCS_SIGNED_URL_EXPIRES`

Nếu để mặc định `gcs`, backend sẽ cần Firebase/GCS credentials hợp lệ. Khi phát triển local, nên đặt rõ `STORAGE_DRIVER=local`.

### 6. Email

- `EMAIL_TRANSPORT=brevo|smtp|log`
- `BREVO_API_KEY`
- `BREVO_SENDER_EMAIL`
- `BREVO_SENDER_NAME`
- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_USER`
- `SMTP_PASS`
- `MAIL_FROM`
- `EMAIL_VERIFY_EXPIRES_MINUTES`
- `PASSWORD_RESET_EXPIRES_MINUTES`

Cơ chế chọn transport:

- `EMAIL_TRANSPORT=brevo` -> gửi mail qua Brevo API.
- `EMAIL_TRANSPORT=smtp` -> gửi mail qua SMTP.
- `EMAIL_TRANSPORT=log` -> không gửi mail thật, chỉ log mã xác thực.
- Nếu không set `EMAIL_TRANSPORT`, hệ thống tự động ưu tiên `brevo` nếu có `BREVO_API_KEY`, sau đó tới `smtp` nếu có `SMTP_HOST`, nếu không sẽ dùng `log`.

### 7. Search và recommendation

- `SEARCH_DOCUMENTS_ENABLED=true|false`
- `SEARCH_INDEX_TTL_MS`
- `SEARCH_INDEX_STALE_MS`
- `SEARCH_RESULT_TTL_MS`
- `EMBEDDING_SERVICE_URL`
- `SIMILAR_*` để tinh chỉnh gợi ý bài hát tương tự

Nếu `SEARCH_DOCUMENTS_ENABLED` không bật hoặc bảng `search_documents` chưa tồn tại, backend sẽ tự động fallback về in-memory search index + Fuse.js.

## Migration

Repo hiện có các migration bổ sung:

- `database/migrations/20260314_search_documents.sql`
- `database/migrations/20260314_search_documents_widen_columns.sql`
- `database/migrations/20260314_search_documents_backfill.sql`
- `database/migrations/20260314_search_optimizations.sql`
- `database/migrations/20260401_add_song_lyrics_path.sql`

Nếu muốn bật search materialized documents, hãy:

1. Đảm bảo schema gốc đã tồn tại.
2. Chạy các migration search.
3. Bật `SEARCH_DOCUMENTS_ENABLED=true`.

Vì repo không có migration runner riêng, bạn có thể chạy các file SQL bằng MySQL CLI, MySQL Workbench hoặc bất kỳ công cụ quản trị DB nào đang dùng trong nhóm.

## Nhóm API chính

| Nhóm | Prefix | Mô tả |
|---|---|---|
| Health | `/api/health` | Kiểm tra trạng thái API và DB |
| Auth | `/api/auth` | Register, verify email, login, refresh, logout, forgot/reset password, Firebase login |
| Users | `/api/users` | Hồ sơ cá nhân, đổi mật khẩu, avatar, admin user management |
| Artists | `/api/artists` | Danh sách nghệ sĩ, profile artist, follow/unfollow, CRUD artist |
| Albums | `/api/albums` | Danh sách album, chi tiết, like/unlike, CRUD album |
| Songs | `/api/songs` | Danh sách bài hát, chi tiết, lyrics, like, play count, CRUD, upload audio |
| Playlists | `/api/playlists` | CRUD playlist và sắp xếp bài hát trong playlist |
| Search | `/api/search` | Tìm kiếm realtime và lịch sử tìm kiếm |
| History | `/api/history` | Lịch sử nghe nhạc của user |
| Charts | `/api/charts` | Zing chart, new release, top 100, top 5, region chart, genre chart |
| Recommendations | `/api/recommendations` | Gợi ý cold-start |
| Similar Songs | `/api/recommend/:songId` | Gợi ý bài hát tương tự theo embedding/heuristic |
| Artist Requests | `/api/artist-requests` | Gửi và cập nhật yêu cầu lên artist |
| Admin | `/api/admin` | Search admin, dashboard, moderation, genres, artist requests, user detail |
| Trash | `/api/trash` | Xem item đã soft-delete cho admin/artist |

## Endpoint đáng chú ý

### Auth

- `POST /api/auth/register`
- `POST /api/auth/artist/register`
- `POST /api/auth/verify-email`
- `POST /api/auth/resend-verification`
- `POST /api/auth/login`
- `POST /api/auth/firebase`
- `POST /api/auth/refresh`
- `POST /api/auth/logout`
- `POST /api/auth/forgot-password`
- `POST /api/auth/reset-password`

### Search

- `GET /api/search?q=keyword&page=1&limit=10`
- `GET /api/search/history`
- `POST /api/search/save-history`

### Charts

- `GET /api/charts/zing`
- `GET /api/charts/zing/series`
- `GET /api/charts/new-release`
- `GET /api/charts/top-100`
- `GET /api/charts/regions`
- `GET /api/charts/top5`
- `GET /api/charts/weekly/top5`
- `GET /api/charts/weekly/series`
- `GET /api/charts/top-50/genres`

### Admin reports

- `GET /api/admin/reports/overview`
- `GET /api/admin/reports/charts`

Query params hỗ trợ cho `GET /api/admin/reports/charts`:

- `from`: định dạng `YYYY-MM-DD`
- `to`: định dạng `YYYY-MM-DD`
- `tz`: IANA timezone, mặc định `Asia/Ho_Chi_Minh`
- `bucket`: `day` hoặc `month`
- `include`: danh sách cách nhau bằng dấu phẩy, hỗ trợ:
  - `song_status`
  - `weekly_top`
  - `genre_status`
  - `user_distribution`
  - `artist_request_trend`
  - `album_by_month`

## Response format

Phần lớn endpoint sử dụng response chuẩn hóa:

```json
{
  "success": true,
  "data": {},
  "message": "Success",
  "meta": {
    "page": 1,
    "limit": 10,
    "total": 42,
    "totalPages": 5
  }
}
```

Khi có lỗi:

```json
{
  "success": false,
  "data": null,
  "message": "Route not found"
}
```

## Upload và media

- Avatar và cover ảnh dùng `multipart/form-data`.
- Audio upload qua field `audio`.
- Cover upload qua field `cover`.
- Avatar upload qua field `avatar`.
- Giới hạn file:
  - ảnh: tối đa 2 MB
  - audio: tối đa 20 MB

Khi `STORAGE_DRIVER=local`, backend phục vụ file static qua `/uploads` và `/music`.

## Search và recommendation

Hệ thống tìm kiếm có 2 tầng:

1. `search_documents`: bảng materialized để search nhanh và có rank.
2. `search-index.service`: fallback in-memory bằng Fuse.js, có warm cache khi app khởi động.

Hệ thống gợi ý có 2 kiểu:

- `GET /api/recommendations/cold-start`: gợi ý cho user mới hoặc khi chưa có nhiều dữ liệu cá nhân.
- `GET /api/recommend/:songId`: gợi ý bài hát tương tự dựa trên embedding audio, metadata, thể loại, nghệ sĩ, album và lượt nghe.

## Test

Dự án đang có test cho nhiều phần quan trọng:

- app routing
- auth service và auth controller
- song service và song controller
- search service
- chart service và admin chart controller
- email service
- history, lyrics, artist, admin user detail

Chạy toàn bộ test:

```bash
npm test
```
## Gợi ý cho môi trường production

- Trên Render, nên ưu tiên `EMAIL_TRANSPORT=brevo` vì không phụ thuộc SMTP port.
- Nếu dùng GCS trên Render, nên set `FIREBASE_SERVICE_ACCOUNT_JSON` thay vì đọc file local.
- Nên set rõ `CORS_ORIGINS`, `BACKEND_URL`, `FRONTEND_URL`.
- Nếu MySQL production có yêu cầu SSL riêng, hãy đồng bộ lại `src/config/db.js`.
- Nếu bật `SEARCH_DOCUMENTS_ENABLED=true`, hãy đảm bảo migration search đã được áp dụng trước khi deploy.

## Trạng thái hiện tại của README

README này được viết lại dựa trên code hiện có trong repo ở thời điểm hiện tại. Nếu nhóm thay đổi schema nền, biến môi trường hoặc bổ sung migration runner riêng, nên cập nhật lại phần setup tương ứng để tránh lệch giữa tài liệu và code.

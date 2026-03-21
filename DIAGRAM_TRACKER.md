# Theo dõi tiến độ vẽ biểu đồ

## 1. Cách dùng file này

File này dùng để theo dõi danh sách các biểu đồ cần vẽ cho hệ thống web nghe nhạc.

Quy ước:

- `[ ]` = chưa vẽ hoặc cần vẽ lại
- `[x]` = đã vẽ xong và đã chốt theo đúng hệ thống thực tế

Sau mỗi lần hoàn thành một biểu đồ, chỉ cần đổi `[ ]` thành `[x]` ở đúng mục tương ứng.

## 2. Phạm vi hệ thống thực tế phải bám khi vẽ

### 2.1. Frontend thực tế đang sử dụng

Dựa trên danh sách API và mô tả frontend bạn đã cung cấp, khi vẽ biểu đồ phải bám đúng các điểm sau:

- Frontend là web app dùng `Axios` làm HTTP client qua `src/api/axios.js`.
- `baseURL` của frontend là `VITE_API_URL`.
- Frontend tự gắn `Authorization: Bearer <token>` khi có `accessToken`.
- Khi backend trả `401`, frontend tự gọi `POST /auth/refresh` rồi gửi lại request cũ.
- Frontend dùng `Firebase Auth` để đăng nhập Google bằng `signInWithPopup`.
- Sau khi đăng nhập Google, frontend lấy `idToken` rồi gọi backend qua `POST /auth/firebase`.
- Frontend đang có luồng upload media trực tiếp lên `Firebase Storage` trong `ArtistSongForm.jsx`.
- Frontend lấy URL public bằng `getDownloadURL` rồi mới dùng URL đó trong dữ liệu gửi về backend.
- Ngoài các file `src/api/*.js`, frontend còn gọi trực tiếp một số endpoint trong store/component như:
  - `/songs/{id}/like`
  - `/songs/{id}/play`
  - `/songs/art`

### 2.2. Backend thực tế đang sử dụng

Dựa trên code backend hiện tại, khi vẽ biểu đồ phải bám đúng các công nghệ sau:

- `Node.js`
- `Express 5`
- `CORS`
- `JWT access token + refresh token`
- `RBAC middleware`
- `Validation middleware`
- `Multer` cho upload qua backend
- `Bcrypt` cho mã hóa mật khẩu
- `mysql2` làm driver kết nối cơ sở dữ liệu
- Cơ sở dữ liệu triển khai thực tế là `TiDB Cloud (MySQL-compatible)`
- `Firebase Admin` ở backend để xác minh token / tích hợp dịch vụ Firebase phía server
- `@google-cloud/storage` cho GCS
- `@aws-sdk/client-s3` cho S3
- Storage backend hỗ trợ `local`, `GCS`, `S3`
- Dịch vụ email hỗ trợ `Brevo`, `SMTP`, `log`; cấu hình hiện tại đang ưu tiên `Brevo`
- Backend có cache in-memory cho chart, recommendation và search index
- Backend hiện đang hướng tới môi trường deploy kiểu `Render`

### 2.3. Nguyên tắc bắt buộc khi vẽ

- Nếu đang mô tả triển khai thực tế, không ghi `MySQL Database` nữa mà ghi `TiDB Cloud` hoặc `TiDB Cloud (MySQL-compatible)`.
- Nếu đang mô tả luồng frontend thực tế, phải thể hiện việc frontend gọi trực tiếp `Firebase Auth` và `Firebase Storage`.
- Không vẽ toàn bộ upload media như thể đều đi qua backend, vì frontend hiện có luồng upload trực tiếp lên Firebase Storage.
- Khi vẽ sequence hoặc activity liên quan đăng nhập, phải nhớ frontend có cơ chế tự động refresh token qua Axios interceptor.
- Khi vẽ kiến trúc tổng thể, cần phân biệt rõ:
  - Frontend Web App
  - Backend API
  - TiDB Cloud
  - Firebase Auth
  - Firebase Storage / GCS
  - Email Provider

## 3. Nhóm API frontend đang sử dụng để làm căn cứ vẽ biểu đồ

### A. Auth API

- `POST /auth/login`
- `POST /auth/register`
- `POST /auth/artist/login`
- `POST /auth/artist/register`
- `POST /auth/verify-email`
- `POST /auth/resend-verification`
- `POST /auth/firebase`
- `POST /auth/forgot-password`
- `POST /auth/reset-password`
- `POST /auth/refresh`
- `POST /auth/logout`
- `GET /users/me`

### B. User API

- `GET /users/me/liked-songs`
- `GET /users/me`
- `PUT /users/me`
- `PATCH /users/me/password`
- `POST /users/me/avatar`
- `GET /users/me/liked-albums`
- `GET /users/me/followed-artists`

### C. Admin API

- `GET /admin/reports/overview`
- `GET /admin/reports/charts`
- `GET /admin/search`
- `GET /admin/genres`
- `POST /admin/genres`
- `PUT /admin/genres/{id}`
- `DELETE /admin/genres/{id}`
- `PATCH /admin/genres/{id}/restore`
- `GET /admin/songs`
- `PUT /admin/songs/{id}`
- `PATCH /admin/songs/{id}/review`
- `PATCH /admin/songs/{id}/approve`
- `PATCH /admin/songs/{id}/block`
- `GET /users`
- `POST /users`
- `GET /users/{id}`
- `PUT /users/{id}`
- `DELETE /users/{id}`
- `PATCH /users/{id}/role`
- `PATCH /users/{id}/active`
- `POST /users/{id}/avatar`
- `GET /admin/users/{id}`
- `GET /admin/artist-requests`
- `PATCH /admin/artist-requests/{id}/review`
- `PATCH /admin/artist-requests/{id}/approve`
- `PATCH /admin/artist-requests/{id}/reject`

### D. Artist API

- `GET /artists/collections`
- `GET /artists`
- `GET /artists/{id}`
- `GET /artists/me`
- `POST /artists`
- `PUT /artists/{id}`
- `DELETE /artists/{id}`
- `POST /artists/me/avatar`
- `POST /artists/{id}/follow`
- `DELETE /artists/{id}/follow`

### E. Artist Request API

- `POST /artist-requests`
- `GET /artist-requests/me`
- `PATCH /artist-requests/me`

### F. Album API

- `GET /albums`
- `GET /albums/{id}`
- `POST /albums`
- `PUT /albums/{id}`
- `DELETE /albums/{id}`
- `PATCH /albums/{id}/restore`
- `POST /albums/{id}/like`
- `DELETE /albums/{id}/like`

### G. Song API

- `GET /songs`
- `GET /songs/{id}`
- `GET /songs/art`
- `POST /songs`
- `PUT /songs/{id}`
- `DELETE /songs/{id}`
- `PATCH /songs/{id}/restore`
- `POST /songs/{id}/audio`
- `GET /songs/{id}/lyrics`
- `POST /songs/{id}/play`
- `POST /songs/{id}/like`
- `DELETE /songs/{id}/like`
- `GET /songs/liked`
- `GET /api/songs/liked`

### H. Playlist API

- `GET /playlists`
- `GET /playlists/{id}`
- `POST /playlists`
- `PUT /playlists/{id}`
- `DELETE /playlists/{id}`
- `POST /playlists/{id}/songs`
- `DELETE /playlists/{id}/songs/{songId}`
- `PATCH /playlists/{id}/songs/{songId}/reorder`

### I. Search, History, Chart, Recommendation, Trash

- `GET /search`
- `GET /search/history`
- `POST /search/save-history`
- `POST /history`
- `GET /history/me`
- `GET /charts/zing`
- `GET /charts/zing/series`
- `GET /charts/top5`
- `GET /charts/new-release`
- `GET /charts/top-100`
- `GET /charts/top-50/genres`
- `GET /charts/regions`
- `GET /charts/weekly/top5`
- `GET /charts/weekly/series`
- `GET /recommend/{songId}`
- `GET /recommendations/cold-start`
- `GET /recommend/cold-start`
- `GET /trash`
- `PATCH /songs/{id}/restore`
- `PATCH /albums/{id}/restore`
- `PATCH /artists/{id}/restore`
- `PATCH /admin/genres/{id}/restore`

## 4. Thứ tự ưu tiên nên vẽ

Nên đi theo thứ tự:

1. Biểu đồ khối tổng thể
2. Biểu đồ khối nội bộ backend
3. Use case tổng quát
4. Các use case phân rã
5. Các biểu đồ hoạt động
6. Các biểu đồ trình tự
7. Biểu đồ lớp lĩnh vực

## 5. Danh sách biểu đồ cần vẽ

### A. Biểu đồ khối

- [x] `D01` - Biểu đồ khối tổng thể hệ thống thực tế
  Thể hiện đúng: Frontend Web App, Backend API, TiDB Cloud, Firebase Auth, Firebase Storage hoặc GCS, Email Provider.
  Tệp mã: `CodeBieuDo/D01_BieuDoKhoiTongThe.xml`
  Công cụ: `XML import cho diagrams.net`
  Ghi chú: Đã chốt bản tổng quan bám TiDB Cloud, Firebase Admin, Firebase Auth, Firebase Storage / GCS và Brevo / SMTP.

- [ ] `D02` - Biểu đồ khối nội bộ Backend
  Thể hiện đúng: Routes, Middleware, Controllers, Services, Cache, Firebase Admin integration, TiDB Cloud connection, Email service, Storage service.

### B. Use case tổng quát

- [x] `D03` - Use case tổng quát của hệ thống
  Actor chính: Guest, User, Artist, Admin.
  Tệp mã: `CodeBieuDo/D03_BieuDoCaSuDungTongQuat.xml`
  Công cụ: `XML import cho diagrams.net`
  Ghi chú: Đã gom use case theo các cụm nghiệp vụ lớn của hệ thống để làm sơ đồ tổng quát.

### C. Use case phân rã chức năng

- [ ] `D04` - UC phân rã: Xác thực và tài khoản
  Gồm: đăng ký, xác minh email, đăng nhập, đăng nhập artist, đăng nhập Google/Firebase, refresh token, logout, cập nhật profile, đổi mật khẩu, upload avatar.
  Tệp mã hiện có:
  - `CodeBieuDo/D04a_UCPhanRa_DangKy.xml`
  - `CodeBieuDo/D04b_UCPhanRa_DangNhap.xml`
  Ghi chú: Đã tách riêng 2 sơ đồ con cho đăng ký và đăng nhập; phần hồ sơ/tài khoản sẽ bổ sung nếu cần.

- [x] `D05` - UC phân rã: Người dùng nghe nhạc và tương tác
  Gồm: nghe nhạc, like song, like album, follow artist, xem lịch sử nghe, xem lịch sử tìm kiếm, quản lý playlist.
  Tệp mã: `CodeBieuDo/D05_UCPhanRa_NguoiDungNgheNhacVaTuongTac.xml`
  Công cụ: `XML import cho diagrams.net`
  Ghi chú: Đã tách actor Guest cho các chức năng công khai và actor User cho nhóm tương tác cá nhân.

- [x] `D06` - UC phân rã: Artist quản lý nội dung
  Gồm: xem hồ sơ artist của tôi, cập nhật artist, tạo/sửa/xóa/khôi phục album, tạo/sửa/xóa/khôi phục bài hát, upload media, xem bài hát theo artist.
  Tệp mã: `CodeBieuDo/D06_UCPhanRa_ArtistQuanLyNoiDung.xml`
  Công cụ: `XML import cho diagrams.net`
  Ghi chú: Sơ đồ tập trung vào actor Nghệ sĩ; backend thực tế cho phép ADMIN và ARTIST ở nhiều route nội dung nhưng biểu đồ này mô tả nhánh nghiệp vụ của artist.

- [x] `D07` - UC phân rã: Yêu cầu trở thành artist và kiểm duyệt
  Gồm: gửi request artist, cập nhật request, xem request của tôi, admin review, approve, reject.
  Tệp mã: `CodeBieuDo/D07_UCPhanRa_YeuCauTroThanhArtistVaKiemDuyet.xml`
  Công cụ: `XML import cho diagrams.net`
  Ghi chú: Đã bổ sung đúng logic approve ở backend gồm tạo/khôi phục artist và cập nhật role user thành ARTIST.

- [x] `D08` - UC phân rã: Khám phá nội dung và cá nhân hóa
  Gồm: search, lưu lịch sử search, charts, top 100, top 5, region charts, top 50 genre, cold-start recommendation, similar songs.
  Tệp mã: `CodeBieuDo/D08_UCPhanRa_KhamPhaNoiDungVaCaNhanHoa.xml`
  Công cụ: `XML import cho diagrams.net`
  Ghi chú: Đã bổ sung thêm nhánh bài hát mới phát hành vì backend hiện có route chart `new-release`; lưu lịch sử tìm kiếm chỉ gắn với người dùng đã đăng nhập.

- [x] `D09` - UC phân rã: Quản trị hệ thống
  Gồm: quản lý user, đổi role, khóa/mở khóa, quản lý genre, kiểm duyệt bài hát, quản lý request artist, trash, admin reports.
  Tệp mã: `CodeBieuDo/D09_UCPhanRa_QuanTriHeThong.xml`
  Công cụ: `XML import cho diagrams.net`
  Ghi chú: Đã gom các nhánh quản trị lớn để sơ đồ không quá rối, nhưng vẫn bám đủ các route admin/user/trash hiện có.

### D. Biểu đồ hoạt động

- [x] `D10` - Hoạt động: Đăng ký và xác minh email
  Luồng chính: đăng ký, tạo mã xác minh, gửi email, xác minh mã, tạo user thật.
  Tệp mã: `CodeBieuDo/D10_HoatDong_DangKyVaXacMinhEmail.xml`
  Công cụ: `XML import cho diagrams.net`
  Ghi chú: Đã bám đúng flow backend hiện tại: đăng ký chỉ tạo bản ghi chờ trong `email_verifications`, còn bước verify mới tạo user thật và phát access/refresh token.

- [x] `D11` - Hoạt động: Quên mật khẩu và đặt lại mật khẩu
  Luồng chính: gửi mã reset, kiểm tra hạn, đổi mật khẩu.
  Tệp mã: `CodeBieuDo/D11_HoatDong_QuenMatKhauVaDatLaiMatKhau.xml`
  Công cụ: `XML import cho diagrams.net`
  Ghi chú: Đã thể hiện đúng nhánh backend trả thông báo chung ở bước quên mật khẩu để tránh lộ thông tin email hợp lệ; bước reset mới thực sự cập nhật `users.password_hash` và đánh dấu `password_resets.used_at`.

- [x] `D12` - Hoạt động: Cơ chế refresh token ở frontend và backend
  Luồng chính: request bị `401`, Axios interceptor gọi `/auth/refresh`, nhận token mới, gửi lại request cũ.
  Tệp mã: `CodeBieuDo/D12_HoatDong_RefreshTokenFrontendVaBackend.xml`
  Công cụ: `XML import cho diagrams.net`
  Ghi chú: Đã nối đúng mô tả frontend về Axios interceptor với flow backend `refreshTokens()`: verify refresh JWT, kiểm tra revoke, kiểm tra user, revoke token cũ, phát token mới rồi retry request gốc.

- [ ] `D13` - Hoạt động: Gửi và cập nhật yêu cầu artist
  Luồng chính: tạo request, sửa request, reset trạng thái về pending khi cần.

- [ ] `D14` - Hoạt động: Admin approve/reject artist request
  Luồng chính: review request, tạo hoặc khôi phục artist, đổi role user thành artist.

- [ ] `D15` - Hoạt động: Artist upload media
  Luồng chính thực tế ưu tiên: frontend upload trực tiếp lên Firebase Storage, lấy URL public, sau đó gửi metadata hoặc URL về backend.

- [ ] `D16` - Hoạt động: Artist tạo bài hát
  Luồng chính: kiểm tra artist profile, gán artist, ép status pending nếu là artist, validate album.

- [ ] `D17` - Hoạt động: Admin kiểm duyệt bài hát
  Luồng chính: review, approve, reject, cập nhật release date nếu cần.

- [ ] `D18` - Hoạt động: Người dùng nghe bài hát
  Luồng chính: gọi `/songs/{id}/play`, kiểm tra bài hát public, xử lý duration, chống spam, tăng play count, cập nhật day/week stats, ghi history.

- [ ] `D19` - Hoạt động: Quản lý playlist
  Luồng chính: tạo playlist, thêm bài hát, xóa bài hát, đổi vị trí bài hát.

- [ ] `D20` - Hoạt động: Search và lưu lịch sử tìm kiếm
  Luồng chính: normalize keyword, tìm kiếm, lưu history, cắt dữ liệu cũ.

### E. Biểu đồ trình tự

- [ ] `D21` - Trình tự: Đăng ký và verify email
  Thành phần: Frontend -> Axios -> Auth API -> Email Service -> TiDB Cloud.

- [ ] `D22` - Trình tự: Đăng nhập bằng Firebase
  Thành phần: Frontend -> Firebase Auth -> lấy `idToken` -> `POST /auth/firebase` -> Backend -> Firebase Admin -> TiDB Cloud.

- [ ] `D23` - Trình tự: Refresh token tự động qua Axios interceptor
  Thành phần: Frontend -> Axios -> API bất kỳ -> `401` -> `/auth/refresh` -> nhận token mới -> gửi lại request cũ.

- [ ] `D24` - Trình tự: User gửi artist request
  Thành phần: Frontend -> Axios -> Auth Middleware -> Artist Request Controller -> Artist Request Service -> TiDB Cloud.

- [ ] `D25` - Trình tự: Admin approve artist request
  Thành phần: Frontend -> Axios -> Admin API -> Auth Middleware -> RBAC -> Admin Controller -> Artist Request Service -> Artist Service -> User Service -> TiDB Cloud.

- [ ] `D26` - Trình tự: Artist upload media trực tiếp lên Firebase Storage
  Thành phần: Frontend -> Firebase Storage -> lấy public URL -> Frontend gửi URL về Backend API.

- [ ] `D27` - Trình tự: Artist tạo hoặc cập nhật bài hát
  Thành phần: Frontend -> Axios -> Song API -> Song Controller -> Song Service -> TiDB Cloud.

- [ ] `D28` - Trình tự: Admin review bài hát
  Thành phần: Frontend -> Axios -> Admin API -> Admin Controller -> Song Service -> TiDB Cloud.

- [ ] `D29` - Trình tự: Người dùng nghe bài hát
  Thành phần: Frontend -> AudioProvider hoặc player store -> `/songs/{id}/play` -> Song Service -> History Service -> TiDB Cloud.

- [ ] `D30` - Trình tự: Quản lý playlist
  Thành phần: Frontend -> Axios -> Playlist API -> Playlist Controller -> Playlist Service -> transaction trên TiDB Cloud.

- [ ] `D31` - Trình tự: Search và save search history
  Thành phần: Frontend -> Axios -> Search Controller -> Search Service -> Search Index Service -> TiDB Cloud.

- [ ] `D32` - Trình tự: Lấy bài hát tương tự
  Thành phần: Frontend -> Axios -> Song Recommendation Controller -> Song Recommendation Service -> Cache -> TiDB Cloud.

- [ ] `D33` - Trình tự: Lấy admin charts
  Thành phần: Frontend -> Axios -> Admin Controller -> Admin Service -> Cache -> TiDB Cloud.

### F. Biểu đồ lớp lĩnh vực

- [ ] `D34` - Biểu đồ lớp lĩnh vực tổng
  Lớp chính: User, Artist, ArtistRequest, Album, Song, Genre, Lyrics, Playlist, PlaylistSong, SongLike, AlbumLike, ArtistFollow, ListeningHistory, SearchHistory, SongPlayStat, SongEmbedding, EmailVerification, PasswordReset.

- [ ] `D35` - Biểu đồ lớp lĩnh vực: Nhóm nội dung âm nhạc
  Lớp chính: Artist, Album, Song, Genre, Lyrics, SongArtist, SongGenre.

- [ ] `D36` - Biểu đồ lớp lĩnh vực: Nhóm tương tác người dùng
  Lớp chính: User, Playlist, PlaylistSong, SongLike, AlbumLike, ArtistFollow, ListeningHistory, SearchHistory.

- [ ] `D37` - Biểu đồ lớp lĩnh vực: Nhóm kiểm duyệt và hỗ trợ hệ thống
  Lớp chính: ArtistRequest, EmailVerification, PasswordReset, SongPlayStat, SongEmbedding.

## 6. Danh sách tối thiểu nếu muốn làm gọn

Nếu bạn không muốn vẽ quá nhiều, bộ tối thiểu nên có:

- [ ] `M01` - Biểu đồ khối tổng thể hệ thống thực tế
- [ ] `M02` - Biểu đồ khối nội bộ backend
- [ ] `M03` - Use case tổng quát
- [ ] `M04` - UC phân rã: Xác thực và tài khoản
- [ ] `M05` - UC phân rã: Artist quản lý nội dung
- [ ] `M06` - UC phân rã: Quản trị hệ thống
- [ ] `M07` - Hoạt động: Refresh token tự động
- [ ] `M08` - Hoạt động: Admin approve artist request
- [ ] `M09` - Hoạt động: Người dùng nghe bài hát
- [ ] `M10` - Trình tự: Đăng nhập bằng Firebase
- [ ] `M11` - Trình tự: Refresh token tự động qua Axios interceptor
- [ ] `M12` - Biểu đồ lớp lĩnh vực tổng

## 7. Mẫu ghi chú sau khi hoàn thành

Bạn có thể thêm thông tin sau mỗi mục sau khi vẽ xong.

Ví dụ:
















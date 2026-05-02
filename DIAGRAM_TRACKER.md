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
  Tệp mã: `CodeBieuDo/Khoi/D01_BieuDoKhoiTongThe.xml`
  Công cụ: `XML import cho diagrams.net`
  Ghi chú: Đã dựng lại theo kiểu block overview 3 khối `Frontend / Backend + Data / External Services`; bên trong có các thành phần con như `Browser`, `Giao diện React`, `Axios + Refresh Token`, `Express API`, `Firebase Admin`, `TiDB Cloud`, `Firebase Auth`, `Media Storage`, `Email Provider`.

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

Chốt lại cho phần này:

- Chỉ giữ các luồng có nhiều nhánh, trạng thái, transaction hoặc side effect lớn.
- Các chức năng đã chọn ở activity sẽ không vẽ lại ở phần sequence bên dưới.
- Không tách riêng CRUD đơn giản như `like/unlike`, `follow/unfollow`, `get list/get by id`, `update profile` thường.

- [x] `D10` - Hoạt động: Đăng ký và xác minh email
  Luồng chính: đăng ký, tạo mã xác minh, gửi email, xác minh mã, tạo user thật, phát access/refresh token.
  Tệp mã: `CodeBieuDo/HoatDong/D10_HoatDong_DangKyVaXacMinhEmail.xml`
  Công cụ: `XML import cho diagrams.net`
  Ghi chú: Đã vẽ xong theo khổ A4 dọc, tách 5 cột User / Frontend / Backend / Email Service / TiDB Cloud để các nhánh chính và nhánh lỗi không chồng lên nhau; backend chỉ tạo user thật ở bước verify.

- [x] `D12` - Hoạt động: Cơ chế refresh token ở frontend và backend
  Luồng chính: request bị `401`, Axios interceptor gọi `/auth/refresh`, backend kiểm tra refresh token, revoke token cũ, phát token mới, frontend gửi lại request cũ.
  Tệp mã: `CodeBieuDo/HoatDong/D12_HoatDong_RefreshTokenFrontendVaBackend.xml`
  Công cụ: `XML import cho diagrams.net`
  Ghi chú: Đã vẽ xong theo khổ A4 dọc với 5 cột User / Frontend + Axios / Protected API / Auth API / TiDB Cloud; nhánh lỗi và nhánh retry được tách riêng để không đè line lên trục chính.

- [x] `D14` - Hoạt động: Admin approve/reject artist request
  Luồng chính: review request, approve hoặc reject, tạo artist mới hoặc khôi phục artist cũ, đổi role user thành `ARTIST`.
  Tệp mã: `CodeBieuDo/HoatDong/D14_HoatDong_AdminApproveRejectArtistRequest.xml`
  Công cụ: `XML import cho diagrams.net`
  Ghi chú: Đã vẽ xong theo khổ A4 dọc, đen trắng, lane liền nhau; nhánh `reject` được tách riêng khỏi trục `approve` để không đè line, còn nhánh `approve` thể hiện đúng logic đảm bảo artist profile active rồi mới đổi role user sang `ARTIST`.

- [x] `D16` - Hoạt động: Artist tạo bài hát và đưa vào hàng chờ kiểm duyệt
  Luồng chính: kiểm tra artist profile, ép `status = pending`, gán artist chính, kiểm tra album có thuộc artist hay không, lưu song/genre/artist liên quan.
  Tệp mã: `CodeBieuDo/HoatDong/D16_HoatDong_ArtistTaoBaiHatVaDuaVaoHangChoKiemDuyet.xml`
  Công cụ: `XML import cho diagrams.net`
  Ghi chú: Nếu media đã được frontend upload trực tiếp lên Firebase Storage thì activity này chỉ cần coi URL media là đầu vào của bước tạo bài hát.

- [x] `D17` - Hoạt động: Admin kiểm duyệt bài hát
  Luồng chính: review, approve hoặc reject, cập nhật `reviewed_by`, `reject_reason`, `reviewed_at`, và tự gán `release_date` nếu bài được duyệt.
  Tệp mã: `CodeBieuDo/HoatDong/D17_HoatDong_AdminKiemDuyetBaiHat.xml`
  Công cụ: `XML import cho diagrams.net`
  Ghi chú: Đây là flow moderation trung tâm của hệ thống âm nhạc.

- [x] `D18` - Hoạt động: Người dùng nghe bài hát và cập nhật thống kê
  Luồng chính: kiểm tra bài hát public, kiểm tra `duration >= 30s`, chống spam 5 phút, tăng `play_count`, cập nhật thống kê ngày/tuần, ghi listening history.
  Tệp mã: `CodeBieuDo/HoatDong/D18_HoatDong_NguoiDungNgheBaiHatVaCapNhatThongKe.xml`
  Công cụ: `XML import cho diagrams.net`
  Ghi chú: Đây là flow có nhiều điều kiện nghiệp vụ và cập nhật dữ liệu nhất ở phía user.

- [x] `D19` - Hoạt động: Quản lý playlist
  Luồng chính: tạo playlist, kiểm tra owner, thêm bài hát, chống trùng, xóa bài hát, reorder vị trí bài hát bằng transaction.
  Tệp mã: `CodeBieuDo/HoatDong/D19_HoatDong_QuanLyPlaylist.xml`
  Công cụ: `XML import cho diagrams.net`
  Ghi chú: Đây là flow tương tác cá nhân nổi bật nhất sau nghe nhạc.

### E. Biểu đồ trình tự

Chốt lại cho phần này:

- Chỉ chọn các luồng phối hợp nhiều thành phần `Frontend -> Middleware -> Controller -> Service -> Cache/External -> TiDB Cloud`.
- Không vẽ lại các chức năng đã có ở activity: `D10`, `D12`, `D14`, `D16`, `D17`, `D18`, `D19`.
- Ưu tiên các luồng thể hiện rõ tích hợp Firebase, cache, search index và dashboard.

- [x] `D22` - Trình tự: Đăng nhập bằng Firebase
  Thành phần: Frontend -> Firebase Auth -> lấy `idToken` -> `POST /auth/firebase` -> Auth Controller -> Auth Service -> Firebase Admin -> TiDB Cloud.
  Tệp mã: `CodeBieuDo/TrinhTu/D22_TrinhTu_DangNhapBangFirebase.xml`
  Công cụ: `XML import cho diagrams.net`
  Ghi chú: Đã dựng lại theo chuẩn UML sequence gọn hơn với icon `boundary / control / entity`, lifeline và activation căn thẳng hàng, `alt` frame chỉ giữ nhánh `user mới` để không sinh line chồng nhau.

- [x] `D26` - Trình tự: Frontend upload media trực tiếp lên Firebase Storage rồi gửi URL về backend
  Thành phần: Frontend -> Firebase Storage -> `getDownloadURL()` -> Frontend -> Song API hoặc Admin API -> Backend -> TiDB Cloud.
  Tệp mã: `CodeBieuDo/TrinhTu/D26_TrinhTu_UploadMediaTrucTiepLenFirebaseStorageVaGuiURLVeBackend.xml`
  Công cụ: `XML import cho diagrams.net`
  Ghi chú: Đã vẽ theo cùng template UML sequence đã chốt; sơ đồ chỉ nhấn mạnh việc upload trực tiếp lên Firebase Storage, lấy URL công khai rồi gửi metadata URL về backend để lưu vào TiDB Cloud, không mô tả lại flow kiểm duyệt bài hát.

- [x] `D31` - Trình tự: Search công khai qua search documents hoặc search index
  Thành phần: Frontend -> Axios -> Search Controller -> Search Service -> Search Documents hoặc Search Index Service -> TiDB Cloud.
  Tệp mã: `CodeBieuDo/TrinhTu/D31_TrinhTu_SearchCongKhaiQuaSearchDocumentsHoacSearchIndex.xml`
  Công cụ: `XML import cho diagrams.net`
  Ghi chú: Đã vẽ theo cùng template UML sequence đã chốt; flow ưu tiên tra `search_documents`, chỉ fallback sang `search_index` khi không có kết quả, không vẽ riêng `save search history`.

- [x] `D32` - Trình tự: Lấy bài hát tương tự
  Thành phần: Frontend -> Axios -> Song Recommendation Controller -> Song Recommendation Service -> Cache -> Embedding/History query -> TiDB Cloud.
  Tệp mã: `CodeBieuDo/TrinhTu/D32_TrinhTu_LayBaiHatTuongTu.xml`
  Công cụ: `XML import cho diagrams.net`
  Ghi chú: Đã vẽ theo cùng template UML sequence đã chốt; flow nhấn mạnh tra cache trước, nếu cache miss thì lấy embedding bài nguồn, lọc bài đã nghe gần đây trong `listening_history`, xếp hạng bằng audio/metadata rồi mới lưu cache.

- [x] `D33` - Trình tự: Lấy admin charts
  Thành phần: Frontend -> Auth Middleware -> RBAC -> Admin Controller -> Admin Service -> Charts Cache -> TiDB Cloud.
  Tệp mã: `CodeBieuDo/TrinhTu/D33_TrinhTu_LayAdminCharts.xml`
  Công cụ: `XML import cho diagrams.net`
  Ghi chú: Đã vẽ theo cùng template UML sequence đã chốt; flow nhấn mạnh xác thực + RBAC ở đầu vào, sau đó `Admin Service` chuẩn hóa timezone/bộ lọc, tra `chartsCache`, nếu cache miss thì mới aggregate dữ liệu từ TiDB Cloud rồi lưu lại cache.

### F. Biểu đồ lớp lĩnh vực

- [x] `D34` - Biểu đồ lớp lĩnh vực tổng
  Lớp chính: User, Artist, ArtistRequest, Album, Song, Genre, Lyrics, Playlist, ListeningHistory, SearchHistory.
  Tệp mã: `CodeBieuDo/LopLinhVuc/D34_BieuDoLopLinhVucTong.xml`
  Công cụ: `XML import cho diagrams.net`
  Ghi chú: Đã dựng lại từ schema DB theo kiểu UML class diagram 3 ngăn `Tên lớp / Thuộc tính / Hàm`, có bội số quan hệ; các bảng phụ và bảng liên kết chi tiết sẽ tách xuống `D35` và `D36`.

Chốt lại cho phần này:

- Không nên tách quá nhiều class diagram; `1` sơ đồ tổng và `2` sơ đồ con là đủ.

- [x] `D35` - Biểu đồ lớp lĩnh vực: Nhóm nội dung âm nhạc và phát hành
  Lớp chính: Artist, Album, Song, Genre, Lyrics, SongGenre, SongEmbedding, SongPlayStat.
  Tệp mã: `CodeBieuDo/LopLinhVuc/D35_BieuDoLopLinhVuc_NhomNoiDungAmNhacVaPhatHanh.xml`
  Ghi chú: Đã vẽ theo schema DB thật; không thêm `SongArtist` vì schema hiện tại không có bảng này.

- [x] `D36` - Biểu đồ lớp lĩnh vực: Nhóm tài khoản, tương tác và kiểm duyệt
  Lớp chính: User, ArtistRequest, Playlist, PlaylistSong, SongLike, AlbumLike, ArtistFollow, ListeningHistory, SearchHistory, EmailVerification, PasswordReset.
  Tệp mã: `CodeBieuDo/LopLinhVuc/D36_BieuDoLopLinhVuc_NhomTaiKhoanTuongTacVaKiemDuyet.xml`
  Ghi chú: Đã vẽ theo schema DB thật; có đặt thêm `Song`, `Album`, `Artist` làm lớp tham chiếu đích để các quan hệ tương tác không bị cụt.

## 6. Danh sách tối thiểu nếu muốn làm gọn

Nếu bạn không muốn vẽ quá nhiều, bộ tối thiểu nên có:

- [ ] `M01` - Biểu đồ khối tổng thể hệ thống thực tế
- [ ] `M02` - Biểu đồ khối nội bộ backend
- [ ] `M03` - Use case tổng quát
- [ ] `M04` - UC phân rã: Xác thực và tài khoản
- [ ] `M05` - UC phân rã: Artist quản lý nội dung
- [ ] `M06` - UC phân rã: Quản trị hệ thống
- [ ] `M07` - Hoạt động: Refresh token ở frontend và backend
- [ ] `M08` - Hoạt động: Artist tạo bài hát và đưa vào hàng chờ kiểm duyệt
- [ ] `M09` - Hoạt động: Người dùng nghe bài hát và cập nhật thống kê
- [ ] `M10` - Trình tự: Đăng nhập bằng Firebase
- [ ] `M11` - Trình tự: Frontend upload media trực tiếp lên Firebase Storage rồi gửi URL về backend
- [ ] `M12` - Trình tự: Lấy bài hát tương tự
- [ ] `M13` - Biểu đồ lớp lĩnh vực tổng

## 7. Mẫu ghi chú sau khi hoàn thành

Bạn có thể thêm thông tin sau mỗi mục sau khi vẽ xong.

Ví dụ:

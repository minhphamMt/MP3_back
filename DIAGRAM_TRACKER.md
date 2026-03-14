# Theo dõi tiến độ vẽ biểu đồ

## 1. Cách dùng file này

File này dùng để theo dõi danh sách các biểu đồ cần vẽ cho hệ thống web nghe nhạc của bạn.

Quy ước:

- `[ ]` = chưa vẽ
- `[x]` = đã vẽ xong

Sau mỗi lần hoàn thành một biểu đồ, chỉ cần đổi `[ ]` thành `[x]` ở đúng mục tương ứng.

## 2. Thứ tự ưu tiên nên vẽ

Nên đi theo thứ tự:

1. Biểu đồ khối tổng thể
2. Use case tổng quát
3. Các use case phân rã
4. Các biểu đồ hoạt động
5. Các biểu đồ trình tự
6. Biểu đồ lớp lĩnh vực

## 3. Danh sách biểu đồ cần vẽ

### A. Biểu đồ khối

- [ ] `D01` - Biểu đồ khối tổng thể hệ thống
  Thể hiện: Frontend, Backend API, MySQL, Firebase Auth, Email Provider, Storage Service.

- [ ] `D02` - Biểu đồ khối nội bộ Backend
  Thể hiện: Routes, Middleware, Controllers, Business Services, Support Services, Cache, Database, External Integrations.

#### Chi tiết triển khai `D01`

Mục tiêu:

- Vẽ được bức tranh tổng quan của toàn hệ thống.
- Làm rõ hệ thống có những thành phần nào và chúng kết nối với nhau ra sao.
- Dùng làm biểu đồ mở đầu trước khi sang use case, activity, sequence.

Lưu ý quan trọng trước khi dùng Miro:

- Miro AI thường mạnh hơn ở kiểu `flowchart hiện đại`, `mindmap`, `sơ đồ brainstorming`.
- Với `biểu đồ khối học thuật` giống hình mẫu trong báo cáo, nếu prompt không ép kiểu trình bày thì Miro thường sinh ra sơ đồ khá "màu mè", nhiều icon và không giống dạng khối kiến trúc chuẩn.
- Vì vậy với `D01`, cần ép Miro theo phong cách: `đơn sắc`, `học thuật`, `khối chữ nhật`, `nhóm lớn chứa thành phần con`, `ít icon`, `đường nối gọn`.

Prompt đề xuất để dán vào Miro nếu muốn ra sơ đồ đẹp, gần với hình mẫu:

```text
Create a monochrome academic-style system block diagram for a music streaming web application.

Important visual style requirements:
- Use a black-and-white or grayscale academic diagram style
- Use large rectangular container blocks with titles at the top-left corner
- Make it look like a thesis/report architecture diagram, not a modern colorful flowchart
- Avoid decorative icons, colorful cards, fancy gradients, or sticky-note style
- Prefer simple component-box style inside each large block
- Keep spacing balanced and symmetrical
- Use thin connector lines and short labels only when necessary

The diagram must contain 3 main grouped blocks:

1. Frontend
   Internal elements:
   - Browser
   - User Interface

2. Backend + Database
   Internal elements:
   - Backend API (Node.js + Express)
   - Routes
   - Middleware
   - Controllers
   - Business Services
   - Support Services
   - Cache
   - MySQL Database
   - Firebase Authentication
   - Storage Service
   - Email Service integration

3. External Services
   Internal elements:
   - Firebase Auth
   - Email Provider
   - Storage Provider

Use grouped containment:
- Frontend contains Browser and User Interface
- Backend + Database contains backend internal modules and database-related components
- External Services contains third-party systems

Inside Backend + Database, show these internal backend modules as simple boxes:
- Routes
- Middleware
- Controllers
- Business Services
- Support Services
- Cache
- MySQL Database
- Firebase Authentication handling
- Storage integration
- Email integration

Show directional arrows with short labels:
- Frontend -> Backend + Database: REST API requests / JSON responses
- Frontend -> External Services: Google/Firebase sign-in
- Backend + Database -> External Services: email sending, token verification, media upload
- Backend API -> MySQL Database: read/write business data
- Storage Provider -> Frontend: public media URLs

Add notes inside or near Backend + Database:
- Authentication: JWT access token + refresh token
- Roles: USER, ARTIST, ADMIN
- Main domains: auth, users, artists, artist requests, albums, songs, playlists, search, charts, recommendations, admin, trash

Layout requirements:
- Put Frontend on the left
- Put Backend + Database in the lower-left or center-left area
- Put External Services on the right
- Use grouped block architecture similar to a formal software architecture figure in a thesis
- The final result should resemble a structured block diagram, not a flowchart
```

Prompt ngắn hơn nếu muốn ép mạnh về phong cách:

```text
Create a black-and-white academic block diagram, similar to a thesis architecture figure.

Use three big rectangular container blocks:
- Frontend
- Backend + Database
- External Services

Inside Frontend:
- Browser
- User Interface

Inside Backend + Database:
- Backend API
- Routes
- Middleware
- Controllers
- Business Services
- Support Services
- Cache
- MySQL Database
- Firebase Authentication handling
- Storage integration
- Email integration

Inside External Services:
- Firebase Auth
- Email Provider
- Storage Provider

Connections:
- Frontend <-> Backend + Database
- Frontend -> Firebase Auth
- Backend + Database -> Firebase Auth
- Backend + Database -> Email Provider
- Backend + Database -> Storage Provider
- Storage Provider -> Frontend

Style:
- monochrome
- academic
- rectangular blocks
- minimal icons
- no colorful flowchart style
```

Checklist kiểm tra sau khi Miro vẽ xong:

- [ ] Có đủ 6 khối chính: Frontend, Backend API, MySQL, Firebase Auth, Email Provider, Storage Service
- [ ] Backend API nằm ở trung tâm sơ đồ
- [ ] Frontend nằm bên trái
- [ ] Database và các hệ thống ngoài nằm bên phải
- [ ] Có mũi tên Frontend -> Backend
- [ ] Có mũi tên Backend -> Frontend
- [ ] Có mũi tên Frontend -> Firebase Auth
- [ ] Có mũi tên Firebase Auth -> Backend
- [ ] Có mũi tên Backend -> MySQL
- [ ] Có mũi tên Backend -> Email Provider
- [ ] Có mũi tên Backend -> Storage Service
- [ ] Có mũi tên Storage Service -> Frontend
- [ ] Bên trong Backend có nhóm Routes
- [ ] Bên trong Backend có nhóm Middleware
- [ ] Bên trong Backend có nhóm Controllers
- [ ] Bên trong Backend có nhóm Business Services
- [ ] Bên trong Backend có nhóm Support Services
- [ ] Bên trong Backend có nhóm Cache
- [ ] Có ghi chú về JWT access token và refresh token
- [ ] Có ghi chú về vai trò USER, ARTIST, ADMIN
- [ ] Có ghi chú về các domain chính của hệ thống
- [ ] Tổng thể sơ đồ dễ đọc, không bị quá rối
- [ ] Có thể dùng trực tiếp trong báo cáo hoặc đồ án

Nếu Miro vẫn vẽ chưa đúng ý:

1. Dùng AI để lấy bố cục tổng thể trước.
2. Xóa các thành phần màu mè hoặc icon không cần thiết.
3. Vẽ lại bằng tay trong Miro theo kiểu khối chữ nhật lớn chứa khối con.
4. Giữ sơ đồ ở tông trắng, xám, đen.
5. Chỉ để 3 nhóm lớn như hình mẫu: `Frontend`, `Backend + Database`, `External Services`.

Gợi ý ghi nhận sau khi hoàn thành `D01`:

- Đổi trạng thái `D01` từ `[ ]` thành `[x]`
- Thêm dòng ghi chú ngay dưới `D01` nếu cần:
  File: `...`
  Công cụ: `Miro`
  Ghi chú: `Đã chốt phiên bản 1`

### B. Use case tổng quát

- [ ] `D03` - Use case tổng quát của hệ thống
  Actor chính: Guest, User, Artist, Admin.

### C. Use case phân rã chức năng

- [ ] `D04` - UC phân rã: Xác thực và tài khoản
  Gồm: đăng ký, xác minh email, đăng nhập, Firebase login, refresh token, logout, quên mật khẩu, đặt lại mật khẩu, cập nhật profile, đổi mật khẩu, upload avatar.

- [ ] `D05` - UC phân rã: Người dùng nghe nhạc và tương tác
  Gồm: nghe nhạc, like song, like album, follow artist, xem lịch sử nghe, quản lý playlist.

- [ ] `D06` - UC phân rã: Artist quản lý nội dung
  Gồm: quản lý hồ sơ artist, tạo/sửa/xóa/khôi phục album, tạo/sửa/xóa/khôi phục bài hát, upload audio.

- [ ] `D07` - UC phân rã: Yêu cầu trở thành artist và kiểm duyệt
  Gồm: gửi request artist, cập nhật request, admin review, approve, reject.

- [ ] `D08` - UC phân rã: Khám phá nội dung và cá nhân hóa
  Gồm: search, lưu lịch sử search, charts, top 100, top 5, region charts, top 50 genre, recommendation, similar songs.

- [ ] `D09` - UC phân rã: Quản trị hệ thống
  Gồm: quản lý user, đổi role, khóa/mở khóa, quản lý genre, kiểm duyệt bài hát, trash, admin reports.

### D. Biểu đồ hoạt động

- [ ] `D10` - Hoạt động: Đăng ký và xác minh email
  Luồng chính: tạo mã xác minh, gửi email, nhập mã, tạo user thật sau khi verify.

- [ ] `D11` - Hoạt động: Quên mật khẩu và đặt lại mật khẩu
  Luồng chính: gửi mã reset, kiểm tra hạn, đổi mật khẩu.

- [ ] `D12` - Hoạt động: Gửi và cập nhật yêu cầu artist
  Luồng chính: tạo request, sửa request, reset trạng thái về pending khi cần.

- [ ] `D13` - Hoạt động: Admin approve/reject artist request
  Luồng chính: review request, tạo hoặc khôi phục artist, đổi role user thành artist.

- [ ] `D14` - Hoạt động: Artist tạo bài hát
  Luồng chính: kiểm tra artist profile, gán artist, ép status pending, validate album.

- [ ] `D15` - Hoạt động: Upload audio bài hát
  Luồng chính: upload file lên storage, cập nhật audio path vào bài hát.

- [ ] `D16` - Hoạt động: Admin kiểm duyệt bài hát
  Luồng chính: review, approve, reject, cập nhật release date nếu cần.

- [ ] `D17` - Hoạt động: Người dùng nghe bài hát
  Luồng chính: kiểm tra bài hát public, `duration >= 30s`, chống spam 5 phút, tăng play count, cập nhật day/week stats, ghi history.

- [ ] `D18` - Hoạt động: Quản lý playlist
  Luồng chính: tạo playlist, thêm bài hát, xóa bài hát, đổi vị trí bài hát.

- [ ] `D19` - Hoạt động: Search và lưu lịch sử tìm kiếm
  Luồng chính: normalize keyword, tìm kiếm, lưu history, cắt dữ liệu cũ.

- [ ] `D20` - Hoạt động: Khôi phục dữ liệu từ trash
  Luồng chính: kiểm tra role, kiểm tra quyền khôi phục, restore song/album/artist/genre.

### E. Biểu đồ trình tự

- [ ] `D21` - Trình tự: Đăng ký và verify email
  Thành phần: Client -> Auth Route -> Validate -> Controller -> Auth Service -> Email Service -> MySQL.

- [ ] `D22` - Trình tự: Đăng nhập bằng Firebase
  Thành phần: Client -> Auth Controller -> Auth Service -> Firebase Admin -> MySQL.

- [ ] `D23` - Trình tự: Refresh token / Logout
  Thành phần: Client -> Auth Controller -> Auth Service -> token verification / revoke flow.

- [ ] `D24` - Trình tự: User gửi artist request
  Thành phần: Client -> Auth Middleware -> Artist Request Controller -> Artist Request Service -> MySQL.

- [ ] `D25` - Trình tự: Admin approve artist request
  Thành phần: Client -> Auth Middleware -> RBAC -> Admin Controller -> Artist Request Service -> Artist Service -> User Service -> MySQL.

- [ ] `D26` - Trình tự: Artist tạo bài hát
  Thành phần: Client -> Song Route -> Auth Middleware -> RBAC -> Song Controller -> Song Service -> MySQL.

- [ ] `D27` - Trình tự: Artist upload audio bài hát
  Thành phần: Client -> Upload Middleware -> Song Controller -> Storage Service -> Song Service -> Storage -> MySQL.

- [ ] `D28` - Trình tự: Admin review bài hát
  Thành phần: Client -> Admin Controller -> Song Service -> MySQL.

- [ ] `D29` - Trình tự: Người dùng nghe bài hát
  Thành phần: Client -> Song Controller -> Song Service -> History Service -> MySQL.

- [ ] `D30` - Trình tự: Quản lý playlist
  Thành phần: Client -> Playlist Controller -> Playlist Service -> MySQL transaction.

- [ ] `D31` - Trình tự: Search và lưu search history
  Thành phần: Client -> Search Controller -> Search Service -> Search Index Service -> MySQL.

- [ ] `D32` - Trình tự: Lấy bài hát tương tự
  Thành phần: Client -> Song Recommendation Controller -> Song Recommendation Service -> Cache -> MySQL.

- [ ] `D33` - Trình tự: Lấy admin charts
  Thành phần: Client -> Admin Controller -> Admin Service -> Cache -> MySQL.

### F. Biểu đồ lớp lĩnh vực

- [ ] `D34` - Biểu đồ lớp lĩnh vực tổng
  Lớp chính: User, Artist, ArtistRequest, Album, Song, Genre, Lyrics, Playlist, PlaylistSong, SongLike, AlbumLike, ArtistFollow, ListeningHistory, SearchHistory, SongPlayStat, SongEmbedding, EmailVerification, PasswordReset.

- [ ] `D35` - Biểu đồ lớp lĩnh vực: Nhóm nội dung âm nhạc
  Lớp chính: Artist, Album, Song, Genre, Lyrics, SongArtist, SongGenre.

- [ ] `D36` - Biểu đồ lớp lĩnh vực: Nhóm tương tác người dùng
  Lớp chính: User, Playlist, PlaylistSong, SongLike, AlbumLike, ArtistFollow, ListeningHistory, SearchHistory.

- [ ] `D37` - Biểu đồ lớp lĩnh vực: Nhóm kiểm duyệt và hỗ trợ hệ thống
  Lớp chính: ArtistRequest, EmailVerification, PasswordReset, SongPlayStat, SongEmbedding.

## 4. Danh sách tối thiểu nếu muốn làm gọn

Nếu bạn không muốn vẽ quá nhiều, bộ tối thiểu nên có:

- [ ] `M01` - Biểu đồ khối tổng thể hệ thống
- [ ] `M02` - Use case tổng quát
- [ ] `M03` - UC phân rã: Xác thực và tài khoản
- [ ] `M04` - UC phân rã: Artist quản lý nội dung
- [ ] `M05` - UC phân rã: Quản trị hệ thống
- [ ] `M06` - Hoạt động: Đăng ký và xác minh email
- [ ] `M07` - Hoạt động: Admin approve artist request
- [ ] `M08` - Hoạt động: Người dùng nghe bài hát
- [ ] `M09` - Trình tự: Admin approve artist request
- [ ] `M10` - Trình tự: Người dùng nghe bài hát
- [ ] `M11` - Biểu đồ lớp lĩnh vực tổng

## 5. Mẫu ghi chú sau khi hoàn thành

Bạn có thể thêm thông tin sau mỗi mục sau khi vẽ xong.

Ví dụ:

- [x] `D01` - Biểu đồ khối tổng thể hệ thống
  File: `images/diagram-01.png`
  Công cụ: `Miro`
  Ghi chú: Đã chốt phiên bản 1

## 6. Trạng thái tổng quan hiện tại

- Tổng số biểu đồ trong danh sách: `37`
- Số biểu đồ đã hoàn thành: `0`
- Số biểu đồ chưa hoàn thành: `37`

Cập nhật các số liệu trên sau mỗi đợt vẽ biểu đồ.

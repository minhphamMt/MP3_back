# Phân tích chức năng backend để vẽ biểu đồ

## 1. Mục tiêu tài liệu

Tài liệu này trả lời câu hỏi: với backend hiện tại, bạn nên vẽ các loại biểu đồ nào cho các chức năng nào, thay vì cố vẽ riêng cho từng API nhỏ lẻ.

Phân tích được suy ra từ các nhóm file chính:

- `src/app.js`
- `src/routes/*.js`
- `src/controllers/*.js`
- `src/services/*.js`
- `src/config/*.js`

Backend này có cấu trúc rõ theo tầng:

- `Route` nhận URL và gắn middleware.
- `Middleware` xử lý auth, RBAC, validate, upload.
- `Controller` nhận request/response.
- `Service` xử lý nghiệp vụ và truy cập MySQL.
- Ngoài MySQL còn có tích hợp `Firebase Admin`, `Email service`, `Storage service` và cache in-memory cho chart/recommendation.

## 2. Các nhóm chức năng nghiệp vụ thực sự có trong backend

Thay vì nhìn theo từng endpoint, nên gom backend thành 7 nhóm chức năng lớn:

| Nhóm chức năng | Nội dung chính |
| --- | --- |
| 1. Xác thực và tài khoản | Đăng ký, xác minh email, đăng nhập, Firebase login, refresh token, logout, quên mật khẩu, đặt lại mật khẩu |
| 2. Hồ sơ người dùng | Xem/cập nhật profile, đổi mật khẩu, upload avatar, xem liked songs/albums, xem followed artists |
| 3. Quản lý artist | Tạo artist profile, cập nhật artist, upload avatar artist, theo dõi artist, lấy bộ sưu tập artist |
| 4. Yêu cầu trở thành artist | User gửi request, cập nhật request, admin review/approve/reject, đổi role user thành artist |
| 5. Quản lý nội dung âm nhạc | CRUD album, CRUD song, upload audio, gán artist phụ, gán genre, lyrics, like album/song, soft delete/restore |
| 6. Tương tác nghe nhạc và cá nhân hóa | Phát nhạc, tăng play count, ghi listening history, playlist CRUD, add/remove/reorder song, search, search history, recommendations, charts |
| 7. Quản trị và vận hành | Quản lý user, genre, kiểm duyệt bài hát, kiểm duyệt artist request, trash, admin search, báo cáo và dashboard charts |

## 3. Các actor chính để dùng cho biểu đồ

Các actor nên xuất hiện trong bộ biểu đồ của bạn:

- `Khách` hoặc `Guest`
- `User`
- `Artist`
- `Admin`
- `Firebase Auth`
- `Email Service`
- `Storage Service` (`local` / `GCS` / `S3`)
- `MySQL`

Lưu ý:

- `Guest`, `User`, `Artist`, `Admin` là actor nghiệp vụ.
- `Firebase Auth`, `Email Service`, `Storage Service` là actor/hệ thống ngoài, phù hợp trong sequence hoặc block diagram.
- `MySQL` không phải actor use case, nhưng nên có ở sequence và block diagram.

## 4. Bạn cần vẽ biểu đồ nào cho chức năng nào

### 4.1. Ca tổng quát

Ở đây nên hiểu là `Use Case tổng quát` của toàn hệ thống.

Bạn chỉ cần vẽ `1 biểu đồ tổng quát`, không nên tách quá nhiều.

Biểu đồ này nên bao phủ các chức năng mức cao sau:

- `Guest`: xem bài hát, xem album, xem artist, xem chart, xem top 100, xem top theo khu vực, nhận gợi ý cold-start, tìm kiếm công khai
- `User`: đăng ký, xác minh email, đăng nhập, đăng nhập Google/Firebase, refresh token, logout, quên mật khẩu, cập nhật hồ sơ, đổi mật khẩu, upload avatar
- `User`: thích bài hát, thích album, theo dõi artist, nghe nhạc, xem lịch sử nghe, quản lý playlist, lưu lịch sử tìm kiếm
- `User`: gửi yêu cầu trở thành artist
- `Artist`: quản lý hồ sơ artist, upload avatar artist, tạo/cập nhật/xóa/khôi phục album, tạo/cập nhật/xóa/khôi phục bài hát, upload audio
- `Admin`: quản lý user, đổi role, khóa/mở tài khoản, quản lý genre, kiểm duyệt bài hát, kiểm duyệt artist request, xem trash, tìm kiếm admin, xem báo cáo tổng quan và biểu đồ


Kết luận cho phần này:
- `Ca tổng quát` nên vẽ cho toàn bộ hệ thống.
- Không cần vẽ use case tổng quát riêng cho từng module nhỏ.

### 4.2. UC phân rã chức năng

Phần này nên tách thành nhiều use case diagram con. Với backend hiện tại, nên phân rã thành `5 đến 6 biểu đồ`.

#### UC 1. Xác thực và tài khoản

Actor:

- `Guest`
- `User`
- `Firebase Auth`
- `Email Service`

Use case nên đưa vào:

- Đăng ký tài khoản
- Xác minh email
- Gửi lại mã xác minh
- Đăng nhập
- Đăng nhập artist
- Đăng nhập bằng Firebase
- Refresh token
- Logout
- Quên mật khẩu
- Đặt lại mật khẩu
- Xem hồ sơ cá nhân
- Cập nhật hồ sơ
- Đổi mật khẩu
- Upload avatar

#### UC 2. Người dùng nghe nhạc và tương tác

Actor:

- `User`

Use case nên đưa vào:

- Xem danh sách bài hát
- Xem chi tiết bài hát
- Nghe bài hát
- Thích / bỏ thích bài hát
- Thích / bỏ thích album
- Theo dõi / bỏ theo dõi artist
- Xem lịch sử nghe
- Tạo playlist
- Cập nhật playlist
- Xóa playlist
- Thêm bài hát vào playlist
- Xóa bài hát khỏi playlist
- Sắp xếp lại playlist

#### UC 3. Artist quản lý nội dung

Actor:

- `Artist`

Use case nên đưa vào:

- Xem hồ sơ artist của tôi
- Cập nhật hồ sơ artist
- Upload avatar artist
- Tạo album
- Cập nhật album
- Xóa mềm / khôi phục album
- Tạo bài hát
- Cập nhật bài hát
- Upload audio bài hát
- Xóa mềm / khôi phục bài hát
- Xem danh sách bài hát theo artist

#### UC 4. Yêu cầu trở thành artist và kiểm duyệt

Actor:

- `User`
- `Admin`

Use case nên đưa vào:

- Gửi yêu cầu trở thành artist
- Cập nhật yêu cầu của tôi
- Xem yêu cầu của tôi
- Xem danh sách yêu cầu artist
- Review yêu cầu artist
- Approve yêu cầu artist
- Reject yêu cầu artist
- Nâng quyền user thành artist

#### UC 5. Khám phá nội dung và cá nhân hóa

Actor:

- `Guest`
- `User`

Use case nên đưa vào:

- Tìm kiếm bài hát / album / artist
- Lưu lịch sử tìm kiếm
- Xem lịch sử tìm kiếm
- Xem Zing chart
- Xem New Release
- Xem Top 100
- Xem Top 5 theo ngày / tuần
- Xem chart theo khu vực
- Xem Top 50 theo genre
- Nhận gợi ý cold-start
- Nhận bài hát tương tự

#### UC 6. Quản trị hệ thống

Actor:

- `Admin`

Use case nên đưa vào:

- Xem tổng quan hệ thống
- Xem admin charts
- Tìm kiếm trong admin
- Quản lý user
- Đổi role user
- Khóa / mở khóa user
- Quản lý genre
- Kiểm duyệt bài hát
- Cập nhật bài hát từ admin
- Xem trash
- Khôi phục artist / album / song / genre
- Xóa cứng thực thể đã xóa mềm

Kết luận cho phần UC phân rã:

- Nếu cần bộ gọn: vẽ 5 UC con đầu tiên.
- Nếu cần bộ đầy đủ: thêm UC quản trị hệ thống.

### 4.3. Biểu đồ hoạt động

Biểu đồ hoạt động nên dùng cho các luồng có nhiều bước rẽ nhánh, điều kiện, trạng thái hoặc transaction. Không nên dùng cho các API CRUD đơn giản như `get by id` hoặc `list`.

Những chức năng nên vẽ activity diagram:

| Chức năng | Có nên vẽ | Lý do |
| --- | --- | --- |
| Đăng ký và xác minh email | Rất nên | Có bước tạo mã, gửi email, xác minh mã, tạo user thật sau khi verify |
| Quên mật khẩu và đặt lại mật khẩu | Rất nên | Có vòng đời mã reset, kiểm tra hết hạn, cập nhật password |
| Đăng nhập, refresh token, logout | Nên | Có kiểm tra user active, revoke refresh token |
| Gửi và cập nhật yêu cầu artist | Rất nên | Có trạng thái `pending`, `approved`, `rejected` |
| Admin approve/reject artist request | Rất nên | Có tạo hoặc khôi phục artist, đổi role user sang artist |
| Artist tạo bài hát | Rất nên | Có kiểm tra artist profile, ép status sang `pending`, kiểm tra album thuộc artist |
| Upload audio cho bài hát | Nên | Có upload file sang storage rồi cập nhật media URL vào bài hát |
| Admin review/approve/reject bài hát | Rất nên | Có cập nhật `status`, `reviewed_by`, `reject_reason`, `release_date` |
| Nghe bài hát | Rất nên | Có kiểm tra bài hát public, điều kiện `duration >= 30s`, chống spam 5 phút, tăng play count, cập nhật day/week stats, lưu history |
| Quản lý playlist | Rất nên | Có kiểm tra owner, kiểm tra trùng bài hát, dịch vị trí khi add/remove/reorder |
| Search và lưu lịch sử search | Nên | Có normalize keyword, upsert search history, cắt còn 20 bản ghi |
| Khôi phục từ trash | Nên | Có kiểm tra role người khôi phục và quyền sở hữu artist |

Nếu phải chọn activity diagram quan trọng nhất, nên ưu tiên:

1. Đăng ký và xác minh email
2. Approve artist request
3. Artist tạo bài hát và upload audio
4. Admin kiểm duyệt bài hát
5. Nghe bài hát và cập nhật thống kê
6. Quản lý playlist

### 4.4. Biểu đồ trình tự

Biểu đồ trình tự nên thể hiện sự phối hợp giữa `Client -> Route/Middleware -> Controller -> Service -> DB/External System`.

Các chức năng nên vẽ sequence diagram:

| Chức năng | Thành phần chính nên xuất hiện |
| --- | --- |
| Đăng ký và verify email | Client, `auth.routes`, `validate.middleware`, `auth.controller`, `auth.service`, `email.service`, MySQL |
| Đăng nhập bằng Firebase | Client, `auth.controller`, `auth.service`, `Firebase Admin`, MySQL |
| Refresh token | Client, `auth.controller`, `auth.service`, MySQL, token revoke store |
| User gửi artist request | Client, `artist-request.routes`, `auth.middleware`, `artist-request.controller`, `artist-request.service`, MySQL |
| Admin approve artist request | Client, `admin.routes`, `auth.middleware`, `rbac.middleware`, `admin.controller`, `artist-request.service`, `artist.service`, `user.service`, MySQL |
| Artist tạo bài hát | Client, `song.routes`, `auth.middleware`, `rbac.middleware`, `song.controller`, `song.service`, MySQL |
| Artist upload audio bài hát | Client, `upload.middleware`, `song.controller`, `storage.service`, `song.service`, Storage, MySQL |
| Admin review bài hát | Client, `admin.controller`, `song.service`, MySQL |
| User nghe bài hát | Client, `song.controller`, `song.service`, `history.service`, MySQL |
| User thao tác playlist | Client, `playlist.controller`, `playlist.service`, MySQL transaction |
| Tìm kiếm và lưu search history | Client, `search.controller`, `search.service`, `search-index.service`, MySQL |
| Lấy bài hát tương tự | Client, `song-recommendation.controller`, `song-recommendation.service`, MySQL, cache |
| Lấy admin charts | Client, `admin.controller`, `admin.service`, MySQL, cache |

Nếu cần bộ sequence gọn, nên chọn 6 biểu đồ:

1. Đăng ký và verify email
2. Đăng nhập bằng Firebase
3. Admin approve artist request
4. Artist upload bài hát
5. User nghe bài hát
6. Lấy gợi ý bài hát tương tự hoặc admin charts

### 4.5. Biểu đồ lớp lĩnh vực

Biểu đồ lớp lĩnh vực không nên bám theo file `model` vì dự án này gần như không dùng ORM model thực. Thay vào đó, nên bám theo thực thể nghiệp vụ và các bảng đang được thao tác trong service SQL.

Các lớp miền cốt lõi nên có:

- `User`
- `Artist`
- `ArtistRequest`
- `Album`
- `Song`
- `Genre`
- `Lyrics`
- `Playlist`
- `PlaylistSong`
- `SongLike`
- `AlbumLike`
- `ArtistFollow`
- `ListeningHistory`
- `SearchHistory`
- `SongPlayStat`
- `SongEmbedding`
- `EmailVerification`
- `PasswordReset`

Các quan hệ nên thể hiện:

- `User 1 - 0..1 Artist`
- `User 1 - 0..* ArtistRequest`
- `Artist 1 - 0..* Album`
- `Artist 1 - 0..* Song`
- `Song 0..* - 0..* Artist` thông qua `SongArtist`
- `Song 0..* - 0..* Genre` thông qua `SongGenre`
- `Album 1 - 0..* Song`
- `Song 1 - 0..* Lyrics`
- `User 1 - 0..* Playlist`
- `Playlist 1 - 0..* PlaylistSong`
- `Song 1 - 0..* PlaylistSong`
- `User 1 - 0..* ListeningHistory`
- `Song 1 - 0..* ListeningHistory`
- `User 1 - 0..* SearchHistory`
- `User 0..* - 0..* Song` thông qua `SongLike`
- `User 0..* - 0..* Album` thông qua `AlbumLike`
- `User 0..* - 0..* Artist` thông qua `ArtistFollow`
- `Song 1 - 0..* SongPlayStat`
- `Song 1 - 0..* SongEmbedding`

Các thuộc tính nghiệp vụ quan trọng nên thể hiện trong class diagram:

- `User.role`, `User.is_active`
- `Artist.user_id`, `Artist.is_deleted`
- `ArtistRequest.status`, `ArtistRequest.reviewed_by`, `ArtistRequest.reject_reason`
- `Song.status`, `Song.release_date`, `Song.play_count`, `Song.is_deleted`
- `Album.release_date`, `Album.is_deleted`
- `PlaylistSong.position`
- `ListeningHistory.duration`, `ListeningHistory.listened_at`
- `SongPlayStat.period_type`, `SongPlayStat.period_start`, `SongPlayStat.play_count`

Khuyến nghị:

- Nếu chỉ cần 1 biểu đồ lớp lĩnh vực thì vẽ 1 sơ đồ tổng.
- Nếu sơ đồ quá dày, tách thành 3 sơ đồ con:
- `Nội dung âm nhạc`: Artist, Album, Song, Genre, Lyrics, SongArtist, SongGenre
- `Tương tác người dùng`: User, Playlist, PlaylistSong, SongLike, AlbumLike, ArtistFollow, ListeningHistory, SearchHistory
- `Kiểm duyệt và hỗ trợ hệ thống`: ArtistRequest, EmailVerification, PasswordReset, SongPlayStat, SongEmbedding

### 4.6. Biểu đồ khối

Biểu đồ khối nên vẽ theo kiến trúc, không nên theo endpoint.

Bạn nên vẽ `1 biểu đồ khối tổng thể`, và nếu cần trình bày sâu hơn thì thêm `1 biểu đồ khối nội bộ backend`.

#### Biểu đồ khối tổng thể

Các khối nên có:

- `Frontend Web/App`
- `Backend API (Express)`
- `MySQL Database`
- `Firebase Auth`
- `Email Provider`
- `Storage Service`

Luồng chính:

- Frontend gọi REST API tới Backend
- Backend xác minh `JWT` hoặc `Firebase ID token`
- Backend đọc/ghi dữ liệu vào MySQL
- Backend gửi email qua Email Provider
- Backend upload media sang Storage
- Backend trả URL public media cho frontend

#### Biểu đồ khối nội bộ backend

Các khối nên có:

- `API Layer`
- `Middleware Layer`
- `Controller Layer`
- `Business Service Layer`
- `Support Service Layer`
- `Cache Layer`
- `Persistence Layer`
- `External Integration Layer`

Chi tiết nên thể hiện:

- `API Layer`: auth, user, artist, album, song, playlist, search, admin, chart, history, recommendation, trash
- `Middleware Layer`: auth, RBAC, validate, upload, error, request logger
- `Business Service Layer`: auth, user, artist, artist-request, album, song, playlist, history
- `Support Service Layer`: search-index, recommendation, song-recommendation, chart, storage, email
- `Cache Layer`: chart cache, cold-start recommendation cache, similar songs cache, search index cache
- `Persistence Layer`: MySQL
- `External Integration Layer`: Firebase Admin, GCS/S3/local storage, SMTP/Brevo

Kết luận cho phần block diagram:

- Nếu làm báo cáo kỹ thuật hoặc đồ án, đây là biểu đồ nên vẽ đầu tiên.
- Nó giúp người đọc hiểu toàn hệ thống trước khi đi vào use case và sequence.

## 5. Những chức năng không cần vẽ riêng thành activity hoặc sequence

Không nên tách riêng thành biểu đồ độc lập cho các chức năng quá đơn giản sau:

- `get list`
- `get by id`
- `like song` và `unlike song` nếu đã có use case tương tác người dùng
- `like album` và `unlike album` nếu đã có use case tương tác người dùng
- `follow` và `unfollow artist` nếu đã có use case tương tác người dùng
- Upload avatar user/artist nếu đã nằm trong use case quản lý hồ sơ
- Hard delete từng thực thể nếu đã có use case `Trash / soft delete / restore`

Các chức năng này vẫn nên xuất hiện trong use case diagram, nhưng không nhất thiết cần activity/sequence riêng.

## 6. Bộ biểu đồ nên làm nếu bạn muốn gọn nhưng đủ

Nếu bạn cần bộ biểu đồ vừa đủ để làm báo cáo hoặc đồ án, mình khuyên nên làm:

- `1` use case tổng quát
- `5` use case phân rã
- `6` activity diagram
- `6` sequence diagram
- `1` domain class diagram tổng
- `1` block diagram tổng thể

Danh sách nên ưu tiên nhất:

1. Block diagram tổng thể hệ thống
2. Use case tổng quát
3. UC xác thực và tài khoản
4. UC artist quản lý nội dung
5. UC quản trị và kiểm duyệt
6. Activity đăng ký và xác minh email
7. Activity approve artist request
8. Activity artist tạo bài hát
9. Activity nghe bài hát
10. Activity quản lý playlist
11. Sequence verify email
12. Sequence Firebase login
13. Sequence approve artist request
14. Sequence upload audio bài hát
15. Sequence record play
16. Domain class diagram

## 7. Kết luận ngắn

Với backend hiện tại, bạn không nên vẽ theo từng API riêng lẻ. Cách đúng là gom thành các cụm nghiệp vụ lớn:

- `Xác thực và tài khoản`
- `Người dùng nghe nhạc và tương tác`
- `Artist quản lý nội dung`
- `Yêu cầu trở thành artist`
- `Khám phá nội dung và cá nhân hóa`
- `Quản trị và báo cáo`

Trong đó, các luồng đáng vẽ nhất là:

- Đăng ký và xác minh email
- Approve artist request
- Artist tạo bài hát và upload audio
- Admin kiểm duyệt bài hát
- User nghe bài hát và cập nhật thống kê
- User quản lý playlist

Đây là các luồng có đủ `actor`, `trạng thái`, `rẽ nhánh`, `quyền truy cập`, `tích hợp ngoài hệ thống` và `transaction`, nên rất phù hợp để thể hiện bằng UML/biểu đồ khối.

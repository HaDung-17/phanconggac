# Cắt gác hàng ngày – V2

## 1. Cấu trúc
- `index.html`: giao diện và thuật toán cắt gác.
- `api/data.js`: lưu Danh sách Tổng + trạng thái vào MongoDB.
- `api/history.js`: lưu lịch sử cắt gác theo từng ngày và đọc 5 ngày gần nhất.
- `api/_mongo.js`: kết nối MongoDB Atlas dùng biến môi trường.
- `package.json`: thư viện MongoDB Node.js Driver.

## 2. Biến môi trường trên Vercel
Tạo:
- `MONGODB_URI` = connection string MongoDB Atlas.
- `MONGODB_DB` = `cat_gac` (hoặc tên database anh muốn).
- `APP_LOGIN_USER` = tên đăng nhập của ứng dụng (ví dụ `Dung_17`).
- `APP_LOGIN_PASSWORD` = mật khẩu đăng nhập ứng dụng.
- `AUTH_SECRET` = một chuỗi bí mật dài, ngẫu nhiên, dùng để ký phiên đăng nhập (ví dụ tối thiểu 32 ký tự).

**Quan trọng:** Không đưa `MONGODB_URI`, `APP_LOGIN_PASSWORD` hoặc `AUTH_SECRET` vào GitHub hay viết trực tiếp trong HTML.

### Bảo vệ nút XÓA lịch sử
- Đăng nhập trên giao diện sẽ gọi `/api/auth` để tạo phiên đăng nhập bằng cookie `HttpOnly`.
- API `DELETE /api/history?date=YYYY-MM-DD` kiểm tra cookie phiên ở phía máy chủ trước khi xóa MongoDB.
- Vì vậy, chỉ nhìn thấy nút XÓA trên giao diện là chưa đủ; request DELETE không có phiên hợp lệ sẽ nhận HTTP 401.
- Phiên đăng nhập có thời hạn 8 giờ.
- Khi đăng xuất, cookie phiên được xóa.

**Lưu ý:** Bộ code mới đã bỏ tên/mật khẩu cứng khỏi `index.html`. Anh cần khai báo 3 biến `APP_LOGIN_USER`, `APP_LOGIN_PASSWORD`, `AUTH_SECRET` trong Vercel → Project → Settings → Environment Variables.

## 3. Deploy
Push toàn bộ thư mục này lên GitHub, import repository vào Vercel, cài dependency rồi Redeploy sau khi thêm Environment Variables.

## 4. Quy tắc Nghỉ tranh thủ V2
- Thứ 6: chỉ được phân Ca 1–3; tuyệt đối không Ca 4–7.
- Thứ 7: không phân bất kỳ ca nào.
- Chủ nhật: tuyệt đối không Ca 1–4; Ca 5–7 ưu tiên nhóm Nghỉ tranh thủ trước.


## Gắn logo để “Thêm vào màn hình chính”

V2 đã có hỗ trợ PWA. Anh chỉ cần sửa **một dòng** ở đầu file `index.html`:

```js
const LOGO_URL = "https://YOUR-DOMAIN.COM/logo.png";
```

Thay `https://YOUR-DOMAIN.COM/logo.png` bằng **link ảnh logo trực tiếp** của anh.

### Khuyến nghị
- Ảnh PNG hoặc JPG.
- Ảnh vuông, tốt nhất **512x512 px** hoặc lớn hơn.
- Link phải mở trực tiếp ra file ảnh, ví dụ `https://tenmien.vn/logo.png`.
- Nên dùng link HTTPS.
- Không dùng link trang Google Drive/Facebook chứa trang xem ảnh; phải là URL trả về trực tiếp hình ảnh.

### Sau khi đổi logo
1. Lưu `index.html`.
2. Commit/push toàn bộ thư mục lên GitHub.
3. Chờ Vercel deploy xong.
4. Mở **đường link Vercel** trên điện thoại.
5. Chọn **Chia sẻ → Thêm vào Màn hình chính** (iPhone) hoặc **Thêm vào màn hình chính / Cài đặt ứng dụng** (Android, tùy trình duyệt).
6. Icon sử dụng ảnh ở `LOGO_URL`.

### Nếu muốn thay logo sau này
Chỉ cần đổi `LOGO_URL`, push GitHub và chờ Vercel deploy lại. Nếu điện thoại vẫn hiện logo cũ, hãy xóa shortcut/app cũ rồi thêm lại để trình duyệt lấy manifest/icon mới.

### Lưu ý về PWA
PWA cần chạy qua HTTPS. Domain Vercel đáp ứng điều kiện HTTPS. File `manifest.json` và `sw.js` đã được thêm sẵn trong bộ V2.

## 5. Tài khoản nhiều người dùng + quản trị
- Tài khoản quản trị là `APP_LOGIN_USER` + `APP_LOGIN_PASSWORD` trong Vercel.
- Người dùng khác có thể bấm **TẠO TÀI KHOẢN** ngay trên app.
- Mật khẩu tài khoản người dùng được băm bằng `scrypt` và không lưu dạng rõ trong MongoDB.
- Mọi API dữ liệu/cắt gác đều yêu cầu đăng nhập.
- Chỉ role `admin` mới được xóa lịch sử và xem **QUẢN LÝ TÀI KHOẢN**.
- Admin xem được: tên tài khoản, quyền, ngày tạo, lần đăng nhập gần nhất, số lần đăng nhập, IP gần nhất và vị trí địa lý suy ra từ IP.
- Vị trí từ IP chỉ là vị trí địa lý ước lượng theo nhà cung cấp IP, không phải GPS hay địa chỉ nhà chính xác.
- IP/vị trí được cập nhật mỗi lần đăng nhập và lưu trong collection `users` của MongoDB.

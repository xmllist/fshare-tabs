[English](README.md) · **Tiếng Việt**

# Fshare Tabs

Ứng dụng máy tính (macOS + Windows) gồm ba tab nối liền một mạch:

```
Tab 1  Google Sheet         bấm vào một link thư mục Fshare
   ↓                        link được bắt lại và mở ở
Tab 2  fshare.annnekkk.com  duyệt thư mục, chọn một file
   ↓                        link file được chuyển sang
Tab 3  fshare.vn            tự đăng nhập bằng tài khoản đã lưu,
   ↓                        bạn bấm Tải, ứng dụng chặn lại và
VLC                         phát thẳng bằng VLC, không tải về máy
```

Không có file nào được lưu xuống ổ cứng: lượt tải bị chặn lại, lấy đúng đường dẫn thật
rồi đưa cho VLC phát trực tiếp (đồng thời chép vào clipboard để dự phòng).

## Tải về

Bản dựng sẵn nằm ở [trang releases](https://github.com/xmllist/fshare-tabs/releases/latest):
macOS (Apple Silicon và Intel, cần macOS 13 trở lên) và Windows (bộ cài x64, bản chạy thẳng
x64, bộ cài ARM). Cần cài sẵn [VLC](https://www.videolan.org/vlc/).

Cả hai nền tảng đều chưa ký số — xem mục [Khắc phục lỗi "app is damaged"](#khắc-phục-lỗi-app-is-damaged-trên-máy-mac-khác)
cho macOS, còn trên Windows hãy chọn **More info → Run anyway** khi SmartScreen cảnh báo.

## Giao diện

![Bấm một link trong sheet là thư mục mở ở tab 2, chọn file thì nạp sang tab 3](docs/demo.gif)

Bấm link Fshare trong sheet → thư mục mở ở tab duyệt → chọn file thì nó nạp sang Fshare,
lúc này đã đăng nhập sẵn. Bấm **Tải nhanh** là đường dẫn thật được đưa cho VLC.

### Tab 1 — Google Sheet

![Sheet với một link thư mục Fshare đang được chọn](docs/screenshot-1-sheet.png)

Sheet hiển thị y như trên trình duyệt. Mọi link `fshare.vn` khi bấm vào đều bị bắt lại
thay vì mở cửa sổ mới.

### Tab 2 — trình duyệt thư mục

![Thư mục đang mở trong trình duyệt Fshare, link đã được dán sẵn](docs/screenshot-2-explorer.png)

Mã thư mục được mở thẳng, đồng thời link gốc cũng được điền vào ô tìm kiếm của trang.
Bấm vào tên file — hoặc nút **Copy link** của dòng đó — là link được chuyển sang tab 3.

### Tab 3 — Fshare, đã đăng nhập sẵn

![Trang file trên Fshare với nút tải](docs/screenshot-3-fshare.png)

Tab này tự đăng nhập bằng tài khoản đã lưu nên nút tải sẵn sàng ngay. Bấm vào đó không
ghi file nào xuống máy: đường dẫn được bắt lại và phát thẳng bằng VLC.
*(Email tài khoản trong ảnh đã được thay bằng nội dung mẫu.)*

### Cài đặt

![Hộp thoại cài đặt với hai ô thông tin tài khoản](docs/screenshot-4-settings.png)

Hai ô cho tài khoản Fshare, kèm địa chỉ Google Sheet, đường dẫn VLC và các công tắc tự động.

## Chạy từ mã nguồn

```bash
npm install
npm start
```

## Đóng gói bản cài đặt

```bash
npm run dist:mac     # .dmg + .zip cho cả Apple Silicon lẫn Intel (chạy trên macOS)
npm run dist:win     # bộ cài .exe + bản chạy thẳng, x64 (chạy trên Windows)
npm run dist:win:arm # bản Windows ARM
npm run dist:mac:tar # đóng .app thành .tar.gz (xem mục quarantine bên dưới)
```

Kết quả nằm trong thư mục `dist/`. Bản cài Windows nên dựng trên máy Windows (hoặc máy có
Wine); phần mã nguồn thì giống hệt nhau trên cả hai nền tảng.

## Khắc phục lỗi "app is damaged" trên máy Mac khác

Bản dựng chỉ được ký kiểu ad-hoc, **chưa công chứng (notarize)** vì việc đó cần tài khoản
Apple Developer trả phí. macOS chỉ chặn khi file mang thuộc tính `com.apple.quarantine`, và
**thuộc tính này do thứ dùng để chuyển file gắn vào**, không phải do định dạng file. Có ba
cách, xếp theo công sức bỏ ra:

### 1. Chuyển file bằng công cụ không gắn quarantine (miễn phí, không phải gõ gì)

| Cách chuyển | Có bị quarantine? |
| --- | --- |
| Tải bằng `curl` / `wget` | không — mở được ngay |
| `scp`, `rsync` (không có `-X`), `cp` từ USB | không — mở được ngay |
| USB định dạng exFAT/FAT32 | không — hệ thống file không lưu được thuộc tính này |
| Tải bằng Safari/Chrome, AirDrop, Mail, Messages | **có** |

Đã kiểm chứng: file `.tar.gz` tải bằng `curl` giải nén ra ứng dụng không có thuộc tính
quarantine nào và chữ ký vẫn hợp lệ. Lưu ý quarantine **lây qua file nén**: giải nén một
file `.zip`/`.tar.gz`/`.dmg` tải từ trình duyệt thì mọi file bên trong đều bị đánh dấu, nên
chỉ nén lại thôi là không đủ.

Trên máy đích:

```bash
curl -LO https://github.com/xmllist/fshare-tabs/releases/download/v1.0.0/Fshare-Tabs-1.0.0-mac-arm64.tar.gz
tar -xzf Fshare-Tabs-1.0.0-mac-arm64.tar.gz
mv "Fshare Tabs.app" /Applications/
```

(Máy Intel thì đổi `arm64` thành `x64`.)

### 2. Xoá cờ quarantine sau khi chép (miễn phí, mỗi máy gõ một lần)

```bash
xattr -dr com.apple.quarantine "/Applications/Fshare Tabs.app"
```

Dùng cách này khi ứng dụng được tải bằng trình duyệt hoặc nhận qua AirDrop. Bấm chuột phải
→ Open **không** qua được thông báo "damaged": chữ đó nghĩa là chữ ký không được tin cậy
cộng với cờ quarantine, chỉ xoá cờ mới mở được.

### 3. Ký và công chứng đàng hoàng (99 USD/năm, xong thì hết phiền)

Khi đã có tài khoản Apple Developer Program và chứng chỉ *Developer ID Application* trong
keychain:

```bash
export APPLE_TEAM_ID=XXXXXXXXXX
export APPLE_ID=ban@example.com
export APPLE_APP_SPECIFIC_PASSWORD=abcd-efgh-ijkl-mnop   # lấy ở appleid.apple.com
npm run dist:mac:signed
```

File `electron-builder.signed.js` sẽ bật hardened runtime, áp dụng
`build/entitlements.mac.plist` và gửi bản dựng cho Apple công chứng. File `.dmg` tạo ra mở
được ở mọi máy, không cảnh báo, không phải gõ lệnh nào. Bước ký ad-hoc tự động nhường chỗ
khi phát hiện có chứng chỉ thật.

Windows cũng vậy: chưa ký thì SmartScreen sẽ cảnh báo ("More info" → "Run anyway"), muốn
hết thì cần chứng chỉ code-signing EV/OV.

## Lần chạy đầu

Mở **Settings** và điền:

| Mục | Ghi chú |
| --- | --- |
| Email / mật khẩu Fshare | Hai ô đăng nhập. Được mã hoá bằng keychain của hệ điều hành (macOS Keychain / Windows DPAPI). |
| Google Sheet URL | Mặc định là sheet phim; đổi nếu muốn dùng sheet khác. |
| Đường dẫn VLC | Không bắt buộc, ứng dụng tự dò ở các vị trí cài đặt thông thường. |

Các công tắc: tự phát link bắt được bằng VLC, tự đăng nhập Fshare, tự tìm kiếm sau khi dán
link ở tab 2.

## Cách từng bước hoạt động

* **Tab 1 → Tab 2.** Mọi cú bấm vào link `fshare.vn` đều bị bắt lại (cả link thường lẫn
  link mở cửa sổ mới). Link dạng `/folder/CODE` mở thẳng thành
  `https://fshare.annnekkk.com/CODE`, đồng thời link gốc cũng được gõ vào ô tìm kiếm của
  trang. Link dạng `/file/CODE` bỏ qua tab 2 — trang đó chỉ duyệt thư mục — và sang thẳng
  tab 3.
* **Tab 2 → Tab 3.** Bấm tên file, hoặc nút *copy link* của dòng đó, là link sang tab 3.
* **Đăng nhập.** Nếu tab 3 mở một trang trong lúc chưa đăng nhập, ứng dụng vòng qua
  `fshare.vn/site/login`, điền cả hai ô, gửi đi rồi quay lại đúng trang bạn đang muốn xem.
  Sai mật khẩu thì nó dừng sau hai lần thử để không lặp vô tận.
* **Tải → VLC.** Đường dẫn thật được bắt bằng bốn cách: sự kiện tải của trình duyệt, điều
  hướng thẳng tới `download*.fshare.vn/dl/…`, nội dung phản hồi `fetch`/`XHR`, và các thao
  tác mở cửa sổ mới / copy link. Cách nào chạy trước thì tính, trùng nhau trong vòng 8 giây
  thì bỏ qua.

Nút **Activity** ở đáy cửa sổ cho xem đúng những gì ứng dụng đã bắt được và đã làm.

## Cấu trúc mã nguồn

| File | Nhiệm vụ |
| --- | --- |
| `main.js` | Cửa sổ, điều phối tab, bắt link tải, luồng đăng nhập, gọi VLC, lưu cài đặt |
| `inject.js` | Các đoạn script chèn vào trang của từng tab |
| `preload-web.js` | Cầu nối giữa trang web và ứng dụng (trang web không chạm được vào IPC) |
| `preload-host.js` | Những hàm mà giao diện của ứng dụng được phép gọi |
| `renderer/` | Giao diện: thanh tab, thanh địa chỉ, nhật ký hoạt động, hộp cài đặt |
| `tools/` | Tạo icon, ký ad-hoc, đóng gói `.tar.gz` không dính quarantine |

## Ghi chú kỹ thuật

* Ba tab là các thẻ `<webview>` dùng chung một phiên lưu trữ lâu dài, nên phiên đăng nhập
  Google và Fshare vẫn còn sau khi tắt mở lại.
* Các trang web chạy với node integration tắt và context isolation bật.
* Nếu không khởi động được VLC, link vẫn nằm trong clipboard — dán vào
  VLC → File → Open Network Stream.
* Một thẻ `<webview>` bắt buộc phải có `display: flex`, nếu không iframe bên trong nó co
  lại còn 150px và trang hiện ra đen sì.
* Webview ngừng vẽ khi bị ẩn, nên lúc chuyển tab ứng dụng phải ép nó vẽ lại. Không thể
  thay việc ẩn bằng cách xếp chồng z-index: bề mặt của webview không tuân theo z-index và
  sẽ hiện nhầm trang của tab khác.

# Spec: Thay toàn bộ emoji bằng icon SVG duotone

Ngày: 2026-07-14

## Mục tiêu
Thay tất cả emoji + ký hiệu hình học trong UI bằng một bộ icon **duotone đồng nhất**,
tự đổi màu theo Light/Dark, nhúng sẵn (app chạy offline — không tải icon lúc chạy).

## Quyết định đã chốt (với user)
- **Một bộ duotone đồng nhất** (không cherry-pick nhiều tác giả). Chọn **Phosphor Duotone**
  (MIT, có trên svgrepo, mỗi icon = 1 path chính + 1 path phụ `opacity="0.2"`, dùng
  `currentColor` → tự đổi theo màu chữ/theme).
- **Thay tất cả**: emoji màu (🎙️📄✅⚙️🌙☀️⚠️🔊🎤🗑⬆📁🔒🗄) và ký hiệu hình học
  (● ■ ＋ ✓ ☑ ↩).

## Cách làm
### 1. Lấy icon (thời điểm build/dev — có mạng)
- `curl` các file SVG duotone từ CDN Phosphor, ví dụ:
  `https://unpkg.com/@phosphor-icons/core@2/assets/duotone/<name>-duotone.svg`
- Nhúng path vào component React (KHÔNG fetch lúc chạy). Bỏ `<rect ... fill="none"/>` nền,
  đặt `fill="currentColor"` trên `<svg>`; giữ `opacity="0.2"` ở path phụ để ra hiệu ứng duotone.

### 2. Module icon — `desktop/src/renderer/src/components/icons.tsx`
- Mỗi icon là 1 component nhận `{ size?: number; className?: string }` (mặc định size 20),
  render `<svg viewBox="0 0 256 256" width={size} height={size} fill="currentColor"
  aria-hidden className={...}>` chứa 2 path (phụ opacity 0.2 + chính).
- Xuất các icon cần dùng (tên gợi ý theo Phosphor): `Microphone`, `FileText`, `CheckCircle`,
  `Check`, `CheckSquare`, `Gear`, `Moon`, `Sun`, `Warning`, `SpeakerHigh`, `Trash`,
  `UploadSimple`, `FolderOpen`, `Lock`, `Archive`, `ArrowUUpLeft` (khôi phục), `Plus`,
  `Record` (● ghi), `Stop` (■ dừng). Chọn tên Phosphor phù hợp nhất nếu tên trên khác.

### 3. Bảng ánh xạ emoji → icon
| Nơi | Emoji | Icon |
|-----|-------|------|
| App nav Ghi âm | 🎙️ | Microphone |
| App nav Cuộc họp | 📄 | FileText |
| App nav Tasks | ✅ | CheckCircle |
| App nav Cài đặt | ⚙️ | Gear |
| App theme toggle | 🌙 / ☀️ | Moon / Sun |
| Banner cảnh báo (App/Home/Processing/Settings) | ⚠️ | Warning |
| Home chip tiếng máy | 🔊 | SpeakerHigh |
| Home chip mic | 🎤 | Microphone |
| Home nút bắt đầu | ● | Record (hoặc Circle fill) |
| Home nút kết thúc | ■ | Stop (hoặc Square) |
| Home chip đã chọn hồ sơ | ✓ | Check |
| Meetings nút nhập file | ⬆ | UploadSimple |
| Meetings/Tasks nút xoá | 🗑 | Trash |
| Tasks nguồn cuộc họp / MeetingDetail | 📄 | FileText |
| Tasks header cột xong | ☑ | CheckSquare |
| Tasks nút thêm | ＋ | Plus |
| Tasks nút lưu trữ | 🗄 | Archive |
| Tasks nút khôi phục | ↩ | ArrowUUpLeft |
| Settings đã có / ok | ✅ | CheckCircle |
| Settings mở thư mục | 📁 | FolderOpen |
| Settings quyền riêng tư | 🔒 | Lock |
| MeetingDetail/Processing/Onboarding dấu ✓ | ✓ | Check |
| MeetingDetail đã thêm | ✓ | Check |

(Rà thêm mọi emoji còn sót — mục tiêu KHÔNG còn emoji pictographic/ký hiệu trong renderer.)

### 4. Sửa các màn hình
App.tsx, Home, Meetings, MeetingDetail, Onboarding, Processing, Settings, Tasks: thay chuỗi
emoji bằng `<IconX size={...} />`. Giữ nguyên logic. Cỡ icon hợp ngữ cảnh (nav ~18–20,
nút nhỏ ~15–16, chip ~14, nút ghi lớn ~22). Icon kế văn bản → wrap trong span flex/align.

### 5. theme.css
- Thêm lớp `.icon` cơ sở: `display:inline-flex; vertical-align:middle; flex:none;` để icon
  canh đúng cạnh chữ trong nav-item/nút/chip. Điều chỉnh khoảng cách (gap) nơi cần.
- Icon dùng currentColor nên tự theo màu ngữ cảnh (nav-item màu chữ, nút primary trắng,
  banner warn/màu đỏ...). Không cần màu cứng.

## Xử lý lỗi / lưu ý
- Nếu một tên icon Phosphor không tồn tại → chọn icon gần nghĩa nhất (ghi rõ trong báo cáo).
- Không đụng app icon / tray icon (không phải emoji trong renderer).
- Không phá các thay đổi chưa commit khác (dark mode, Tasks, Archive, import, bug fix).

## Kiểm thử (verify)
1. Liệt kê các icon đã curl thành công (tên + số path).
2. `grep -rnoE '<emoji set>' src/renderer/src` sau khi sửa → không còn (trừ trường hợp nêu rõ).
3. Mỗi icon component có `fill="currentColor"` và path phụ `opacity="0.2"`.
4. `npm run typecheck` + `npm run build` pass.

## Ngoài phạm vi
Đổi app icon/tray; animation icon; theme màu icon riêng khác currentColor.

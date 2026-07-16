# Chat AI sửa biên bản (Trợ lý biên bản) — thiết kế

Ngày: 2026-07-16 · Trạng thái: đã duyệt

## Mục tiêu

Cho phép user nhắn yêu cầu chỉnh sửa tự do ("chi tiết hơn", "bỏ mục 4", "đổi cách xưng hô"...)
ngay trên màn chi tiết cuộc họp; AI (Claude Code CLI) viết lại `bien-ban.md` theo yêu cầu.
UI dạng floating button + popover chat (tham khảo ảnh mẫu user gửi).

## Quyết định đã chốt với user

- KHÔNG tự xuất PDF sau mỗi lượt sửa — giống "Chỉnh sửa"/"Tìm & thay thế": cập nhật nội dung
  ngay, nhắc bấm "Xuất PDF" khi ưng ý.
- KHÔNG cần nút hoàn tác — sửa hỏng thì nhắn tiếp hoặc "Viết lại biên bản".
- Lịch sử chat chỉ giữ trong state khi màn hình đang mở, không lưu file.

## Kiến trúc

### 1. Engine — lệnh mới `wz.py revise <name>` (additive)

- Đọc yêu cầu chỉnh sửa từ **stdin** (tránh ARG_MAX, như `write_bienban` truyền prompt qua stdin).
- Prompt = biên bản hiện tại (`bien-ban.md`) + transcript (`transcript.speakers.txt`, để chip
  "Chi tiết hơn" lấy thêm ý thật) + ngữ cảnh/glossary (tái dùng logic gộp của `write_bienban`,
  tách thành helper chung) + yêu cầu của user.
- Yêu cầu Claude xuất lại TOÀN BỘ Markdown biên bản đã sửa, giữ nguyên phần không liên quan;
  quy ước em-dash/br như cũ. Ghi đè `bien-ban.md`, không xuất PDF.
- Thiếu claude CLI: in `NO_CLAUDE`, exit 2 (như `bienban`). Ghi vào `ENGINE-PROTOCOL.md`.

### 2. Main process — IPC `meetings:revise(name, feedback)`

- `runStreaming(['revise', name], ..., stdin: feedback)` — thêm tham số `stdin` optional cho
  `runStreaming`. Timeout 20 phút.
- KHÔNG đụng pipeline state (chạy độc lập như `exportPdfFor`).
- Guard: mỗi cuộc họp chỉ 1 yêu cầu revise chạy tại 1 thời điểm (Set tên đang chạy).
- Trả `{ ok, errorCode?: 'NO_CLAUDE'|'BUSY'|'GENERIC', message? }` — không throw để renderer
  hiện lỗi trong bubble chat.

### 3. UI — `ReviseChat.tsx` trong màn MeetingDetail

- Floating button tròn (icon Sparkle) góc dưới-phải, chỉ hiện ở tab "Biên bản" khi đã có
  biên bản và không ở chế độ sửa tay. Bấm → mở popover, nút đổi thành ✕.
- Popover: header "Trợ lý biên bản" + nút đóng; khung hội thoại (bubble user phải nền navy,
  bubble AI trái nền azure-soft, bubble lỗi nền đỏ nhạt); hàng chip gợi ý "Chi tiết hơn",
  "Ngắn gọn hơn"; ô nhập "Nhắn yêu cầu chỉnh sửa..." + nút gửi (Enter cũng gửi).
- Đang xử lý: dòng "Đang chỉnh sửa..." + spinner, khoá input/chip/nút gửi.
- Xong: gọi `onUpdated` (reload nội dung biên bản) + AI nhắn "Đã cập nhật biên bản theo
  yêu cầu. Bạn xem lại nội dung nhé. Ưng ý thì bấm Xuất PDF."
- Đổi cuộc họp → reset chat. Mỗi lượt gửi là 1 lần `claude -p` độc lập trên nội dung mới nhất.

## Không làm

Hoàn tác, tự xuất PDF, lưu lịch sử chat, sửa transcript qua chat, streaming từng chữ.

## Kiểm chứng

- Test engine: tạo thư mục họp giả trong output, chạy `revise` qua stdin, kiểm tra
  `bien-ban.md` đổi đúng, xoá thư mục giả.
- `npm run typecheck` + build; cài bản mới vào /Applications theo quy trình hiện có.

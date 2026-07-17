# Trợ lý biên bản tạo Wiki từ cuộc họp + sửa tay tiêu đề — thiết kế

Ngày: 2026-07-17 · Trạng thái: đã duyệt

## 1. Chế độ "Lưu Wiki" trong Trợ lý biên bản

- ReviseChat thêm 2 pill trên ô nhập: [Sửa biên bản] (mặc định) | [Lưu Wiki].
- Chế độ Lưu Wiki: placeholder "Muốn lưu nội dung gì từ cuộc họp vào Wiki?";
  gửi → engine `wz.py wiki-note <tên>` (yêu cầu qua stdin): Claude đọc biên bản +
  transcript, chắt phần được yêu cầu thành 1 ghi chú wiki TỰ ĐỨNG ĐƯỢC, trả đúng
  format `TITLE:/TAGS:/CONTENT:`; engine ghi file vào `~/wz-bien-ban/wiki/`
  (frontmatter cùng định dạng WikiStore, cuối note ghi nguồn cuộc họp), in
  `NOTE_ID=`/`NOTE_TITLE=`. NO_CLAUDE exit 2.
- Chat trả lời "Đã tạo ghi chú Wiki: <title>" (bubble lỗi như revise). IPC mới
  `meetings:wikiNote(name, request)`.
- Chips gợi ý chỉ hiện ở chế độ Sửa biên bản.

## 2. Sửa tay tiêu đề cuộc họp

- Nút bút chì cạnh nút ✦ ở header MeetingDetail → input sửa title hiển thị
  (Enter/Lưu, Esc huỷ; để trống = xoá title, quay về tên thư mục).
- Main: `setMeetingTitle(name, title)` ghi meeting.json (trống thì xoá khoá);
  IPC `meetings:setTitle`. Danh sách Cuộc họp tự ăn theo (đã hiển thị title).

## 3. Tìm kiếm cuộc họp (bổ sung cùng đợt)

- Ô tìm kiếm ở trang Cuộc họp: khớp tiêu đề hiển thị, tên thư mục, VÀ nội dung
  biên bản (bien-ban.md). Đọc file phía main: IPC `meetings:search(q)` trả danh
  sách tên khớp; renderer debounce ~250ms, kết hợp với lọc tag ngữ cảnh sẵn có.

## Kiểm chứng

Engine wiki-note trên cuộc họp giả → file wiki đúng frontmatter + nguồn, parse
được bằng _wiki_notes; typecheck/build; cài app.

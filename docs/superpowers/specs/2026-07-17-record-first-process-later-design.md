# Ghi âm trước, xử lý sau (record-first, process-later) — thiết kế

Ngày: 2026-07-17 · Trạng thái: đã duyệt

## Vấn đề

"Kết thúc họp" hiện chạy trọn pipeline (dừng → transcribe → biên bản → PDF) và màn
Processing CHẶN tab Ghi âm → ghi lỗi muốn bỏ và ghi lại ngay cũng phải đợi transcribe +
tóm tắt xong. User chốt mô hình mới: **dừng họp = chỉ lưu ghi âm; transcript/biên bản là
hành động theo yêu cầu, chạy nền.**

## Quyết định đã chốt với user

- Kết thúc họp → CHỈ dừng + trộn audio (vài giây), về Home sẵn sàng ghi mới, kèm thông
  báo "Đã lưu cuộc họp X" + nút [Tạo biên bản ngay] [Mở cuộc họp].
- KHÔNG có setting tự động xử lý — tạo biên bản luôn là chủ động (1 cú bấm).
- Xử lý nền mỗi lúc 1 cuộc (Whisper nặng); đang bận thì nút của cuộc khác từ chối kèm
  ghi chú. Nhập file ghi âm ngoài giữ nguyên hành vi cũ (nhập = xử lý luôn).

## Engine `wz.py` (additive, plugin/MCP không đổi)

- `record-stop --save-only`: dừng + trộn mic/hệ thống → `audio.16k.wav`, in
  `OUTPUT_DIR=`, KHÔNG transcribe. `record-stop` trần giữ nguyên (plugin/MCP).
- `transcribe <tên> [--turbo]`: transcript + tách người nói cho cuộc họp đã có
  `audio.16k.wav` (tái dùng `_transcribe` + `_merge`), in `OUTPUT_DIR=` khi xong.
- `list` thêm `has_audio` (audio.16k.wav tồn tại) để UI biết cuộc "chưa xử lý".

## Main process

- `stopAndSave()` (PipelineService, thay `stopAndProcess`): chạy `record-stop
  --save-only`, parse OUTPUT_DIR → tên; KHÔNG đụng pipeline state. Dùng cho cả IPC
  recorderStop lẫn tray.
- `processMeeting(name)`: pipeline nền origin `'process'`: transcribing → minutes → pdf
  (tái dùng `minutesAndPdf`). Guard: đang bận → không nhận, trả tên cuộc đang chạy.
- IPC: `recorderStop` trả `{stopped, name?, error?}` (await lưu xong); mới
  `meetings:process(name)` trả `{started, busyWith?}`. Dialog xác nhận đổi chữ:
  "Ghi âm sẽ dừng và lưu lại. Transcript & biên bản tạo sau, lúc nào bạn muốn."
- Tray: "Bắt đầu họp" chỉ khoá khi ĐANG GHI (pipeline bận không khoá nữa); kết thúc →
  `stopAndSave`; title ưu tiên đồng hồ ghi âm hơn ⏳.

## Renderer

- App.tsx: BỎ chặn Home khi pipeline bận. Màn Processing chỉ hiện khi: origin `import`
  (giữ luồng cũ) hoặc user bấm "Xem tiến trình" (`viewProgress`). Banner mỏng mọi tab
  khi pipeline origin `process`: đang chạy → "Đang tạo biên bản: X · <bước> — Xem tiến
  trình"; done → "Đã xong biên bản: X — [Mở] [✕ đóng]"; error → "[Xem chi tiết]".
  `viewProgress` tự tắt khi pipeline idle.
- Home.tsx: Kết thúc → nút hiện "Đang lưu..." (await recorderStop) → thông báo
  "Đã lưu cuộc họp X" + [Tạo biên bản ngay] [Mở cuộc họp] (props mới `onOpenMeeting`).
  Ghi mới được ngay cả khi pipeline nền đang chạy.
- Processing.tsx: origin `process` ẩn bước "Dừng ghi âm"; thêm nút "← Về màn ghi âm"
  (onBack); lỗi ở bước transcribe có nút "Thử lại" (gọi meetings:process).
- Meetings.tsx: cuộc `hasAudio && !hasTranscript` thêm nút "Tạo biên bản" ngay trên
  dòng (bấm → meetings:process; bận thì alert tên cuộc đang chạy).
- MeetingDetail.tsx: chưa có transcript nhưng có audio → nút "Tạo transcript & biên
  bản" thay cho trạng thái trống; `getMeeting` thêm `hasAudio`.

## Kiểm chứng

- Engine: record-start → record-stop --save-only (nhanh, có audio.16k.wav, không
  transcript) → record-start cuộc mới NGAY được → transcribe <tên> ra transcript đúng.
- list có has_audio; typecheck + build; cài app, user thử: dừng họp xong ghi lại liền.

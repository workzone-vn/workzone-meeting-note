---
name: bien-ban-hop
description: Tạo biên bản cuộc họp tiếng Việt chạy local. TRIGGER khi người dùng nói "bắt đầu họp", "ghi âm cuộc họp", "kết thúc họp", "tạo biên bản", "biên bản cuộc họp", hoặc muốn transcript một file ghi âm họp.
---

# WZ Biên Bản - tạo biên bản họp tiếng Việt (chạy local)

Engine local: Whisper large-v3 (mlx) nghe -> chữ, Claude (subscription của người dùng) viết biên bản. Audio không rời máy.

Đường dẫn: python tại `$HOME/wz-bien-ban/.venv/bin/python`, script tại `${CLAUDE_PLUGIN_ROOT}/scripts/wz.py`. Dữ liệu ra ở `$HOME/wz-bien-ban/output/<tên>/`.

## Nhận diện ý định người dùng

- "bắt đầu họp" / "ghi âm họp" -> chạy lệnh `/bat-dau-hop` (xem commands/bat-dau-hop.md).
- "kết thúc họp" / "xong họp" / "tạo biên bản" -> chạy chuỗi `/ket-thuc-hop` (xem commands/ket-thuc-hop.md).
- "có file ghi âm sẵn rồi" -> không cần ghi; copy file vào `$HOME/wz-bien-ban/output/<tên>/audio.16k.wav` (qua ffmpeg chuẩn hoá 16k mono) rồi chạy `wz.py` các bước transcribe/merge tương ứng, sau đó viết biên bản như bước 2-5 của ket-thuc-hop.
- "chưa cài" / "cài đặt" -> chạy `/cai-dat`.

## Quy ước viết biên bản (bắt buộc)
- Tiếng Việt có dấu. KHÔNG em-dash. Heading nhiều câu thì `<br>` sau câu đầu.
- Sửa thuật ngữ/tên riêng theo `${CLAUDE_PLUGIN_ROOT}/scripts/glossary.yaml` (chung) và `$HOME/wz-bien-ban/glossary.yaml` nếu có (riêng của người dùng, ưu tiên khi trùng).
- Bố cục (đề mục lớn đánh số): 1. Tóm tắt -> 2. Action items (bảng Việc | Người phụ trách | Deadline) -> 3. Nội dung chính (mục con 3.1, 3.2...) -> 4. Quyết định.
- Lọc đoạn nhiễu (ký tự lặp vô nghĩa).

## Lệnh wz.py
- `record-start [tên]` / `record-stop` / `pdf <tên>` / `viewer <tên>` / `diarize <tên> [số người]` / `status` / `check`.

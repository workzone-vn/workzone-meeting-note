# WZ Biên Bản

> Biên bản họp tiếng Việt chất lượng cao, **chạy local trên máy bạn**. Ghi âm bằng 1 lệnh, kết thúc là có biên bản + PDF. Audio không rời máy. Phần AI dùng chính **Claude Code của bạn** (không tốn phí transcript).

## Cài đặt (1 lần)

**Chỉ cần:** macOS (Apple Silicon) + [Claude Code](https://claude.com/claude-code) (có trong app Claude Desktop). Không cần tự cài ffmpeg/Chrome.

Dán prompt này vào Claude Code:
```
Cài giúp tôi công cụ WZ Biên Bản: chạy lệnh
curl -fsSL https://raw.githubusercontent.com/workzone-vn/workzone-meeting-note/main/install.sh | bash
rồi báo tôi khi xong.
```
Hoặc chạy thẳng trong Terminal:
```
curl -fsSL https://raw.githubusercontent.com/workzone-vn/workzone-meeting-note/main/install.sh | bash
```
Xong thì mở lại Claude Code. Hướng dẫn có hình: `huong-dan/HUONG-DAN-CAI-DAT.pdf`.


## 3 cách dùng (cùng 1 engine local)

Bộ cài 1 lệnh ở trên thiết lập sẵn cả 3, dùng cái nào tùy app bạn xài:

1. **Claude Code** - gõ `/bat-dau-hop` rồi `/ket-thuc-hop`.
2. **Claude Desktop** (MCP) - nói "bắt đầu họp" ... "kết thúc họp, viết biên bản". Claude tự gọi tool, viết biên bản bằng subscription của bạn.
3. **App desktop** (macOS, Electron) - giao diện đầy đủ: ghi âm, xem/sửa biên bản, tìm & thay thế, xuất PDF, kèm icon 🎙️ menu bar. Build: `cd desktop && npm install && npm run dist:mac:unsigned` → DMG trong `desktop/dist/`. Chạy dev: `npm run dev`. Lần đầu mở app tự tải engine + model (~3GB), máy đã cài trước thì dùng lại luôn. Ký + notarize khi phát hành: xem `app/SIGNING.md`. (App menu-bar rumps cũ trong `app/` ngừng phát triển.)

## Dùng hàng ngày - chỉ 2 lệnh (Claude Code)

| Gõ trong Claude Code | Kết quả |
|---|---|
| `bắt đầu họp` (hoặc `/bat-dau-hop`) | Bắt đầu ghi âm |
| `kết thúc họp` (hoặc `/ket-thuc-hop`) | Dừng ghi → transcript → biên bản → PDF, tự mở ra |

Kết quả lưu tại `~/wz-bien-ban/output/<tên-cuộc-họp>/`:
- `bien-ban.pdf` - biên bản + transcript (file gửi đi)
- `bien-ban.md` - biên bản dạng văn bản
- `viewer.html` - trang xem có tìm kiếm
- `transcript.raw.txt` - bản ghi thô

## Ghi âm chất lượng cao hơn (tuỳ chọn)
Mặc định ghi qua mic (bật loa ngoài để bắt tiếng mọi người). Muốn bắt thẳng âm thanh trong máy (kể cả đeo tai nghe): cài [BlackHole](https://existential.audio/blackhole/) rồi đặt biến `WZ_AUDIO_DEV` trỏ tới Aggregate Device.

## Tách người nói (tuỳ chọn)
Mặc định TẮT để cài là chạy ngay. Bật để biết "ai nói câu nào":
1. Lấy token miễn phí tại https://hf.co/settings/tokens
2. Đồng ý điều kiện tại https://hf.co/pyannote/speaker-diarization-3.1
3. Tạo file `~/wz-bien-ban/.env` với dòng `HF_TOKEN=hf_xxx`
4. Cài thêm: `~/wz-bien-ban/.venv/bin/python -m pip install pyannote.audio torch`

## Quyền riêng tư
Toàn bộ audio và transcript **nằm trên máy bạn**. Chỉ phần văn bản transcript được Claude Code (của bạn) xử lý để viết biên bản. Không có audio nào gửi lên server bên thứ ba.

---
© Work Zone · workzone.ai.vn

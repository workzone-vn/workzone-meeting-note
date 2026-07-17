# Giao thức App ↔ Engine

App Electron nói chuyện với engine qua CLI `wz.py` (spawn bằng python của venv
`~/wz-bien-ban/.venv`). Đây là **seam** cho Windows sau này: một `wz-win.py`
(ghi WASAPI + faster-whisper/whisper.cpp) chỉ cần in đúng các marker dưới đây
là toàn bộ UI/main-process dùng lại nguyên vẹn. Phần macOS-conditional duy nhất
nằm ở `src/main/paths.ts`.

## Lệnh app sử dụng

| Lệnh | Vai trò | Output cần parse |
|---|---|---|
| `record-start [tên] [--profile <hồ-sơ>]...` | Bắt đầu ghi (thoát ngay, ffmpeg chạy nền); lặp --profile để chọn nhiều hồ sơ, ghi vào meeting.json `profiles` | `WARN_SILENT` nếu mic im lặng; exit ≠ 0 nếu đang ghi cuộc khác |
| `record-stop` | Dừng + transcribe (blocking, có thể 30+ phút) - plugin/MCP dùng | dòng `Đang transcript` (bắt đầu stage transcribe); `OUTPUT_DIR=<path>` khi xong |
| `record-stop --save-only` | Chỉ dừng + trộn nguồn -> audio.16k.wav (vài giây), KHÔNG transcribe - app dùng (record-first, process-later) | `OUTPUT_DIR=<path>` |
| `transcribe <tên>` | Transcript + tách người nói cho cuộc đã có audio.16k.wav (blocking) | `OUTPUT_DIR=<path>` khi xong |
| `bienban <tên> --no-pdf` | Viết biên bản qua `claude -p`, không xuất PDF | `NO_CLAUDE` + exit 2 nếu thiếu Claude Code |
| `title <tên>` | Sinh tiêu đề hiển thị: H1 của bien-ban.md (tức thì) hoặc Claude từ đoạn đầu transcript; ghi meeting.json `title` | `TITLE=<tiêu đề>`; `NO_CLAUDE` + exit 2 |
| `revise <tên>` | Sửa biên bản theo yêu cầu tự do của user (**stdin** = yêu cầu, tránh ARG_MAX); prompt gồm bien-ban.md + transcript + ngữ cảnh; ghi đè bien-ban.md, không PDF | `NO_CLAUDE` + exit 2 nếu thiếu Claude Code |
| `print-html <tên>` | Build print.html (app tự render PDF bằng printToPDF) | `PRINT_HTML=<path>` |
| `list` | Danh sách cuộc họp | JSON array `{name, started, profiles: [..], duration, has_audio, has_transcript, has_bienban, has_pdf}` |
| `devices` | Thiết bị audio đầu vào | JSON array `{index, name}` |
| `diarize <tên> [số người]` | Tách người nói (cần HF_TOKEN) | exit code |
| `check` | Kiểm tra cài đặt | text hiển thị thẳng cho user |

## Trạng thái ghi âm

Không có lệnh riêng: app đọc thẳng `~/wz-bien-ban/.state.json`
(`{name, pid, pids, mode, wav, started}`) và kiểm tra pid còn sống
(`kill(pid, 0)`, guard `pid > 0`). Ghi âm spawn `start_new_session=True` nên
**sống sót khi app thoát/crash** - app mở lại tự nhận diện và tiếp tục.

## Biến môi trường

- `WZ_DATA_DIR` - đổi thư mục dữ liệu (mặc định `~/wz-bien-ban`)
- `WZ_AUDIO_DEV` - chọn mic, định dạng avfoundation `":<index>"` (app set từ Settings)
- `HF_TOKEN` (hoặc dòng trong `~/wz-bien-ban/.env`) - bật tách người nói

## Cờ file dùng chung với plugin/MCP

- `~/wz-bien-ban/.system_audio` - tồn tại = ghi cả tiếng hệ thống (wz-syscap: Core Audio
  Process Tap, macOS 14.2+, quyền TCC "Ghi âm thanh hệ thống" - KHÔNG cần Ghi màn hình)
- `~/wz-bien-ban/profiles/<hồ-sơ>/context.md` - hồ sơ NGỮ CẢNH (văn bản tự do:
  người, chức vụ, công ty, sản phẩm, từ nghe sai). Hồ sơ "Cá nhân" luôn tồn tại,
  là mặc định. Engine fallback tên file cũ `glossary.yaml` trong thư mục hồ sơ nếu
  chưa có context.md. `bienban` gộp: bộ chung sản phẩm + file cũ `~/wz-bien-ban/glossary.yaml`
  nếu còn + TẤT CẢ hồ sơ trong meeting.json `profiles` (chọn nhiều được, vd
  ["Cá nhân","DC"]); hồ sơ không chọn không bao giờ vào prompt. Tương thích ngược:
  khoá cũ `profile` (đơn) = ["Cá nhân", <profile>]; không có gì = ["Cá nhân"].
- `~/wz-bien-ban/engine/` - bản copy engine cho Claude Desktop MCP; app sync ở
  onboarding và mỗi lần mở (app tự chạy engine từ resources của nó, không từ đây)

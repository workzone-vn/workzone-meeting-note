# Windows beta (engine wz-win.py + build NSIS) — thiết kế

Ngày: 2026-07-17 · Trạng thái: user yêu cầu build không có máy test → phát hành
dạng BETA, ghi rõ chưa test trên máy thật trong release notes.

## Nguyên tắc

Theo seam có sẵn (`desktop/ENGINE-PROTOCOL.md`): app nói chuyện với engine qua CLI
marker → chỉ cần engine Windows in đúng marker, toàn bộ UI/main-process giữ nguyên.
`paths.ts` là nơi platform-conditional duy nhất (+ SetupService lệnh cài).

## Engine `wz-win.py` (cạnh wz.py, bundle cùng)

- `import wz` và TÁI DÙNG mọi lệnh không phụ thuộc nền tảng: list, bienban, revise,
  title, wiki-ask, wiki-note, print-html, status, pdf... (delegate `wz.main()`).
  Các lệnh AI chạy nguyên vẹn vì chỉ gọi `claude -p` (claude có bản Windows).
- Tự xử lý phần phụ thuộc nền tảng:
  - `_alive`: Windows không dùng được `os.kill(pid, 0)` (0 = CTRL_C_EVENT!) →
    ctypes OpenProcess/GetExitCodeProcess; monkeypatch `wz._alive` cho lệnh delegate.
  - `record-start/_rec/record-stop`: ghi mic + tiếng hệ thống bằng **pyaudiowpatch**
    (WASAPI loopback - không cần driver ảo, không cần xin quyền đặc biệt). Recorder
    là tiến trình con detached ghi mic.wav + system.wav; DỪNG bằng file cờ `.stop`
    trong thư mục cuộc họp (Windows không SIGINT tiến trình detached được);
    loopback hỏng → file cờ `.nosys` → in WARN_NOSYS (luồng degrade sẵn có).
  - `transcribe`: **faster-whisper** (large-v3, CPU int8, language=vi, VAD) sinh
    transcript.raw.json/raw.txt đúng format wz.py rồi gọi `wz._merge` (dùng chung).
  - `devices`: liệt kê input WASAPI. `import-file`: ffmpeg (imageio-ffmpeg) decode.
  - Trộn audio bằng ffmpeg.exe của imageio-ffmpeg (không symlink như macOS).
  - `sys.stdout/stderr.reconfigure(utf-8)` + app set PYTHONUTF8=1: pipe trên
    Windows mặc định cp1252, emoji/tiếng Việt trong marker sẽ crash nếu không.

## Desktop (nhánh win32)

- `paths.ts`: venvPython `.venv/Scripts/python.exe`; wzScript → wz-win.py;
  findClaude/findUv thêm đuôi .exe/.cmd; hfModelDir → models--Systran--faster-whisper-large-v3.
- `SetupService`: uv cài qua PowerShell (`irm astral.sh/uv/install.ps1 | iex`);
  pip: faster-whisper + pyaudiowpatch + imageio-ffmpeg (KHÔNG mlx/torch/pyannote -
  diarization tắt trên win v1); model: snapshot_download Systran/faster-whisper-large-v3;
  `syscapOk` = true trên win (loopback nằm trong engine); PATH nối bằng path.delimiter.
- `EngineService`: PATH delimiter + PYTHONUTF8=1.
- `tray.setTitle` chỉ gọi trên darwin.
- electron-builder: `win: nsis x64`, icon từ build/icon.png (tự convert ico);
  wz-syscap chỉ bundle cho mac; wz-win.py bundle cho cả hai (vô hại trên mac).

## Kiểm chứng (giới hạn không có máy Windows)

- Test được trên máy này: wz-win.py `transcribe` bằng faster-whisper (venv riêng,
  WZ_FW_MODEL=tiny cho nhanh) ra đúng format transcript; delegation (list/title...);
  py syntax; typecheck; NSIS build ra file + soi nội dung.
- KHÔNG test được: ghi âm WASAPI thật, installer chạy trên Windows thật →
  release đánh dấu BETA, mời người dùng phản hồi.

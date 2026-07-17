#!/usr/bin/env python3
"""WZ Biên Bản - MCP server cho Claude Desktop.

Cho phép Claude Desktop của user điều khiển ghi âm + transcript (chạy local),
rồi tự viết biên bản bằng chính subscription của user. Audio không rời máy.

Cấu hình trong claude_desktop_config.json:
  "wz-bien-ban": {
    "command": "<.venv>/bin/python",
    "args": ["<đường-dẫn>/mcp/server.py"]
  }

LƯU Ý: MCP stdio dùng stdout cho giao thức. Mọi print của engine phải đẩy sang
stderr (đã bọc bằng redirect_stdout) kẻo hỏng kết nối.
"""
import json
import sys
from contextlib import redirect_stdout
from pathlib import Path

# Nạp engine (wz.py, render.py). Tìm ở: cùng thư mục server (layout đã cài),
# rồi repo (plugins/.../scripts), rồi ~/wz-bien-ban/engine.
_here = Path(__file__).resolve().parent
for _c in [_here,
           _here.parent.parent / "plugins" / "wz-bien-ban" / "scripts",
           Path.home() / "wz-bien-ban" / "engine"]:
    if (_c / "wz.py").exists():
        sys.path.insert(0, str(_c))
        break
import wz  # noqa: E402

from mcp.server.fastmcp import FastMCP  # noqa: E402

mcp = FastMCP("workzone-meeting-note")


def _quiet(fn, *a, **k):
    """Chạy hàm engine, ép mọi print/progress sang stderr để không hỏng MCP stdio."""
    with redirect_stdout(sys.stderr):
        return fn(*a, **k)


def _latest_name():
    outs = sorted(wz.OUTPUT.glob("*/transcript.speakers.txt"), key=lambda p: p.stat().st_mtime)
    return outs[-1].parent.name if outs else None


@mcp.tool()
def bat_dau_ghi(ten: str = "") -> str:
    """Bắt đầu ghi âm cuộc họp (chạy local trên máy). Gọi khi người dùng nói 'bắt đầu họp'.
    ten: tên cuộc họp (tùy chọn, để trống sẽ tự đặt theo ngày giờ)."""
    _quiet(wz.ensure_ffmpeg)
    rc = _quiet(wz.record_start, ten or None)
    if rc != 0 or not wz.STATE.exists():
        return "Không bắt đầu ghi được (có thể đang ghi một cuộc khác - hãy kết thúc trước)."
    name = json.loads(wz.STATE.read_text())["name"]
    return (f"Đang ghi âm cuộc họp '{name}'. "
            "Nhắc người dùng: nếu chưa cài BlackHole thì bật loa ngoài (không đeo tai nghe). "
            "Khi họp xong, người dùng nói 'kết thúc họp'.")


@mcp.tool()
def trang_thai() -> str:
    """Xem có đang ghi âm cuộc họp nào không."""
    if wz.STATE.exists():
        st = json.loads(wz.STATE.read_text())
        if wz._alive(st.get("pid", -1)):
            return f"Đang ghi cuộc họp: {st['name']}."
    return "Không có cuộc họp nào đang ghi."


@mcp.tool()
def ket_thuc_va_transcript() -> str:
    """Dừng ghi âm, chạy transcript local (Whisper large-v3), trả về TOÀN BỘ transcript.
    Gọi khi người dùng nói 'kết thúc họp'. Sau khi nhận transcript, hãy VIẾT BIÊN BẢN
    (đề mục lớn đánh số theo thứ tự: 1. Tóm tắt, 2. Action items dạng bảng,
    3. Nội dung chính, 4. Quyết định; tiếng Việt; không em-dash) rồi gọi
    tool luu_bien_ban để lưu + xuất PDF."""
    _quiet(wz.ensure_ffmpeg)
    if not wz.STATE.exists():
        return "Không có cuộc họp nào đang ghi."
    name = json.loads(wz.STATE.read_text())["name"]
    _quiet(wz.record_stop, False)  # dừng + transcribe + merge
    f = wz.OUTPUT / name / "transcript.speakers.txt"
    if not f.exists():
        return f"Đã dừng nhưng chưa tạo được transcript cho '{name}'."
    text = f.read_text(encoding="utf-8")
    return (f"TÊN_CUỘC_HỌP: {name}\n"
            f"THƯ_MỤC: {wz.OUTPUT / name}\n\n"
            f"--- TRANSCRIPT (thô) ---\n{text}\n--- HẾT ---\n\n"
            "Hãy viết biên bản hoàn chỉnh rồi gọi luu_bien_ban(ten='" + name + "', noi_dung_md=...).")


@mcp.tool()
def lay_transcript(ten: str = "") -> str:
    """Lấy transcript của một cuộc họp đã ghi (để viết/sửa biên bản).
    ten: để trống = cuộc gần nhất."""
    name = ten or _latest_name()
    if not name:
        return "Chưa có cuộc họp nào."
    f = wz.OUTPUT / name / "transcript.speakers.txt"
    if not f.exists():
        return f"Không thấy transcript cho '{name}'."
    return f"TÊN_CUỘC_HỌP: {name}\n\n{f.read_text(encoding='utf-8')}"


@mcp.tool()
def luu_bien_ban(ten: str, noi_dung_md: str) -> str:
    """Lưu biên bản (markdown) mà bạn vừa viết, rồi tự xuất PDF + trang xem HTML và mở ra.
    ten: tên cuộc họp (đúng TÊN_CUỘC_HỌP đã nhận). noi_dung_md: nội dung biên bản dạng Markdown."""
    out_dir = wz.OUTPUT / ten
    if not out_dir.exists():
        return f"Không thấy thư mục cuộc họp '{ten}'."
    (out_dir / "bien-ban.md").write_text(noi_dung_md, encoding="utf-8")
    _quiet(wz.export_pdf, ten)
    pdf = out_dir / "bien-ban.pdf"
    if pdf.exists():
        return f"Đã lưu biên bản và xuất PDF: {pdf}"
    return f"Đã lưu biên bản tại {out_dir}/bien-ban.md (PDF cần Google Chrome; đã tạo trang xem HTML thay thế)."


if __name__ == "__main__":
    mcp.run()

#!/usr/bin/env python3
"""WZ Biên Bản - lõi engine transcript họp (chạy local, AI dùng Claude Code).

Các lệnh con:
    wz.py record-start [tên] [--profile <công-ty>]   Bắt đầu ghi âm (chạy nền)
    wz.py record-stop [--save-only]  Dừng ghi + transcript + ghép; --save-only: chỉ dừng + lưu audio
    wz.py transcribe <tên>       Transcript cuộc họp đã có audio (dùng sau --save-only)
    wz.py import-file <file> [tên]  Nhập file ghi âm ngoài -> tạo cuộc họp + transcript (DỪNG)
    wz.py pdf <tên>              Xuất biên bản + transcript ra PDF (cần bien-ban.md đã có)
    wz.py viewer <tên>           Tạo trang HTML xem transcript + biên bản
    wz.py diarize <tên>          Tách người nói (cần HF_TOKEN)
    wz.py status                 Xem đang ghi cuộc nào không
    wz.py check                  Kiểm tra đã cài đủ chưa
    wz.py list                   JSON danh sách cuộc họp (cho app desktop)
    wz.py devices                JSON thiết bị audio đầu vào (cho app desktop)
    wz.py print-html <tên>       Chỉ build print.html, in PRINT_HTML= (app tự render PDF)
    wz.py revise <tên>           Sửa biên bản theo yêu cầu đọc từ stdin (Claude Code)
    wz.py title <tên>            Sinh tiêu đề hiển thị từ nội dung -> meeting.json 'title'
    wz.py wiki-ask               Hỏi đáp trên Wiki (~/wz-bien-ban/wiki), câu hỏi qua stdin
    wz.py wiki-note <tên>        Chắt nội dung cuộc họp thành ghi chú Wiki (yêu cầu qua stdin)

Dữ liệu lưu tại ~/wz-bien-ban/ (đổi bằng biến môi trường WZ_DATA_DIR).
"""
import json
import os
import re
import shutil
import signal
import subprocess
import sys
import time
from pathlib import Path

DATA = Path(os.environ.get("WZ_DATA_DIR", str(Path.home() / "wz-bien-ban")))
OUTPUT = DATA / "output"
STATE = DATA / ".state.json"
HERE = Path(__file__).resolve().parent
AUDIO_DEV = os.environ.get("WZ_AUDIO_DEV", ":0")  # :0 = mic; đổi nếu cài BlackHole
MODEL_HQ = "mlx-community/whisper-large-v3-mlx"
MODEL_TURBO = "mlx-community/whisper-large-v3-turbo"


def ensure_ffmpeg():
    """Đảm bảo có 'ffmpeg' trong PATH. Nếu máy chưa có, dùng bản đóng gói qua pip
    (imageio-ffmpeg) - tạo symlink tên 'ffmpeg' để cả mlx-whisper cũng tìm thấy.
    Nhờ vậy khách KHÔNG cần tự cài ffmpeg ngoài."""
    if shutil.which("ffmpeg"):
        return
    try:
        import imageio_ffmpeg
    except ImportError:
        return  # install.sh sẽ cài; nếu chưa có thì để lỗi rõ ràng ở chỗ dùng
    exe = imageio_ffmpeg.get_ffmpeg_exe()
    bindir = DATA / "bin"
    bindir.mkdir(parents=True, exist_ok=True)
    link = bindir / "ffmpeg"
    if not link.exists():
        try:
            link.symlink_to(exe)
        except OSError:
            shutil.copy2(exe, link)
            link.chmod(0o755)
    os.environ["PATH"] = f"{bindir}{os.pathsep}{os.environ.get('PATH', '')}"


def _ts(sec):
    h, m, s = int(sec // 3600), int((sec % 3600) // 60), int(sec % 60)
    return f"{h:02d}:{m:02d}:{s:02d}"


def _safe_name(name):
    name = (name or "").strip()
    if not name:
        name = "hop-" + time.strftime("%Y%m%d-%H%M")
    return "".join(c if c.isalnum() or c in "-_" else "-" for c in name).strip("-")


# ---------- GHI ÂM ----------

PERSONAL_PROFILE = "Cá nhân"


def _safe_profile(profile):
    """Tên hồ sơ ngữ cảnh: chặn path traversal, giữ nguyên tiếng Việt."""
    p = (profile or "").strip()
    if not p or os.sep in p or p in (".", "..") or p.startswith("."):
        return None
    return p


def _profile_context_file(profile):
    """File ngữ cảnh của 1 hồ sơ: context.md (markdown, chuẩn mới);
    fallback glossary.yaml (tên cũ) cho hồ sơ tạo từ bản trước."""
    d = DATA / "profiles" / profile
    md = d / "context.md"
    return md if md.exists() else d / "glossary.yaml"


def _meeting_profiles(meta):
    """Danh sách hồ sơ ngữ cảnh của cuộc họp, đã chuẩn hoá.
    Tương thích ngược: khoá cũ 'profile' (1 công ty, cá nhân luôn kèm) và
    cuộc họp không có gì (mặc định = Cá nhân)."""
    profs = meta.get("profiles")
    if profs is None:
        legacy = _safe_profile(meta.get("profile"))
        profs = [PERSONAL_PROFILE] + ([legacy] if legacy else [])
    out = []
    for p in profs:
        sp = _safe_profile(p)
        if sp and sp not in out:
            out.append(sp)
    return out


def record_start(name, profiles=None):
    DATA.mkdir(parents=True, exist_ok=True)
    if STATE.exists():
        try:
            st = json.loads(STATE.read_text())
        except Exception:
            st = {}
        # "đang ghi" = CÒN tiến trình nào sống (mic là chính; syscap có thể chết mà mic vẫn ghi).
        # Chỉ kiểm st['pid'] sẽ báo nhầm "rảnh" khi leader chết nhưng mic còn -> để lọt mic mồ côi.
        old_pids = st.get("pids") or ([st["pid"]] if st.get("pid") else [])
        if any(p and _alive(p) for p in old_pids):
            print(f"Đang ghi cuộc '{st.get('name')}' rồi. Gõ 'kết thúc họp' để dừng trước đã.")
            return 1
    name = _safe_name(name)
    profiles = [p for p in (_safe_profile(x) for x in (profiles or [])) if p]
    out_dir = OUTPUT / name
    out_dir.mkdir(parents=True, exist_ok=True)
    started_ts = time.time()
    # Lưu thời điểm bắt đầu họp (lúc bấm Bắt đầu) - survive khi record-stop xoá STATE.
    # profiles = các hồ sơ ngữ cảnh của CUỘC HỌP này (Cá nhân/công ty...): quyết định
    # ngữ cảnh nào được gộp khi viết biên bản (không lẫn nội dung giữa các công ty).
    meta = {"started": started_ts}
    if profiles:
        meta["profiles"] = profiles
    (out_dir / "meeting.json").write_text(json.dumps(meta, ensure_ascii=False), encoding="utf-8")
    wav = out_dir / "audio.16k.wav"
    log = open(out_dir / "_record.log", "w")
    pids, mode, sys_failed = [], "mic", False

    # Tiền kiểm: thu thử mic ~1.2s, nếu im lặng tuyệt đối -> cảnh báo ngay (đừng mất cả buổi)
    mic_dev = os.environ.get("WZ_AUDIO_DEV") or f":{_mic_index()}"
    lvl = _probe_level(mic_dev)
    mic_silent = lvl is not None and lvl <= -80.0

    if _system_mode():
        # Tiếng hệ thống (Core Audio Tap) + mic (ffmpeg) song song, trộn khi dừng
        mode = "system"
        sysp = subprocess.Popen([str(_syscap_path()), str(out_dir / "system.wav")],
                                stdout=log, stderr=subprocess.STDOUT,
                                stdin=subprocess.DEVNULL, start_new_session=True)
        micp = subprocess.Popen(_mic_cmd(out_dir / "mic.wav"),
                                stdout=log, stderr=subprocess.STDOUT,
                                stdin=subprocess.DEVNULL, start_new_session=True)
        # syscap chết gần như tức thì (~<1s) nếu CHƯA cấp quyền "Ghi âm thanh
        # hệ thống" hoặc macOS < 14.2 (không có Process Tap API).
        # Phát hiện sớm để hạ xuống mic-only + cảnh báo, thay vì im lặng ghi thiếu tiếng.
        for _ in range(8):
            if sysp.poll() is not None:
                break
            time.sleep(0.1)
        if sysp.poll() is not None:
            # Bỏ syscap chết khỏi pids (mic là leader). Giữ mode="system" để record_stop
            # vẫn dựng audio.16k.wav từ mic.wav (nhánh 1-input của bước trộn).
            sys_failed = True
            pids = [micp.pid]
        else:
            pids = [sysp.pid, micp.pid]
    else:
        proc = subprocess.Popen(_mic_cmd(wav), stdout=log, stderr=subprocess.STDOUT,
                                stdin=subprocess.DEVNULL, start_new_session=True)
        pids = [proc.pid]

    STATE.write_text(json.dumps({"name": name, "pid": pids[0], "pids": pids,
                                 "mode": mode, "wav": str(wav), "started": started_ts}))
    sys_on = mode == "system" and not sys_failed
    print(f"🔴 ĐANG GHI cuộc họp: {name}" + (" (mic + tiếng hệ thống)" if sys_on else ""))
    if sys_failed:
        print("WARN_NOSYS: ⚠️ Không ghi được TIẾNG TRONG MÁY (chưa cấp quyền 'Ghi âm thanh "
              "hệ thống' hoặc macOS < 14.2). Đang ghi bằng mic. Mở Cài đặt hệ thống > "
              "Quyền riêng tư & Bảo mật > Ghi màn hình & âm thanh hệ thống, bật cho app "
              "rồi ghi lại để bắt được tiếng người họp online.")
    if mic_silent:
        print("WARN_SILENT: ⚠️ Mic KHÔNG có tín hiệu (thiết bị im lặng). "
              "Kiểm tra: mic có bị tắt? đúng mic chưa? đã cấp quyền Micro chưa? "
              "Nên DỪNG, sửa, rồi ghi lại để khỏi mất buổi họp.")
    print("   Họp xong gõ: kết thúc họp")
    return 0


def _list_audio():
    """Trả [(index, name)] các thiết bị audio đầu vào của avfoundation."""
    r = subprocess.run(["ffmpeg", "-hide_banner", "-f", "avfoundation",
                        "-list_devices", "true", "-i", ""],
                       capture_output=True, text=True)
    out = r.stderr + r.stdout
    devs, in_audio = [], False
    for line in out.splitlines():
        if "AVFoundation audio devices" in line:
            in_audio = True
            continue
        if in_audio:
            if "AVFoundation video devices" in line:
                break
            m = re.search(r"\[(\d+)\]\s*(.+?)\s*$", line)
            if m:
                devs.append((m.group(1), m.group(2)))
    return devs


def _mic_index(devs=None):
    """Index mic để TỰ CHỌN khi user chưa chỉ định (WZ_AUDIO_DEV trống).
    Bỏ qua thiết bị ảo (BlackHole/aggregate) VÀ mic Continuity của iPhone/iPad:
    iPhone ở gần Mac sẽ chen vào đầu danh sách avfoundation - tự vớ phải nó làm
    iPhone bật màn hình "đang được dùng làm micro" mỗi lần ghi. Ưu tiên mic tích
    hợp (MacBook/Built-in), rồi tới thiết bị hợp lệ đầu tiên. User chọn tay
    trong Cài đặt (kể cả iPhone) thì đi đường WZ_AUDIO_DEV, không qua đây."""
    devs = devs or _list_audio()
    skip = ("blackhole", "aggregate", "iphone", "ipad")
    ok = [(i, n) for i, n in devs if not any(s in n.lower() for s in skip)]
    # Lưu ý: tên Continuity theo TÊN RIÊNG của máy (vd "N Phone Microphone") nên
    # skip-list không bắt hết - ưu tiên built-in mới là lớp chặn chính.
    for idx, name in ok:
        if any(b in name.lower() for b in ("macbook", "built-in", "imac")):
            return idx
    if ok:
        return ok[0][0]
    return devs[0][0] if devs else "0"


def _probe_level(dev, secs=1.2):
    """Đo mức âm lượng trung bình (dB) của 1 thiết bị trong ~1.2s. None nếu lỗi.
    Dùng để cảnh báo SỚM nếu đang thu phải thiết bị im lặng (sai mic / mic tắt)."""
    try:
        r = subprocess.run(["ffmpeg", "-hide_banner", "-f", "avfoundation", "-i", dev,
                            "-t", str(secs), "-af", "volumedetect", "-f", "null", "-"],
                           capture_output=True, text=True, timeout=15)
        for line in (r.stderr + r.stdout).splitlines():
            m = re.search(r"mean_volume:\s*(-?[\d.]+) dB", line)
            if m:
                return float(m.group(1))
    except Exception:  # noqa: BLE001
        pass
    return None


def _syscap_path():
    """Đường dẫn binary bắt tiếng hệ thống (Core Audio Process Tap). None nếu không có."""
    for c in [HERE / "wz-syscap",
              HERE.parent / "native" / "wz-syscap",
              DATA / "engine" / "wz-syscap"]:
        if c.exists():
            return c
    return None


def _mic_cmd(wav):
    """Lệnh ffmpeg ghi mic -> wav 16k mono."""
    mic = os.environ.get("WZ_AUDIO_DEV") or f":{_mic_index()}"
    return ["ffmpeg", "-hide_banner", "-loglevel", "warning",
            "-f", "avfoundation", "-i", mic,
            "-ac", "1", "-ar", "16000", "-c:a", "pcm_s16le", str(wav)]


def _system_mode():
    return (DATA / ".system_audio").exists() and _syscap_path() is not None


def _alive(pid):
    # Chặn pid không hợp lệ: os.kill(-1, 0) KHÔNG raise (pid -1 = "mọi tiến trình")
    # nên nếu .state.json thiếu/hỏng key pid sẽ báo nhầm "đang ghi". Phải guard.
    if not pid or pid <= 0:
        return False
    try:
        os.kill(pid, 0)
        return True
    except OSError:
        return False


def record_stop(turbo=False, save_only=False):
    if not STATE.exists():
        print("Không có cuộc họp nào đang ghi.")
        return 1
    st = json.loads(STATE.read_text())
    name, wav = st["name"], Path(st["wav"])
    pids = st.get("pids") or [st.get("pid")]
    for pid in pids:
        if pid and _alive(pid):
            os.kill(pid, signal.SIGINT)
    for _ in range(60):
        if not any(p and _alive(p) for p in pids):
            break
        time.sleep(0.1)
    STATE.unlink(missing_ok=True)

    out_dir = OUTPUT / name
    if st.get("mode") == "system":
        # Trộn tiếng hệ thống + mic -> audio.16k.wav
        sysw, micw = out_dir / "system.wav", out_dir / "mic.wav"
        ins = [p for p in (sysw, micw) if p.exists() and p.stat().st_size > 1000]
        if len(ins) == 2:
            subprocess.run(["ffmpeg", "-y", "-hide_banner", "-loglevel", "error",
                            "-i", str(sysw), "-i", str(micw),
                            "-filter_complex", "amix=inputs=2:duration=longest:normalize=0",
                            "-ac", "1", "-ar", "16000", "-c:a", "pcm_s16le", str(wav)], check=False)
        elif ins:
            subprocess.run(["ffmpeg", "-y", "-hide_banner", "-loglevel", "error",
                            "-i", str(ins[0]), "-ac", "1", "-ar", "16000",
                            "-c:a", "pcm_s16le", str(wav)], check=False)

    size = wav.stat().st_size if wav.exists() else 0
    print(f"⏹  Đã dừng ghi: {name} ({size // 1024} KB)")
    if size < 5000:
        print("File ghi quá nhỏ - có thể chưa cấp quyền micro/ghi màn hình.")
        return 1
    if save_only:
        # Chỉ lưu audio - transcript/biên bản tạo sau bằng lệnh `transcribe` + `bienban`
        # (app desktop: dừng họp xong ghi cuộc mới được ngay, không phải đợi xử lý).
        print(f"✅ Đã lưu ghi âm.")
        print(f"OUTPUT_DIR={OUTPUT / name}")
        return 0
    print("Đang transcript (chạy local)...")
    _transcribe(name, turbo)
    _merge(name)
    out_dir = OUTPUT / name
    print(f"\n✅ Transcript xong -> {out_dir}/transcript.speakers.txt")
    print(f"OUTPUT_DIR={out_dir}")
    return 0


def transcribe_meeting(name, turbo=False):
    """Transcript + tách người nói cho cuộc họp ĐÃ CÓ audio.16k.wav
    (ghi bằng record-stop --save-only). Idempotent: chạy lại sẽ ghi đè transcript."""
    out_dir = OUTPUT / name
    if not (out_dir / "audio.16k.wav").exists():
        print("Chưa có file ghi âm (audio.16k.wav) cho cuộc họp này.")
        return 1
    print("Đang transcript (chạy local)...")
    _transcribe(name, turbo)
    _merge(name)
    print(f"\n✅ Transcript xong -> {out_dir}/transcript.speakers.txt")
    print(f"OUTPUT_DIR={out_dir}")
    return 0


IMPORT_EXTS = (".webm", ".m4a", ".mp3", ".wav")


def import_file(src, name=None):
    """Nhập một file ghi âm có sẵn (từ công cụ khác) -> tạo cuộc họp: giải mã ra
    audio.16k.wav, transcript + tách người nói, rồi DỪNG. Biên bản viết sau khi
    user bấm ở màn chi tiết (tái dùng luồng 'Viết lại biên bản')."""
    src_path = Path(src)
    if not src_path.is_file():
        print(f"Không tìm thấy file: {src}")
        return 1
    ext = src_path.suffix.lower()
    if ext not in IMPORT_EXTS:
        print(f"Định dạng không nhận: '{ext or src_path.name}'. "
              "Chỉ nhận file ghi âm .webm, .m4a, .mp3, .wav.")
        return 1
    # Tên cuộc họp theo file nguồn; trùng thư mục cũ -> thêm hậu tố giờ-phút-giây
    # để KHÔNG đè cuộc họp khác.
    name = _safe_name(name or src_path.stem)
    out_dir = OUTPUT / name
    if out_dir.exists():
        name = f"{name}-{time.strftime('%H%M%S')}"
        out_dir = OUTPUT / name
        while out_dir.exists():  # cực hiếm (cùng giây) - vẫn đảm bảo duy nhất
            name = f"{name}-x"
            out_dir = OUTPUT / name
    out_dir.mkdir(parents=True, exist_ok=True)
    # ffmpeg giải mã được cả 4 định dạng -> wav 16k mono (đúng chuẩn Whisper).
    wav = out_dir / "audio.16k.wav"
    r = subprocess.run(["ffmpeg", "-y", "-hide_banner", "-loglevel", "error",
                        "-i", str(src_path), "-ac", "1", "-ar", "16000",
                        "-c:a", "pcm_s16le", str(wav)], capture_output=True, text=True)
    size = wav.stat().st_size if wav.exists() else 0
    if r.returncode != 0 or size < 1000:
        print("Không đọc/giải mã được file ghi âm này. "
              + (r.stderr or "").strip()[-300:])
        return 1
    # started = thời điểm ghi GỐC (mtime file nguồn) để sắp xếp đúng theo lúc ghi;
    # lấy mtime lỗi -> dùng bây giờ. Không ghi profiles -> reader mặc định "Cá nhân".
    try:
        started = src_path.stat().st_mtime
    except OSError:
        started = time.time()
    (out_dir / "meeting.json").write_text(
        json.dumps({"started": started}, ensure_ascii=False), encoding="utf-8")
    print(f"OUTPUT_DIR={out_dir}")  # desktop bắt tên cuộc họp
    print("Đang transcript (chạy local)...")  # desktop chuyển sang bước transcribing
    _transcribe(name)
    _merge(name)
    print(f"\n✅ Transcript xong -> {out_dir}/transcript.speakers.txt")
    print(f"OUTPUT_DIR={out_dir}")
    return 0


# ---------- TRANSCRIPT ----------

def _transcribe(name, turbo=False):
    import mlx_whisper
    out_dir = OUTPUT / name
    wav = out_dir / "audio.16k.wav"
    model = MODEL_TURBO if turbo else MODEL_HQ
    result = mlx_whisper.transcribe(str(wav), path_or_hf_repo=model,
                                    language="vi", word_timestamps=True, verbose=False)
    segs = [{"start": s["start"], "end": s["end"], "text": s["text"].strip()}
            for s in result.get("segments", [])]
    (out_dir / "transcript.raw.json").write_text(
        json.dumps(segs, ensure_ascii=False, indent=2), encoding="utf-8")
    lines = [f"[{_ts(s['start'])} -> {_ts(s['end'])}] {s['text']}" for s in segs]
    (out_dir / "transcript.raw.txt").write_text("\n".join(lines), encoding="utf-8")
    return segs


def _speaker_for(seg, turns):
    best, best_ov = None, 0.0
    for t in turns:
        ov = min(seg["end"], t["end"]) - max(seg["start"], t["start"])
        if ov > best_ov:
            best_ov, best = ov, t["speaker"]
    return best


def _merge(name):
    out_dir = OUTPUT / name
    segs = json.loads((out_dir / "transcript.raw.json").read_text(encoding="utf-8"))
    diar = out_dir / "diarization.json"
    turns = json.loads(diar.read_text(encoding="utf-8")) if diar.exists() else []
    lines, last = [], None
    for s in segs:
        spk = _speaker_for(s, turns) if turns else None
        prefix = ""
        if spk and spk != last:
            prefix = f"\n[{spk}] "
            last = spk
        lines.append(f"{prefix}({_ts(s['start'])}) {s['text']}")
    (out_dir / "transcript.speakers.txt").write_text("\n".join(lines), encoding="utf-8")


def diarize(name, speakers=None):
    token = os.environ.get("HF_TOKEN") or os.environ.get("HUGGINGFACE_TOKEN")
    env = DATA / ".env"
    if not token and env.exists():
        for line in env.read_text().splitlines():
            if line.startswith("HF_TOKEN="):
                token = line.split("=", 1)[1].strip()
    if not token:
        print("Chưa bật tách người nói. Cần HF_TOKEN. Xem lệnh /biên-bản cài-đặt.")
        return 1
    out_dir = OUTPUT / name
    wav = out_dir / "audio.16k.wav"
    try:
        import soundfile as sf
        import torch
        from pyannote.audio import Pipeline
    except ImportError:
        print("Thiếu thư viện tách người nói. Cài thêm (1 lần):\n"
              "  source ~/wz-bien-ban/.venv/bin/activate\n"
              '  uv pip install torch "pyannote.audio>=3.1"')
        return 1
    pipe = Pipeline.from_pretrained("pyannote/speaker-diarization-3.1", use_auth_token=token)
    if torch.backends.mps.is_available():
        pipe.to(torch.device("mps"))
    data, sr = sf.read(str(wav), dtype="float32")
    wf = torch.from_numpy(data).unsqueeze(0)
    kw = {"num_speakers": speakers} if speakers else {}
    dz = pipe({"waveform": wf, "sample_rate": sr}, **kw)
    turns = [{"start": float(s.start), "end": float(s.end), "speaker": spk}
             for s, _, spk in dz.itertracks(yield_label=True)]
    (out_dir / "diarization.json").write_text(
        json.dumps(turns, ensure_ascii=False, indent=2), encoding="utf-8")
    _merge(name)
    print(f"Tách người nói xong: {len({t['speaker'] for t in turns})} người.")
    return 0


# ---------- PDF ----------

def export_pdf(name):
    from render import build_print_html
    out_dir = OUTPUT / name
    if not (out_dir / "bien-ban.md").exists():
        print("Chưa có bien-ban.md. Claude cần viết biên bản trước.")
        return 1
    html_path = build_print_html(out_dir)
    pdf_path = out_dir / "bien-ban.pdf"
    chrome = None
    for c in ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
              "/Applications/Chromium.app/Contents/MacOS/Chromium",
              "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
              "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser"]:
        if Path(c).exists():
            chrome = c
            break
    if not chrome:
        # Không có trình duyệt Chromium -> vẫn ra HTML để in tay (không fail)
        from render import build_viewer_html
        v = build_viewer_html(out_dir)
        print(f"Chưa có Chrome để tự xuất PDF. Đã tạo trang xem: {v}")
        print("Mở trang đó rồi In (Cmd+P) -> Save as PDF nếu cần file PDF.")
        subprocess.run(["open", str(v)], check=False)
        return 0
    subprocess.run([chrome, "--headless=new", "--disable-gpu", "--no-sandbox",
                    "--no-pdf-header-footer", "--print-to-pdf-no-header",
                    f"--print-to-pdf={pdf_path}", f"file://{html_path}"],
                   stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=False)
    # Xoá file print.html trung gian để không gây nhầm (mở nó bằng trình duyệt sẽ
    # thêm header/footer của trình duyệt). Chỉ giữ bien-ban.pdf sạch.
    try:
        Path(html_path).unlink()
    except OSError:
        pass
    if pdf_path.exists():
        print(f"✅ PDF: {pdf_path}")
        subprocess.run(["open", str(pdf_path)], check=False)
        return 0
    print("Render PDF thất bại.")
    return 1


def make_viewer(name):
    from render import build_viewer_html
    out_dir = OUTPUT / name
    p = build_viewer_html(out_dir)
    print(f"✅ Trang xem: {p}")
    subprocess.run(["open", str(p)], check=False)
    return 0


def _claude_bin():
    """Tìm CLI 'claude' (app mở từ Finder có PATH hẹp)."""
    c = shutil.which("claude")
    if c:
        return c
    for p in [Path.home() / ".local/bin/claude", Path("/opt/homebrew/bin/claude"),
              Path("/usr/local/bin/claude")]:
        if p.exists():
            return str(p)
    return None


def _meeting_glossary(out_dir):
    """Ngữ cảnh gộp vào prompt:
    1. bộ sửa lỗi chung của sản phẩm (cạnh engine)
    2. file cũ ~/wz-bien-ban/glossary.yaml nếu còn (tương thích bản trước)
    3. TẤT CẢ hồ sơ được chọn cho cuộc họp này (profiles/<tên>/glossary.yaml),
       ví dụ chọn "Cá nhân" + "DC" thì gộp cả hai - hồ sơ không chọn KHÔNG nạp."""
    try:
        meta = json.loads((out_dir / "meeting.json").read_text(encoding="utf-8"))
    except Exception:  # noqa: BLE001
        meta = {}
    gloss_files = [HERE / "glossary.yaml", DATA / "glossary.yaml"]
    gloss_files += [_profile_context_file(p) for p in _meeting_profiles(meta)]
    return "\n".join(g.read_text(encoding="utf-8") for g in gloss_files if g.exists())


def _run_claude(claude, prompt):
    """Gọi Claude Code headless, prompt qua stdin (transcript dài vượt ARG_MAX nếu qua argv).
    Trả Markdown đã ép bỏ em-dash (quy ước cứng), hoặc None kèm in lỗi."""
    env = dict(os.environ)
    env["PATH"] = f"{Path(claude).parent}{os.pathsep}{env.get('PATH','')}"
    r = subprocess.run([claude, "-p"], input=prompt, capture_output=True, text=True,
                       timeout=900, cwd=str(DATA), env=env)
    md = (r.stdout or "").strip()
    if not md:
        print("Claude không trả về nội dung:", (r.stderr or "")[-200:])
        return None
    return md.replace(" — ", " - ").replace("—", "-")


def write_bienban(name, no_pdf=False):
    """Tự viết biên bản từ transcript bằng Claude Code headless (subscription của user), rồi xuất PDF."""
    out_dir = OUTPUT / name
    tx_file = out_dir / "transcript.speakers.txt"
    if not tx_file.exists():
        print("Chưa có transcript.")
        return 1
    claude = _claude_bin()
    if not claude:
        print("NO_CLAUDE")  # app sẽ bảo user tự mở Claude
        return 2
    tx = tx_file.read_text(encoding="utf-8")
    glossary = _meeting_glossary(out_dir)
    try:
        import render
        started = render.fmt_meeting_time(out_dir)
    except Exception:  # noqa: BLE001
        started = ""
    time_line = (f"THỜI GIAN BẮT ĐẦU HỌP (dùng đúng giá trị này): {started}\n\n"
                 if started else "")
    prompt = (
        "Bạn là thư ký ghi biên bản họp. Dưới đây là transcript thô (tiếng Việt, có thể sai "
        "chính tả tên riêng/thuật ngữ) của một cuộc họp.\n\n"
        f"{time_line}"
        "NGỮ CẢNH & TỪ ĐIỂN (do người dùng cung cấp, dạng tự do: người tham gia, "
        "chức vụ, công ty, sản phẩm, từ hay bị nghe sai... Dùng để sửa tên "
        f"riêng/thuật ngữ và hiểu đúng nội dung họp):\n{glossary}\n\n"
        "YÊU CẦU: Viết BIÊN BẢN HỌP hoàn chỉnh bằng tiếng Việt, định dạng Markdown, gồm:\n"
        "# Tiêu đề (suy ra chủ đề)\n"
        "Ngay dưới tiêu đề ghi dòng: **Thời gian:** <thời gian bắt đầu họp ở trên>\n"
        "## 1. Tóm tắt (3-6 gạch đầu dòng)\n"
        "## 2. Action items (bảng Markdown: | Việc | Người phụ trách | Deadline |)\n"
        "## 3. Nội dung chính (theo chủ đề, không chép lại từng câu; "
        "mục con đánh số 3.1, 3.2...)\n"
        "## 4. Quyết định\n"
        "QUY ƯỚC: KHÔNG dùng gạch dài (em-dash); heading từ 2 câu thêm <br> sau câu đầu; "
        "bỏ các đoạn nhiễu (ký tự lặp vô nghĩa). CHỈ XUẤT MARKDOWN BIÊN BẢN, không thêm lời dẫn.\n\n"
        f"TRANSCRIPT:\n{tx}\n"
    )
    print("Đang viết biên bản bằng Claude...")
    md = _run_claude(claude, prompt)
    if md is None:
        return 1
    (out_dir / "bien-ban.md").write_text(md, encoding="utf-8")
    if no_pdf:
        print("✅ Đã viết biên bản.")
        return 0
    print("✅ Đã viết biên bản. Xuất PDF...")
    export_pdf(name)
    return 0


def revise_bienban(name):
    """Sửa biên bản theo yêu cầu tự do của user (đọc từ stdin) bằng Claude Code headless.
    Ghi đè bien-ban.md, KHÔNG xuất PDF - app nhắc user bấm Xuất PDF khi ưng ý."""
    out_dir = OUTPUT / name
    bb_file = out_dir / "bien-ban.md"
    if not bb_file.exists():
        print("Chưa có biên bản.")
        return 1
    claude = _claude_bin()
    if not claude:
        print("NO_CLAUDE")  # app sẽ bảo user tự cài Claude
        return 2
    feedback = sys.stdin.read().strip()
    if not feedback:
        print("Chưa có yêu cầu chỉnh sửa.")
        return 1
    md_now = bb_file.read_text(encoding="utf-8")
    tx_file = out_dir / "transcript.speakers.txt"
    tx = tx_file.read_text(encoding="utf-8") if tx_file.exists() else ""
    tx_block = (
        "TRANSCRIPT GỐC (chỉ để tham khảo khi cần bổ sung hoặc kiểm chứng chi tiết):\n"
        f"{tx}\n\n"
    ) if tx else ""
    prompt = (
        "Bạn là thư ký chỉnh sửa biên bản họp. Dưới đây là biên bản hiện tại (Markdown), "
        "ngữ cảnh, transcript gốc của cuộc họp và YÊU CẦU CHỈNH SỬA của người dùng.\n\n"
        "NGỮ CẢNH & TỪ ĐIỂN (do người dùng cung cấp, dạng tự do: người tham gia, "
        "chức vụ, công ty, sản phẩm, từ hay bị nghe sai... Dùng để sửa tên "
        f"riêng/thuật ngữ và hiểu đúng nội dung họp):\n{_meeting_glossary(out_dir)}\n\n"
        f"BIÊN BẢN HIỆN TẠI:\n{md_now}\n\n"
        f"{tx_block}"
        f"YÊU CẦU CHỈNH SỬA CỦA NGƯỜI DÙNG: {feedback}\n\n"
        "YÊU CẦU ĐẦU RA: Xuất lại TOÀN BỘ biên bản Markdown đã chỉnh sửa theo yêu cầu trên; "
        "giữ nguyên cấu trúc đề mục và mọi phần không liên quan đến yêu cầu.\n"
        "QUY ƯỚC: KHÔNG dùng gạch dài (em-dash); heading từ 2 câu thêm <br> sau câu đầu; "
        "bỏ các đoạn nhiễu (ký tự lặp vô nghĩa). CHỈ XUẤT MARKDOWN BIÊN BẢN, không thêm lời dẫn.\n"
    )
    print("Đang chỉnh sửa biên bản bằng Claude...")
    md = _run_claude(claude, prompt)
    if md is None:
        return 1
    bb_file.write_text(md, encoding="utf-8")
    print("✅ Đã chỉnh sửa biên bản.")
    return 0


def _wiki_notes():
    """Đọc mọi note trong DATA/wiki: {id: {title, tags, content, links}}.
    Frontmatter tối giản (title/tags) - đồng bộ định dạng với WikiStore.ts của app."""
    wiki = DATA / "wiki"
    notes = {}
    if not wiki.is_dir():
        return notes
    for f in sorted(wiki.glob("*.md")):
        try:
            raw = f.read_text(encoding="utf-8")
        except Exception:  # noqa: BLE001
            continue
        title, tags, content = f.stem, [], raw
        m = re.match(r"^---\n(.*?)\n---\n?", raw, re.DOTALL)
        if m:
            content = raw[m.end():]
            for line in m.group(1).splitlines():
                if line.startswith("title:"):
                    title = line[6:].strip() or f.stem
                elif line.startswith("tags:"):
                    tags = [t.strip().lstrip("#") for t in line[5:].split(",") if t.strip()]
        links = [t.strip() for t in re.findall(r"\[\[([^\]|#]+)\]\]", content)]
        notes[f.stem] = {"title": title, "tags": tags, "content": content,
                         "links": links, "mtime": f.stat().st_mtime}
    return notes


def wiki_ask():
    """Hỏi đáp trên Wiki: chấm điểm note theo từ khoá câu hỏi (title x3, tag x2,
    nội dung x1) lấy hạt giống, LAN 1 BƯỚC theo wikilink + backlink (knowledge graph)
    rồi đưa cho Claude trả lời. Dòng cuối in SOURCES=<id>|<id> cho app parse."""
    question = sys.stdin.read().strip()
    if not question:
        print("Chưa có câu hỏi.")
        return 1
    notes = _wiki_notes()
    if not notes:
        print("Wiki chưa có ghi chú nào.")
        return 1
    claude = _claude_bin()
    if not claude:
        print("NO_CLAUDE")
        return 2

    def resolve(target):
        t = target.strip().lower()
        for nid, n in notes.items():
            if n["title"].lower() == t or nid == t:
                return nid
        return None

    words = [w for w in re.split(r"[^\wàáảãạăằắẳẵặâầấẩẫậđèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộ"
                                 r"ơờớởỡợùúủũụưừứửữựỳýỷỹỵ]+", question.lower()) if len(w) >= 2]
    scores = {}
    for nid, n in notes.items():
        s = 0
        title, content = n["title"].lower(), n["content"].lower()
        for w in words:
            if w in title:
                s += 3
            if any(w in t.lower() for t in n["tags"]):
                s += 2
            s += min(content.count(w), 5)
        scores[nid] = s
    seeds = [nid for nid, s in sorted(scores.items(), key=lambda x: -x[1]) if s > 0][:8]
    if not seeds:  # không khớp từ khoá -> các note mới nhất
        seeds = [nid for nid, _ in sorted(notes.items(), key=lambda x: -x[1]["mtime"])][:8]

    # Lan 1 bước theo knowledge graph: note seed trỏ tới + note trỏ về seed
    chosen = list(seeds)
    for nid in seeds:
        for target in notes[nid]["links"]:
            rid = resolve(target)
            if rid and rid not in chosen:
                chosen.append(rid)
        for oid, other in notes.items():
            if oid not in chosen and any(resolve(t) == nid for t in other["links"]):
                chosen.append(oid)

    budget, parts = 60_000, []
    for nid in chosen:
        n = notes[nid]
        block = f"### [{nid}] {n['title']}" + (f" (tags: {', '.join(n['tags'])})" if n["tags"] else "") + f"\n{n['content'].strip()}\n"
        if budget - len(block) < 0:
            break
        budget -= len(block)
        parts.append(block)

    prompt = (
        "Bạn là trợ lý tra cứu wiki cá nhân. Dưới đây là các GHI CHÚ liên quan "
        "(mỗi ghi chú bắt đầu bằng '### [id] tiêu đề') và CÂU HỎI của người dùng.\n\n"
        "GHI CHÚ:\n" + "\n".join(parts) + "\n"
        f"CÂU HỎI: {question}\n\n"
        "YÊU CẦU: Trả lời bằng tiếng Việt, định dạng Markdown, DỰA TRÊN các ghi chú ở trên "
        "(thiếu thông tin thì nói rõ là wiki chưa có). KHÔNG dùng gạch dài (em-dash). "
        "Dòng CUỐI CÙNG in đúng định dạng: SOURCES=<id>|<id> gồm id các ghi chú "
        "bạn đã thực sự dùng để trả lời (không thêm gì sau dòng này).\n"
    )
    md = _run_claude(claude, prompt)
    if md is None:
        return 1
    print(md)
    return 0


def _slugify(title):
    """Slug tên file từ title (đồng bộ logic với WikiStore.ts)."""
    import unicodedata
    s = unicodedata.normalize("NFD", title)
    s = "".join(c for c in s if not unicodedata.combining(c))
    s = s.replace("đ", "d").replace("Đ", "D").lower()
    s = re.sub(r"[^a-z0-9]+", "-", s).strip("-")
    return s or "ghi-chu"


def wiki_note(name):
    """Chắt nội dung cuộc họp thành 1 ghi chú Wiki theo yêu cầu user (stdin).
    Ghi file vào DATA/wiki cùng định dạng frontmatter với WikiStore.ts của app."""
    out_dir = OUTPUT / name
    request = sys.stdin.read().strip()
    if not request:
        print("Chưa có yêu cầu.")
        return 1
    bb_file = out_dir / "bien-ban.md"
    tx_file = out_dir / "transcript.speakers.txt"
    bb = bb_file.read_text(encoding="utf-8") if bb_file.exists() else ""
    tx = tx_file.read_text(encoding="utf-8")[:50_000] if tx_file.exists() else ""
    if not bb and not tx:
        print("Cuộc họp chưa có biên bản hay transcript.")
        return 1
    claude = _claude_bin()
    if not claude:
        print("NO_CLAUDE")
        return 2
    prompt = (
        "Bạn là trợ lý tri thức. Từ nội dung cuộc họp dưới đây, CHẮT LỌC phần người "
        "dùng yêu cầu thành MỘT ghi chú wiki hoàn chỉnh, TỰ ĐỨNG ĐƯỢC (đọc lại sau này "
        "không cần nhớ ngữ cảnh cuộc họp), tiếng Việt.\n\n"
        f"YÊU CẦU CỦA NGƯỜI DÙNG: {request}\n\n"
        + (f"BIÊN BẢN CUỘC HỌP:\n{bb}\n\n" if bb else "")
        + (f"TRANSCRIPT:\n{tx}\n\n" if tx else "")
        + "ĐẦU RA đúng format sau, KHÔNG thêm lời dẫn:\n"
        "TITLE: <tiêu đề ngắn gọn cho ghi chú>\n"
        "TAGS: <2-4 tag chữ thường, phân cách dấu phẩy>\n"
        "CONTENT:\n"
        "<nội dung markdown; heading/bullet thoải mái; KHÔNG lặp lại tiêu đề; "
        "KHÔNG dùng gạch dài (em-dash)>\n"
    )
    print("Đang chắt nội dung thành ghi chú Wiki...")
    md = _run_claude(claude, prompt)
    if md is None:
        return 1
    tm = re.search(r"^TITLE:\s*(.+)$", md, re.MULTILINE)
    gm = re.search(r"^TAGS:\s*(.+)$", md, re.MULTILINE)
    cm = re.search(r"^CONTENT:\s*\n", md, re.MULTILINE)
    if not tm or not cm:
        print("Claude trả về sai định dạng:", md[:200])
        return 1
    title = tm.group(1).strip().strip('"')
    tags = [t.strip().lstrip("#") for t in (gm.group(1) if gm else "").split(",") if t.strip()]
    content = md[cm.end():].strip() + f"\n\n---\n_Nguồn: cuộc họp {name}_\n"
    wiki = DATA / "wiki"
    wiki.mkdir(parents=True, exist_ok=True)
    base = _slugify(title)
    nid, i = base, 2
    while (wiki / f"{nid}.md").exists():
        nid, i = f"{base}-{i}", i + 1
    (wiki / f"{nid}.md").write_text(
        f"---\ntitle: {title}\ntags: {', '.join(tags)}\nupdated: {int(time.time())}\n---\n{content}",
        encoding="utf-8")
    print(f"NOTE_ID={nid}")
    print(f"NOTE_TITLE={title}")
    return 0


def generate_title(name):
    """Sinh TIÊU ĐỀ HIỂN THỊ ngắn cho cuộc họp (thư mục giữ nguyên tên):
    ưu tiên H1 của bien-ban.md (tức thì, không tốn AI - biên bản đã là bản tóm tắt);
    chưa có biên bản thì nhờ Claude đặt từ đoạn đầu transcript.
    Ghi vào meeting.json khoá 'title', in TITLE=... cho app parse."""
    out_dir = OUTPUT / name
    if not out_dir.is_dir():
        print("Không thấy cuộc họp.")
        return 1
    title = None
    bb = out_dir / "bien-ban.md"
    if bb.exists():
        for line in bb.read_text(encoding="utf-8").splitlines():
            if line.startswith("# "):
                # bỏ tiền tố "Biên bản họp - " các biến thể để lấy phần chủ đề
                t = re.sub(r"^biên bản(\s+cuộc)?(\s+họp)?\s*[-:–]?\s*", "",
                           line[2:].strip(), flags=re.IGNORECASE).strip()
                title = t or line[2:].strip()
                break
    if not title:
        tx_file = out_dir / "transcript.speakers.txt"
        if not tx_file.exists():
            print("Chưa có biên bản hay transcript để đặt tiêu đề.")
            return 1
        claude = _claude_bin()
        if not claude:
            print("NO_CLAUDE")
            return 2
        excerpt = tx_file.read_text(encoding="utf-8")[:6000]
        prompt = ("Đặt TIÊU ĐỀ ngắn gọn (5-10 từ, tiếng Việt CÓ ĐẦY ĐỦ DẤU, không dấu "
                  "câu ở cuối, không ngoặc kép) tóm tắt chủ đề chính của cuộc họp từ "
                  "transcript dưới đây. CHỈ IN RA TIÊU ĐỀ, không thêm lời dẫn.\n\n"
                  f"TRANSCRIPT (đoạn đầu):\n{excerpt}\n")
        print("Đang đặt tiêu đề bằng Claude...")
        md = _run_claude(claude, prompt)
        if not md:
            return 1
        title = md.strip().splitlines()[0].strip().strip('"').strip()
    if not title:
        print("Không sinh được tiêu đề.")
        return 1
    mj = out_dir / "meeting.json"
    try:
        meta = json.loads(mj.read_text(encoding="utf-8"))
    except Exception:  # noqa: BLE001
        meta = {}
    meta["title"] = title
    mj.write_text(json.dumps(meta, ensure_ascii=False), encoding="utf-8")
    print(f"TITLE={title}")
    return 0


# ---------- TIỆN ÍCH ----------

def list_meetings():
    """In JSON danh sách cuộc họp (cho app desktop): mới nhất trước."""
    items = []
    if OUTPUT.exists():
        for d in OUTPUT.iterdir():
            if not d.is_dir():
                continue
            started, meta = None, {}
            mj = d / "meeting.json"
            if mj.exists():
                try:
                    meta = json.loads(mj.read_text(encoding="utf-8"))
                    started = meta.get("started")
                except Exception:  # noqa: BLE001
                    pass
            duration = None
            rj = d / "transcript.raw.json"
            if rj.exists():
                try:
                    segs = json.loads(rj.read_text(encoding="utf-8"))
                    duration = segs[-1]["end"] if segs else 0
                except Exception:  # noqa: BLE001
                    pass
            items.append({
                "name": d.name,
                "started": started,
                "title": meta.get("title"),
                "profiles": _meeting_profiles(meta),
                "duration": duration,
                "has_audio": (d / "audio.16k.wav").exists(),
                "has_transcript": (d / "transcript.speakers.txt").exists(),
                "has_bienban": (d / "bien-ban.md").exists(),
                "has_pdf": (d / "bien-ban.pdf").exists(),
            })
    items.sort(key=lambda x: x["started"] or 0, reverse=True)
    print(json.dumps(items, ensure_ascii=False))
    return 0


def list_devices():
    """In JSON thiết bị audio đầu vào (cho app desktop chọn mic)."""
    print(json.dumps([{"index": i, "name": n} for i, n in _list_audio()],
                     ensure_ascii=False))
    return 0


def print_html(name):
    """Chỉ build print.html (không Chrome, không mở) - app desktop tự render PDF."""
    from render import build_print_html
    out_dir = OUTPUT / name
    if not (out_dir / "bien-ban.md").exists():
        print("Chưa có bien-ban.md. Claude cần viết biên bản trước.")
        return 1
    p = build_print_html(out_dir)
    print(f"PRINT_HTML={p}")
    return 0


def status():
    if STATE.exists():
        st = json.loads(STATE.read_text())
        if _alive(st.get("pid", -1)):
            mins = (time.time() - st["started"]) / 60
            print(f"🔴 Đang ghi: {st['name']} ({mins:.1f} phút)")
            return 0
    print("Không có cuộc họp nào đang ghi.")
    return 0


def check():
    ok = True
    for mod in ["mlx_whisper"]:
        try:
            __import__(mod)
        except ImportError:
            print(f"Thiếu: {mod}"); ok = False
    if not shutil.which("ffmpeg"):
        print("Thiếu: ffmpeg (sẽ tự dùng bản đóng gói imageio-ffmpeg khi chạy)")
    print("✅ Sẵn sàng." if ok else "Chưa đủ - chạy /cai-dat.")
    return 0 if ok else 1


def main():
    args = sys.argv[1:]
    if not args:
        print(__doc__); return 1
    cmd, rest = args[0], args[1:]
    if cmd in ("record-start", "record-stop", "import-file", "check", "devices"):
        ensure_ffmpeg()  # đảm bảo ffmpeg sẵn (dùng bản pip nếu máy chưa có)
    if cmd == "record-start":
        # record-start [tên] [--profile <hồ-sơ>]... (lặp lại để chọn nhiều hồ sơ)
        profs, pos, i = [], [], 0
        while i < len(rest):
            if rest[i] == "--profile" and i + 1 < len(rest):
                profs.append(rest[i + 1])
                i += 2
            else:
                pos.append(rest[i])
                i += 1
        return record_start(pos[0] if pos else None, profs)
    if cmd == "record-stop":
        return record_stop("--turbo" in rest, save_only="--save-only" in rest)
    if cmd == "transcribe":
        if not rest:
            print("Thiếu tên cuộc họp. Dùng: wz.py transcribe <tên>")
            return 1
        ensure_ffmpeg()
        return transcribe_meeting(rest[0], "--turbo" in rest)
    if cmd == "import-file":
        if not rest:
            print("Thiếu đường dẫn file. Dùng: wz.py import-file <file> [tên]")
            return 1
        return import_file(rest[0], rest[1] if len(rest) > 1 else None)
    if cmd == "bienban":
        return write_bienban(rest[0], no_pdf="--no-pdf" in rest)
    if cmd == "revise":
        return revise_bienban(rest[0])
    if cmd == "title":
        return generate_title(rest[0])
    if cmd == "wiki-ask":
        return wiki_ask()
    if cmd == "wiki-note":
        return wiki_note(rest[0])
    if cmd == "pdf":
        return export_pdf(rest[0])
    if cmd == "print-html":
        return print_html(rest[0])
    if cmd == "list":
        return list_meetings()
    if cmd == "devices":
        return list_devices()
    if cmd == "viewer":
        return make_viewer(rest[0])
    if cmd == "diarize":
        n = rest[0]
        spk = int(rest[1]) if len(rest) > 1 else None
        return diarize(n, spk)
    if cmd == "status":
        return status()
    if cmd == "check":
        return check()
    print(f"Lệnh không hợp lệ: {cmd}\n{__doc__}")
    return 1


if __name__ == "__main__":
    sys.path.insert(0, str(HERE))
    raise SystemExit(main())

#!/usr/bin/env python3
"""WZ Biên Bản - engine WINDOWS (BETA). Cùng giao thức CLI/marker với wz.py
(xem desktop/ENGINE-PROTOCOL.md) nên app desktop dùng lại nguyên vẹn.

Khác biệt nền tảng, phần còn lại TÁI DÙNG wz.py qua import + monkeypatch:
- Ghi âm: WASAPI qua pyaudiowpatch - mic + loopback tiếng hệ thống (không cần
  driver ảo, không cần quyền đặc biệt). Recorder là tiến trình con detached;
  DỪNG bằng file cờ `.stop` trong thư mục cuộc họp (Windows không gửi SIGINT
  cho tiến trình detached được).
- Transcribe: faster-whisper (CPU int8) thay mlx-whisper (chỉ có trên Apple
  Silicon) - ghi transcript.raw.json/raw.txt đúng format wz.py rồi wz._merge.
- _alive: os.kill(pid, 0) trên Windows KHÔNG phải liveness check (0 là
  CTRL_C_EVENT) -> dùng OpenProcess/GetExitCodeProcess.
- ffmpeg: copy binary của imageio-ffmpeg thành ffmpeg.exe trong DATA/bin và
  prepend PATH (macOS dùng symlink - Windows cần quyền admin mới symlink được).
"""
import ctypes
import json
import os
import subprocess
import sys
import time
import wave
from pathlib import Path

# Pipe stdout trên Windows mặc định cp1252 -> emoji/tiếng Việt trong marker crash.
for _s in (sys.stdout, sys.stderr):
    try:
        _s.reconfigure(encoding="utf-8", errors="replace")
    except Exception:  # noqa: BLE001
        pass

sys.path.insert(0, str(Path(__file__).resolve().parent))
import wz  # noqa: E402 - engine gốc, tái dùng list/bienban/revise/title/wiki/print-html...

DATA, OUTPUT, STATE = wz.DATA, wz.OUTPUT, wz.STATE
# Model đổi được qua env để test nhanh (tiny) - mặc định chất lượng cao nhất.
FW_MODEL = os.environ.get("WZ_FW_MODEL", "large-v3")
FW_MODEL_TURBO = os.environ.get("WZ_FW_MODEL_TURBO", "large-v3-turbo")
STILL_ACTIVE = 259
PROCESS_QUERY_LIMITED_INFORMATION = 0x1000


def _alive(pid):
    if not pid or int(pid) <= 0:
        return False
    if os.name != "nt":  # chạy thử trên máy khác Windows (dev/test)
        try:
            os.kill(int(pid), 0)
            return True
        except OSError:
            return False
    k = ctypes.windll.kernel32
    h = k.OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, False, int(pid))
    if not h:
        return False
    code = ctypes.c_ulong()
    ok = k.GetExitCodeProcess(h, ctypes.byref(code))
    k.CloseHandle(h)
    return bool(ok) and code.value == STILL_ACTIVE


def _ensure_ffmpeg():
    """Đảm bảo lệnh `ffmpeg` gọi được (wz.py và cả file này đều spawn "ffmpeg").
    Copy binary imageio-ffmpeg -> DATA/bin/ffmpeg.exe (1 lần) rồi prepend PATH."""
    import shutil
    if shutil.which("ffmpeg"):
        return
    import imageio_ffmpeg
    src = Path(imageio_ffmpeg.get_ffmpeg_exe())
    bin_dir = DATA / "bin"
    bin_dir.mkdir(parents=True, exist_ok=True)
    dst = bin_dir / ("ffmpeg.exe" if os.name == "nt" else "ffmpeg")
    if not dst.exists():
        shutil.copyfile(src, dst)
        if os.name != "nt":
            dst.chmod(0o755)
    os.environ["PATH"] = f"{bin_dir}{os.pathsep}{os.environ.get('PATH', '')}"


def _transcribe_fw(name, turbo=False):
    """faster-whisper thay wz._transcribe (mlx) - cùng chữ ký, cùng format output."""
    from faster_whisper import WhisperModel
    out_dir = OUTPUT / name
    wav = out_dir / "audio.16k.wav"
    model = WhisperModel(FW_MODEL_TURBO if turbo else FW_MODEL,
                         device="cpu", compute_type="int8")
    segments, _info = model.transcribe(str(wav), language="vi", vad_filter=True)
    segs = [{"start": round(s.start, 2), "end": round(s.end, 2), "text": s.text.strip()}
            for s in segments if s.text.strip()]
    (out_dir / "transcript.raw.json").write_text(
        json.dumps(segs, ensure_ascii=False, indent=2), encoding="utf-8")
    lines = [f"[{wz._ts(s['start'])} -> {wz._ts(s['end'])}] {s['text']}" for s in segs]
    (out_dir / "transcript.raw.txt").write_text("\n".join(lines), encoding="utf-8")
    return segs


# Các lệnh delegate cho wz.main() (list, import-file, transcribe, status, bienban,
# revise, title, wiki-*, print-html...) sẽ dùng đúng bản Windows của 3 điểm này.
wz._alive = _alive
wz._transcribe = _transcribe_fw
wz.ensure_ffmpeg = _ensure_ffmpeg


# ---------- GHI ÂM (WASAPI qua pyaudiowpatch) ----------

def _rec(out_dir):
    """Tiến trình ghi thật (detached): mic.wav + system.wav (loopback).
    Dừng khi thấy file `.stop`. Thiết bị hỏng -> ghi file cờ .nomic/.nosys để
    record-start báo user (WARN_NOSYS / lỗi mic)."""
    import pyaudiowpatch as pyaudio
    out_dir = Path(out_dir)
    stop_flag = out_dir / ".stop"
    stop_flag.unlink(missing_ok=True)
    pa = pyaudio.PyAudio()
    opened = []  # (wave_writer, stream)

    def open_capture(dev_info, path):
        rate = int(dev_info["defaultSampleRate"])
        ch = max(1, min(2, int(dev_info["maxInputChannels"])))
        wf = wave.open(str(path), "wb")
        wf.setnchannels(ch)
        wf.setsampwidth(2)  # paInt16
        wf.setframerate(rate)

        def cb(in_data, _frames, _t, _status):
            wf.writeframes(in_data)
            return (None, pyaudio.paContinue)

        st = pa.open(format=pyaudio.paInt16, channels=ch, rate=rate, input=True,
                     input_device_index=int(dev_info["index"]),
                     frames_per_buffer=1024, stream_callback=cb)
        opened.append((wf, st))

    # Mic: WZ_AUDIO_DEV=":<index>" (quy ước chung với macOS) hoặc mic mặc định
    mic_sel = (os.environ.get("WZ_AUDIO_DEV") or "").lstrip(":").strip()
    try:
        mic = (pa.get_device_info_by_index(int(mic_sel)) if mic_sel
               else pa.get_default_input_device_info())
        open_capture(mic, out_dir / "mic.wav")
    except Exception as e:  # noqa: BLE001
        (out_dir / ".nomic").write_text(str(e), encoding="utf-8")
    # Tiếng hệ thống: loopback của loa mặc định (chỉ khi user bật cờ chung)
    if (DATA / ".system_audio").exists():
        try:
            lb = pa.get_default_wasapi_loopback()
            open_capture(lb, out_dir / "system.wav")
        except Exception as e:  # noqa: BLE001
            (out_dir / ".nosys").write_text(str(e), encoding="utf-8")
    if not opened:
        pa.terminate()
        return 1
    try:
        while not stop_flag.exists():
            time.sleep(0.2)
    finally:
        for wf, st in opened:
            try:
                st.stop_stream()
                st.close()
                wf.close()
            except Exception:  # noqa: BLE001
                pass
        pa.terminate()
        stop_flag.unlink(missing_ok=True)
    return 0


def record_start(name, profiles=None):
    DATA.mkdir(parents=True, exist_ok=True)
    if STATE.exists():
        try:
            st = json.loads(STATE.read_text())
        except Exception:  # noqa: BLE001
            st = {}
        old_pids = st.get("pids") or ([st["pid"]] if st.get("pid") else [])
        if any(p and _alive(p) for p in old_pids):
            print(f"Đang ghi cuộc '{st.get('name')}' rồi. Gõ 'kết thúc họp' để dừng trước đã.")
            return 1
    name = wz._safe_name(name)
    profiles = [p for p in (wz._safe_profile(x) for x in (profiles or [])) if p]
    out_dir = OUTPUT / name
    out_dir.mkdir(parents=True, exist_ok=True)
    for f in (".stop", ".nomic", ".nosys"):
        (out_dir / f).unlink(missing_ok=True)
    started_ts = time.time()
    meta = {"started": started_ts}
    if profiles:
        meta["profiles"] = profiles
    (out_dir / "meeting.json").write_text(json.dumps(meta, ensure_ascii=False), encoding="utf-8")

    log = open(out_dir / "_record.log", "w", encoding="utf-8")
    flags = 0
    if os.name == "nt":
        # detached + không cửa sổ console: ghi âm sống sót khi app thoát/crash
        flags = (subprocess.DETACHED_PROCESS | subprocess.CREATE_NEW_PROCESS_GROUP
                 | subprocess.CREATE_NO_WINDOW)
    proc = subprocess.Popen([sys.executable, str(Path(__file__).resolve()), "_rec", str(out_dir)],
                            stdout=log, stderr=subprocess.STDOUT,
                            stdin=subprocess.DEVNULL, creationflags=flags,
                            start_new_session=(os.name != "nt"))
    # Recorder mở thiết bị trong ~1.5s: kiểm tra cờ lỗi + tiến trình còn sống
    time.sleep(1.5)
    if (out_dir / ".nomic").exists() and not (out_dir / "system.wav").exists():
        print("Không mở được micro. Kiểm tra quyền Micro trong Settings > Privacy của Windows.")
        return 1
    if not _alive(proc.pid):
        print("Không bắt đầu ghi được (recorder thoát sớm). Xem log: "
              f"{out_dir / '_record.log'}")
        return 1
    wav = out_dir / "audio.16k.wav"
    STATE.write_text(json.dumps({"name": name, "pid": proc.pid, "pids": [proc.pid],
                                 "mode": "system", "wav": str(wav), "started": started_ts}))
    sys_on = (DATA / ".system_audio").exists() and not (out_dir / ".nosys").exists()
    print(f"🔴 ĐANG GHI cuộc họp: {name}" + (" (mic + tiếng hệ thống)" if sys_on else ""))
    if (out_dir / ".nosys").exists():
        print("WARN_NOSYS: ⚠️ Không ghi được TIẾNG TRONG MÁY (WASAPI loopback lỗi). "
              "Đang ghi bằng mic - tiếng người họp online có thể không rõ.")
    if (out_dir / ".nomic").exists():
        print("WARN_SILENT: ⚠️ Không mở được micro - chỉ ghi được tiếng trong máy. "
              "Kiểm tra quyền Micro trong Settings > Privacy.")
    print("   Họp xong gõ: kết thúc họp")
    return 0


def record_stop(turbo=False, save_only=False):
    if not STATE.exists():
        print("Không có cuộc họp nào đang ghi.")
        return 1
    st = json.loads(STATE.read_text())
    name, wav = st["name"], Path(st["wav"])
    out_dir = OUTPUT / name
    pids = st.get("pids") or [st.get("pid")]
    # DỪNG bằng file cờ - recorder poll 0.2s và tự đóng wav sạch sẽ
    (out_dir / ".stop").write_text("", encoding="utf-8")
    for _ in range(100):  # tối đa 10s
        if not any(p and _alive(p) for p in pids):
            break
        time.sleep(0.1)
    for p in pids:  # còn sống (treo) -> ép dừng
        if p and _alive(p):
            if os.name == "nt":
                subprocess.run(["taskkill", "/PID", str(p), "/F"], capture_output=True)
            else:
                os.kill(int(p), 9)
    STATE.unlink(missing_ok=True)

    _ensure_ffmpeg()
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
        print("File ghi quá nhỏ - có thể chưa cấp quyền micro.")
        return 1
    if save_only:
        print("✅ Đã lưu ghi âm.")
        print(f"OUTPUT_DIR={out_dir}")
        return 0
    print("Đang transcript (chạy local)...")
    _transcribe_fw(name, turbo)
    wz._merge(name)
    print(f"\n✅ Transcript xong -> {out_dir}/transcript.speakers.txt")
    print(f"OUTPUT_DIR={out_dir}")
    return 0


def list_devices():
    """Input WASAPI (bỏ loopback) - JSON {index, name} như wz.py devices."""
    import pyaudiowpatch as pyaudio
    pa = pyaudio.PyAudio()
    out = []
    try:
        try:
            wasapi = pa.get_host_api_info_by_type(pyaudio.paWASAPI)["index"]
        except Exception:  # noqa: BLE001
            wasapi = None
        for i in range(pa.get_device_count()):
            d = pa.get_device_info_by_index(i)
            if d.get("maxInputChannels", 0) <= 0 or d.get("isLoopbackDevice"):
                continue
            if wasapi is not None and d.get("hostApi") != wasapi:
                continue  # mỗi thiết bị hiện 1 lần (bỏ bản sao MME/DirectSound)
            out.append({"index": str(i), "name": d["name"]})
    finally:
        pa.terminate()
    print(json.dumps(out, ensure_ascii=False))
    return 0


def check():
    ok = True
    for mod in ["faster_whisper", "imageio_ffmpeg"]:
        try:
            __import__(mod)
        except ImportError:
            print(f"Thiếu: {mod}")
            ok = False
    if os.name == "nt":
        try:
            __import__("pyaudiowpatch")
        except ImportError:
            print("Thiếu: pyaudiowpatch")
            ok = False
    print("✅ Sẵn sàng." if ok else "Chưa đủ - mở lại app để cài tiếp.")
    return 0 if ok else 1


def main():
    args = sys.argv[1:]
    if not args:
        print(__doc__)
        return 1
    cmd, rest = args[0], args[1:]
    if cmd == "_rec":
        return _rec(rest[0])
    if cmd == "record-start":
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
    if cmd == "devices":
        return list_devices()
    if cmd == "check":
        return check()
    # Còn lại (list, transcribe, import-file, bienban, revise, title, wiki-ask,
    # wiki-note, print-html, status, pdf...) delegate wz.main() - đã monkeypatch
    # _alive/_transcribe/ensure_ffmpeg nên chạy đúng trên Windows.
    return wz.main()


if __name__ == "__main__":
    raise SystemExit(main())

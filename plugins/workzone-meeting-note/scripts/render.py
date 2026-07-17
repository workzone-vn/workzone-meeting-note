#!/usr/bin/env python3
"""Render biên bản + transcript ra HTML (xem) và HTML in (cho PDF). Brand WZ."""
import html
import json
import re
from pathlib import Path


def _ts(sec):
    h, m, s = int(sec // 3600), int((sec % 3600) // 60), int(sec % 60)
    return f"{h:02d}:{m:02d}:{s:02d}" if h else f"{m:02d}:{s:02d}"


_VN_WEEKDAY = ["Thứ Hai", "Thứ Ba", "Thứ Tư", "Thứ Năm", "Thứ Sáu", "Thứ Bảy", "Chủ Nhật"]


def fmt_meeting_time(out_dir):
    """Thời gian bắt đầu họp (lúc bấm Bắt đầu) dạng '13h30 Thứ Tư, ngày 24/06/2026'.
    Trả '' nếu không có dữ liệu."""
    import datetime
    f = out_dir / "meeting.json"
    if not f.exists():
        return ""
    try:
        ts = json.loads(f.read_text(encoding="utf-8")).get("started")
        dt = datetime.datetime.fromtimestamp(float(ts))
        return f"{dt:%Hh%M} {_VN_WEEKDAY[dt.weekday()]}, ngày {dt:%d/%m/%Y}"
    except Exception:  # noqa: BLE001
        return ""


def clean_noise(text):
    """Lọc nhiễu hallucination của Whisper. Trả về (text, is_noise)."""
    tokens = text.split()
    if not tokens:
        return text, True
    collapsed, i, n = [], 0, len(tokens)
    while i < n:
        j = i
        while j < n and tokens[j].lower() == tokens[i].lower():
            j += 1
        if j - i >= 4:
            collapsed.extend([tokens[i], "…"])
        else:
            collapsed.extend(tokens[i:j])
        i = j
    new_text = " ".join(collapsed).strip()
    if len(tokens) >= 5 and len(set(t.lower() for t in tokens)) <= 2:
        return new_text, True
    if not [t for t in collapsed if t != "…" and len(t) > 1]:
        return new_text, True
    return new_text, False


def _md_inline(s):
    s = html.escape(s)
    s = re.sub(r"\*\*(.+?)\*\*", r"<strong>\1</strong>", s)
    s = re.sub(r"`(.+?)`", r"<code>\1</code>", s)
    # quy ước biên bản dùng <br> để xuống dòng -> trả lại thẻ thật sau khi escape
    s = re.sub(r"&lt;br\s*/?&gt;", "<br>", s, flags=re.IGNORECASE)
    return s


def md_to_html(md):
    out, i, lines = [], 0, md.splitlines()
    n = len(lines)
    while i < n:
        line = lines[i]
        if not line.strip():
            i += 1; continue
        if line.lstrip().startswith("|"):
            rows = []
            while i < n and lines[i].lstrip().startswith("|"):
                rows.append(lines[i]); i += 1
            cells = [[c.strip() for c in r.strip().strip("|").split("|")] for r in rows]
            cells = [r for r in cells if not all(set(c) <= set("-: ") for c in r)]
            if cells:
                out.append('<div class="tbl-wrap"><table><thead><tr>'
                           + "".join(f"<th>{_md_inline(c)}</th>" for c in cells[0])
                           + "</tr></thead><tbody>")
                for r in cells[1:]:
                    out.append("<tr>" + "".join(f"<td>{_md_inline(c)}</td>" for c in r) + "</tr>")
                out.append("</tbody></table></div>")
            continue
        m = re.match(r"^(#{1,6})\s+(.*)", line)
        if m:
            lvl = len(m.group(1))
            out.append(f"<h{lvl}>{_md_inline(m.group(2))}</h{lvl}>"); i += 1; continue
        if line.lstrip().startswith(">"):
            buf = []
            while i < n and lines[i].lstrip().startswith(">"):
                buf.append(lines[i].lstrip()[1:].strip()); i += 1
            out.append(f"<blockquote>{_md_inline(' '.join(buf))}</blockquote>"); continue
        if re.match(r"^\s*[-*]\s+", line) or re.match(r"^\s*\d+\.\s+", line):
            ordered = bool(re.match(r"^\s*\d+\.\s+", line))
            tag = "ol" if ordered else "ul"
            out.append(f"<{tag}>")
            while i < n and (re.match(r"^\s*[-*]\s+", lines[i]) or re.match(r"^\s*\d+\.\s+", lines[i])):
                out.append(f"<li>{_md_inline(re.sub(r'^\s*([-*]|\d+\.)\s+', '', lines[i]))}</li>"); i += 1
            out.append(f"</{tag}>"); continue
        if line.strip() == "---":
            out.append("<hr>"); i += 1; continue
        buf = [line]; i += 1
        while i < n and lines[i].strip() and not re.match(r"^(#{1,6}\s|\s*[-*]\s|\s*\d+\.\s|\||>|---)", lines[i]):
            buf.append(lines[i]); i += 1
        out.append(f"<p>{_md_inline(' '.join(buf))}</p>")
    return "\n".join(out)


def _load(out_dir):
    segs = json.loads((out_dir / "transcript.raw.json").read_text(encoding="utf-8"))
    bb = (out_dir / "bien-ban.md")
    bb_md = bb.read_text(encoding="utf-8") if bb.exists() else "*(Chưa có biên bản)*"
    return segs, bb_md


def _title(out_dir):
    return out_dir.name.replace("-", " ").title()


def build_viewer_html(out_dir: Path) -> Path:
    segs, bb_md = _load(out_dir)
    rows = []
    for s in segs:
        t, noise = clean_noise(s["text"])
        if noise:
            continue
        rows.append(f'<div class="line" data-text="{html.escape(t.lower())}">'
                    f'<span class="ts">{_ts(s["start"])}</span>'
                    f'<span class="tx">{html.escape(t)}</span></div>')
    started = fmt_meeting_time(out_dir)
    started_html = f'<span>🕒 <b>{html.escape(started)}</b></span>' if started else ""
    page = _VIEWER.replace("{{TITLE}}", html.escape(_title(out_dir))) \
                 .replace("{{STARTED}}", started_html) \
                 .replace("{{DURATION}}", _ts(segs[-1]["end"]) if segs else "00:00") \
                 .replace("{{COUNT}}", str(len(rows))) \
                 .replace("{{BIENBAN}}", md_to_html(bb_md)) \
                 .replace("{{TRANSCRIPT}}", "\n".join(rows))
    p = out_dir / "viewer.html"
    p.write_text(page, encoding="utf-8")
    return p


def build_print_html(out_dir: Path) -> Path:
    segs, bb_md = _load(out_dir)
    rows = []
    for s in segs:
        t, noise = clean_noise(s["text"])
        if noise:
            continue
        rows.append(f'<div class="line"><span class="ts">{_ts(s["start"])}</span>'
                    f'<span class="tx">{html.escape(t)}</span></div>')
    started = fmt_meeting_time(out_dir)
    started_html = f"Thời gian <b>{html.escape(started)}</b> &middot; " if started else ""
    page = _PRINT.replace("{{TITLE}}", html.escape(_title(out_dir))) \
                 .replace("{{STARTED}}", started_html) \
                 .replace("{{DURATION}}", _ts(segs[-1]["end"]) if segs else "00:00") \
                 .replace("{{COUNT}}", str(len(rows))) \
                 .replace("{{BIENBAN}}", md_to_html(bb_md)) \
                 .replace("{{TRANSCRIPT}}", "\n".join(rows))
    p = out_dir / "print.html"
    p.write_text(page, encoding="utf-8")
    return p


_VIEWER = r"""<title>Biên bản: {{TITLE}}</title>
<style>
  :root{--navy:#1c3d6e;--azure:#2f7fd1;--azure-soft:#eaf2fc;--ground:#f6f8fc;
    --surface:#fff;--text:#26303f;--muted:#6b7c91;--border:#e2e9f3;--ts:#3a6fb0}
  *{box-sizing:border-box}
  body{margin:0;background:var(--ground);color:var(--text);
    font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif;line-height:1.6}
  .wrap{max-width:840px;margin:0 auto;padding:0 20px 80px}
  header.top{background:linear-gradient(135deg,var(--navy),#244e8a);color:#fff;padding:34px 0 28px}
  .head-in{max-width:840px;margin:0 auto;padding:0 20px}
  .eyebrow{font-size:.72rem;letter-spacing:.14em;text-transform:uppercase;color:#aecbf0;font-weight:600;margin-bottom:10px}
  h1.title{font-size:clamp(1.5rem,3.2vw,2.1rem);line-height:1.18;margin:0 0 18px;font-weight:700;text-wrap:balance}
  .meta{display:flex;flex-wrap:wrap;gap:10px 22px;font-size:.9rem;color:#cdddf3}
  .meta b{color:#fff;font-variant-numeric:tabular-nums}
  .tabs{position:sticky;top:0;z-index:5;background:var(--surface);border-bottom:1px solid var(--border);padding:0 20px}
  .tabs .inner{max-width:840px;margin:0 auto;display:flex;gap:4px}
  .tab{appearance:none;background:none;border:none;font:inherit;cursor:pointer;padding:15px 16px 13px;
    color:var(--muted);font-weight:600;border-bottom:2.5px solid transparent}
  .tab:hover{color:var(--navy)}
  .tab[aria-selected="true"]{color:var(--navy);border-bottom-color:var(--azure)}
  .tab:focus-visible{outline:2px solid var(--azure);outline-offset:2px}
  .panel{display:none;padding-top:26px}.panel.active{display:block}
  .searchbar{position:relative;margin-bottom:18px}
  .searchbar input{width:100%;padding:12px 14px 12px 40px;font:inherit;border:1px solid var(--border);border-radius:10px}
  .searchbar input:focus{outline:none;border-color:var(--azure);box-shadow:0 0 0 3px var(--azure-soft)}
  .searchbar svg{position:absolute;left:13px;top:50%;transform:translateY(-50%);width:17px;height:17px;color:var(--muted)}
  .count{font-size:.82rem;color:var(--muted);margin:0 0 14px 2px}
  .line{display:grid;grid-template-columns:62px 1fr;gap:14px;padding:7px 10px;border-radius:8px}
  .line:hover{background:var(--azure-soft)}.line.hidden{display:none}
  .ts{color:var(--ts);font-variant-numeric:tabular-nums;font-size:.82rem;font-family:ui-monospace,Menlo,monospace;padding-top:3px;user-select:none}
  .tx mark{background:#fde68a;border-radius:2px}
  .noresult{color:var(--muted);padding:30px 4px;display:none}
  .doc{background:var(--surface);border:1px solid var(--border);border-radius:16px;padding:30px 34px}
  .doc h1{font-size:1.5rem;color:var(--navy);margin:.2em 0 .5em}
  .doc h2{font-size:1.18rem;color:var(--navy);margin:1.5em 0 .5em;padding-top:.3em;border-top:1px solid var(--border)}
  .doc h2:first-of-type{border-top:none}
  .doc h3{font-size:1.02rem;color:var(--azure);margin:1.3em 0 .4em}
  .doc ul,.doc ol{padding-left:1.4em}.doc blockquote{margin:1em 0;padding:12px 16px;background:var(--azure-soft);border-left:3px solid var(--azure);border-radius:0 8px 8px 0}
  .tbl-wrap{overflow-x:auto;margin:1em 0}
  .doc table{border-collapse:collapse;width:100%;font-size:.92rem;min-width:480px}
  .doc th{background:var(--navy);color:#fff;text-align:left;padding:9px 12px}
  .doc td{padding:9px 12px;border-bottom:1px solid var(--border);vertical-align:top}
  .doc tbody tr:nth-child(even){background:#fafbfe}
  .foot{margin-top:30px;font-size:.8rem;color:var(--muted);text-align:center}
  @media (prefers-reduced-motion:reduce){*{transition:none!important}}
  @media(max-width:520px){.doc{padding:22px 18px}.line{grid-template-columns:54px 1fr;gap:10px}}
</style>
<header class="top"><div class="head-in">
  <div class="eyebrow">Biên bản cuộc họp · Claude Recorder</div>
  <h1 class="title">{{TITLE}}</h1>
  <div class="meta">{{STARTED}}<span>⏱ <b>{{DURATION}}</b></span><span>💬 <b>{{COUNT}}</b> đoạn lời</span></div>
</div></header>
<nav class="tabs"><div class="inner" role="tablist">
  <button class="tab" role="tab" aria-selected="true" id="t1" onclick="show(1)">Transcript</button>
  <button class="tab" role="tab" aria-selected="false" id="t2" onclick="show(2)">Biên bản</button>
</div></nav>
<div class="wrap">
  <section class="panel active" id="p1" role="tabpanel">
    <div class="searchbar"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>
    <input type="search" id="q" placeholder="Tìm trong transcript..." autocomplete="off"></div>
    <p class="count" id="c"></p><div id="lines">{{TRANSCRIPT}}</div>
    <p class="noresult" id="nr">Không tìm thấy đoạn nào khớp.</p>
  </section>
  <section class="panel" id="p2" role="tabpanel"><article class="doc">{{BIENBAN}}</article></section>
  <p class="foot">Tạo bằng Claude Recorder · Whisper large-v3 (local). Transcript là bản thô.</p>
</div>
<script>
  function show(n){var a=n===1;p1.classList.toggle('active',a);p2.classList.toggle('active',!a);
    t1.setAttribute('aria-selected',a);t2.setAttribute('aria-selected',!a);scrollTo({top:0});}
  var L=[].slice.call(document.querySelectorAll('#lines .line')),T=L.length,C=document.getElementById('c');
  function sc(n){C.textContent=n===T?T+' đoạn':n+' / '+T+' đoạn khớp';}sc(T);
  function esc(s){return s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');}
  document.getElementById('q').addEventListener('input',function(e){
    var q=e.target.value.trim().toLowerCase(),sh=0,re=q?new RegExp('('+esc(q)+')','gi'):null;
    L.forEach(function(el){var hit=!q||el.getAttribute('data-text').indexOf(q)!==-1;
      el.classList.toggle('hidden',!hit);var tx=el.querySelector('.tx');
      if(hit){sh++;tx.innerHTML=re?tx.textContent.replace(re,'<mark>$1</mark>'):tx.textContent;}});
    sc(sh);document.getElementById('nr').style.display=sh===0?'block':'none';});
</script>
"""

_PRINT = r"""<!doctype html><html lang="vi"><head><meta charset="utf-8"><title>Bien ban {{TITLE}}</title>
<style>
  @page{size:A4;margin:16mm 16mm}
  *{box-sizing:border-box}html{-webkit-print-color-adjust:exact;print-color-adjust:exact}
  body{margin:0;color:#26303f;font-family:"Helvetica Neue",Arial,"Arial Unicode MS",sans-serif;font-size:11pt;line-height:1.55}
  h1,h2,h3{color:#1c3d6e;text-wrap:balance}
  .doc h1{font-size:18pt;line-height:1.25;margin:0 0 .4em}
  .doc h2{font-size:13pt;margin:1.1em 0 .4em;padding-top:.35em;border-top:1px solid #e2e9f3;break-after:avoid}
  .doc h2:first-of-type{border-top:none}
  .doc h3{font-size:11.5pt;color:#2f7fd1;margin:.9em 0 .3em;break-after:avoid}
  .doc ul,.doc ol{margin:.4em 0;padding-left:1.4em}.doc li{margin:.2em 0}
  .doc blockquote{margin:.8em 0;padding:8px 12px;background:#eaf2fc;border-left:3px solid #2f7fd1;color:#37506f;font-size:.92em;break-inside:avoid}
  .doc code{background:#eef1f6;padding:1px 4px;border-radius:3px;font-size:.9em}
  .doc hr{border:none;border-top:1px solid #e2e9f3;margin:1.2em 0}.doc em{color:#6b7c91}
  table{border-collapse:collapse;width:100%;font-size:10pt;margin:.6em 0}
  th{background:#1c3d6e;color:#fff;text-align:left;padding:6px 9px}
  td{padding:6px 9px;border-bottom:1px solid #e2e9f3;vertical-align:top}
  tbody tr{break-inside:avoid}tbody tr:nth-child(even){background:#fafbfe}
  .cover{border-bottom:1px solid #e2e9f3;padding-bottom:12px;margin-bottom:16px}
  .eyebrow{font-size:8pt;letter-spacing:.14em;text-transform:uppercase;color:#2f7fd1;font-weight:700;margin-bottom:6px}
  .cover h1{font-size:19pt;color:#1c3d6e;margin:0 0 8px;line-height:1.25}
  .cover .meta{font-size:9.5pt;color:#6b7c91}.cover .meta b{color:#26303f;font-variant-numeric:tabular-nums}
  .section-break{break-before:page}
  .tr-head h2{font-size:14pt;color:#1c3d6e;border:none;margin:0 0 2px}
  .tr-head .sub{font-size:9pt;color:#6b7c91}
  .line{display:grid;grid-template-columns:54px 1fr;gap:12px;padding:2.5px 0;font-size:10pt;break-inside:avoid}
  .ts{color:#3a6fb0;font-variant-numeric:tabular-nums;font-size:8.5pt;font-family:"SF Mono",Menlo,monospace;padding-top:2px}
</style></head><body>
  <div class="doc">
    <div class="cover">
      <div class="eyebrow">Biên bản cuộc họp</div>
      <h1>{{TITLE}}</h1>
      <div class="meta">{{STARTED}}Thời lượng <b>{{DURATION}}</b> &middot; <b>{{COUNT}}</b> đoạn lời</div>
    </div>{{BIENBAN}}</div>
  <div class="section-break"></div>
  <div class="tr-head"><h2>Transcript chi tiết</h2>
    <div class="sub">Bản ghi thô theo thời gian (đã lọc nhiễu), giữ nguyên lời nói chưa biên tập.</div></div>
  <div>{{TRANSCRIPT}}</div>
</body></html>
"""

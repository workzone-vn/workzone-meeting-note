# Electron Desktop App — tiến độ

## RELEASE (2026-07-17): v0.12.1 lên GitHub Releases
https://github.com/workzone-vn/workzone-meeting-note/releases/tag/v0.12.1
- [x] Rà soát bundle: extraResources chỉ wz.py/render.py/glossary.yaml(generic)/server.py/wz-syscap/tray; mount DMG quét chuỗi riêng tư -> SẠCH; dữ liệu user nằm ngoài app (~/wz-bien-ban tạo trên từng máy, trống)
- [x] Gợi ý khởi tạo ngữ cảnh: Home banner khi chưa có context.md ("Viết ngữ cảnh" -> Cài đặt / "Để sau" nhớ localStorage); glossaryGet trả exists; comment "N Phone" đổi generic
- [x] Push main + tag v0.12.1, gh release create kèm DMG + SHA-256 + hướng dẫn xattr (app chưa ký)
- [ ] WINDOWS: CHƯA build được bản chạy thật - engine hiện macOS-only (mlx-whisper cần Apple Silicon, ghi âm avfoundation, wz-syscap Core Audio tap). Cần dự án riêng: wz-win.py (WASAPI loopback + faster-whisper), seam đã để sẵn ở desktop/ENGINE-PROTOCOL.md + paths.ts. Đã ghi rõ trong release notes.
- [ ] Ký + notarize DMG khi có Apple Developer ID (bớt cảnh báo Gatekeeper)

## TÍNH NĂNG (2026-07-17): Chat tạo Wiki từ cuộc họp + sửa tay title + tìm kiếm cuộc họp — v0.11.0
Spec: `docs/superpowers/specs/2026-07-17-wiki-from-meeting-design.md`. Gồm 3 phần (2 phần sau user bổ sung giữa chừng):
- [x] Trợ lý biên bản 2 chế độ pill [Sửa biên bản|Lưu Wiki]; engine `wiki-note <tên>` (stdin yêu cầu) -> Claude trả TITLE:/TAGS:/CONTENT: -> ghi file wiki cùng format WikiStore + footer nguồn cuộc họp, in NOTE_ID/NOTE_TITLE; IPC meetings:wikiNote
- [x] Sửa tay tiêu đề cuộc họp: nút bút chì cạnh ✦ -> input (Enter/blur lưu, Esc huỷ, trống = về tên thư mục); meetings:setTitle ghi meeting.json
- [x] Tìm cuộc họp: ô search ở trang Cuộc họp, khớp title + tên thư mục + NỘI DUNG bien-ban.md (meetings:search đọc file phía main, debounce 250ms, kết hợp lọc ngữ cảnh)
- [x] Verify: E2E wiki-note trên cuộc họp giả - note sinh đúng format, _wiki_notes parse được (title/tags chuẩn); typecheck + build pass; bỏ nút copy title (v0.10.1, yêu cầu trước đó)
- [x] Cài v0.11.0, engine sync
- [ ] User thử: chat "Lưu Wiki", sửa title bằng bút chì, tìm kiếm cuộc họp

## TÍNH NĂNG (2026-07-17): Xuất PDF ghi chú Wiki — v0.12.0
Nút "Xuất PDF" ở trang ghi chú: renderer render markdown (mdToHtml + wikilink) gửi HTML qua IPC `wiki:exportPdf`; main bọc template in A4 (title + meta tag/ngày, CSS navy đồng bộ brand) -> save dialog (mặc định ~/Downloads/<title>.pdf) -> PdfService.renderPdf (tái dùng printToPDF) -> showItemInFolder. Typecheck + build pass, cài v0.12.0.
- [ ] User thử xuất PDF 1 ghi chú

## TÍNH NĂNG (2026-07-17): Wiki + Knowledge Graph (Obsidian-style) — v0.10.0
Spec: `docs/superpowers/specs/2026-07-17-wiki-knowledge-graph-design.md` (đã duyệt). Take note khi học online -> đọc lại/tra cứu bằng AI. User chốt: danh sách phẳng + tag + tìm kiếm (không cây trang), chỉ tab Wiki (không tray quick-note), AI trả lời + chip nguồn; bổ sung wikilink [[...]], backlinks, graph view, AI lan theo graph.
- [x] Lưu trữ: file .md thường tại ~/wz-bien-ban/wiki/ frontmatter title/tags/updated; id = slug filename ổn định
- [x] Main WikiStore.ts (fs thuần): list/get/create/save/delete/resolve, backlinks, extract wikilink; 7 IPC wiki:*
- [x] Engine `wz.py wiki-ask` (stdin): chấm điểm từ khoá (title x3/tag x2/content x1) -> seed -> LAN 1 BƯỚC wikilink+backlink -> claude -p, dòng cuối SOURCES=id|id
- [x] UI tab Wiki (icon Notebook): danh sách + tìm + lọc tag + ô Hỏi AI (answer markdown + chip nguồn); trang note render wikilink bấm được (mờ = chưa có, bấm tạo mới) + backlinks + editor; WikiGraph canvas force-directed tự viết (node note xám/tag xanh, kéo/hover/bấm)
- [x] Verify: E2E wiki-ask wiki giả 4 note - trả lời đúng, SOURCES gồm note lan theo link, không dính note ngoài lề; câu hỏi rỗng/wiki rỗng exit 1; typecheck + build pass
- [x] Cài v0.10.0, engine sync
- [ ] User thử: tạo note, gõ [[...]], xem graph, hỏi AI

## TÍNH NĂNG (2026-07-17): Nút ✦ sinh tiêu đề từ nội dung — v0.9.1
Title = TIÊU ĐỀ HIỂN THỊ trong meeting.json (user chốt: KHÔNG rename thư mục - giữ liên kết Tasks/PDF ổn định). Engine `wz.py title <tên>`: có bien-ban.md -> lấy H1 bỏ tiền tố "Biên bản họp -" (tức thì, 0 token); chỉ có transcript -> claude -p đặt title (prompt phải ghi "CÓ ĐẦY ĐỦ DẤU" - không thì Claude trả không dấu); NO_CLAUDE exit 2. IPC meetings:generateTitle; list/getMeeting trả title; header MeetingDetail + danh sách Meetings hiện `title || titleCase(name)`; nút ✦ cạnh nút copy, spinner khi chạy.
- [x] Verify: nhánh H1 tức thì đúng ("Đồng bộ tiến độ & Dọn dẹp Issue trên GitLab"), nhánh Claude có dấu đủ; list trả title; typecheck pass
- [x] Cài v0.9.1, engine sync
- [ ] User xác nhận nút ✦ trên app

## TÍNH NĂNG (2026-07-17): Ghi âm trước, xử lý sau (record-first) — v0.9.0
Spec: `docs/superpowers/specs/2026-07-17-record-first-process-later-design.md` (đã duyệt). Kết thúc họp = CHỈ dừng + lưu audio (~1s), ghi cuộc mới được NGAY (kể cả ghi lỗi bỏ đi ghi lại); transcript + biên bản là hành động chủ động, pipeline chạy NỀN không chặn UI, mỗi lúc 1 cuộc. Không có setting auto (user chốt).
- [x] Engine: `record-stop --save-only`, `transcribe <tên>`, `list` + has_audio (additive; plugin/MCP giữ record-stop cũ)
- [x] Main: `stopAndSave()` ngoài pipeline; `processMeeting()` origin 'process'; retryMinutes guard không stomp cuộc khác; recorderStop await lưu + trả tên; IPC meetings:process {started, busyWith}; tray không khoá ghi khi pipeline bận, ưu tiên đồng hồ ghi hơn ⏳
- [x] UI: App bỏ chặn Home, banner nền (đang chạy/xong/lỗi) mọi tab + "Xem tiến trình" (viewProgress); Home "Đang lưu..." + notice [Tạo biên bản ngay][Mở cuộc họp]; Processing ẩn bước Dừng ghi với origin process + nút "← Về màn ghi âm" + retry transcribe; Meetings nút "Tạo biên bản"/spinner theo pipeline event; MeetingDetail nút "Tạo transcript & biên bản" + tự reload khi pipeline xong
- [x] Verify: E2E cách ly - stop save-only ~1s có audio.16k.wav không transcript; record-start cuộc 2 NGAY OK; transcribe theo yêu cầu ra đúng câu TTS; list has_audio đúng; typecheck pass
- [x] Cài v0.9.0 vào /Applications, engine copy sync
- [ ] User xác nhận luồng mới (dừng → ghi lại ngay; tạo biên bản từ danh sách/chi tiết/notice)

## FIX QUYỀN (2026-07-16): wz-syscap bỏ ScreenCaptureKit -> Core Audio Process Tap (v0.8.0)
Spec: `docs/superpowers/specs/2026-07-16-coreaudio-tap-design.md`. Vấn đề: app xin quyền "Ghi màn hình" chỉ để lấy system audio -> chỉ báo tím + iPhone Mirroring cảnh báo mỗi lần ghi. Giải pháp (học từ nexus/AudioTee): CATapDescription tap toàn cục -> aggregate device ẩn -> IOProc ghi WAV; quyền TCC "Ghi âm thanh hệ thống" (NSAudioCaptureUsageDescription), macOS 14.2+; máy cũ tự hạ mic-only (WARN_NOSYS sẵn có). Giữ nguyên contract CLI nên wz.py/pipeline không đổi logic.
- [x] Viết lại native/wz-syscap.swift (tap) + build lại binary, giữ marker/SIGINT contract
- [x] electron-builder.yml: NSScreenCaptureUsageDescription -> NSAudioCaptureUsageDescription
- [x] permissions.ts: bỏ check quyền screen; SettingsStore: marker mới `audioPermProbed` để bản cài cũ probe lại 1 lần (prompt hiện lúc mở app, không rơi vào giữa buổi ghi đầu)
- [x] Chữ UI/message: Home banner, Settings, WARN_NOSYS wz.py, comments, ENGINE-PROTOCOL.md
- [x] Verify: chạy syscap trực tiếp (WAV f32/48k/stereo, max -8.9dB, SIGINT exit 0); E2E record-start/stop cách ly - 2 pid sống, TTS qua loa vào transcript đúng nguyên câu; typecheck+build; Info.plist bản gói đúng quyền; binary bundle khớp
- [x] Cài v0.8.0 vào /Applications, engine copy ~/wz-bien-ban/engine đã sync
- [ ] User xác nhận: lần ghi tới không còn chỉ báo tím / iPhone không báo; prompt quyền mới đã Cho phép

## FIX MIC (2026-07-17): auto-chọn mic vớ phải iPhone Continuity (v0.8.1)
User vẫn thấy iPhone "báo" sau v0.8.0 -> debug: KHÔNG phải screen recording nữa; ảnh iPhone = màn hình Continuity Microphone "Connected to N's MacBook Pro... remove this iPhone from the Mac microphone list". Root cause: `audioDeviceIndex=null` -> `_mic_index()` chọn thiết bị avfoundation ĐẦU TIÊN; iPhone ở gần Mac chen vào index 0 ("N Phone Microphone" - tên riêng, không có chữ iPhone!) -> mỗi lần ghi kích hoạt mic iPhone. Buổi 18:55 hôm trước xác nhận tap mới chạy sạch (WZ_SYSCAP_STARTED, không lỗi SCK).
- [x] TDD: test _mic_index 8 case (iPhone đầu list, BlackHole, USB, tên riêng "N Phone", iMac...) - fail trước, pass sau
- [x] Fix `_mic_index`: skip iphone/ipad + ƯU TIÊN mic built-in (macbook/built-in/imac) - lớp chặn chính vì tên Continuity theo tên riêng máy; user chọn tay trong Cài đặt vẫn đi đường WZ_AUDIO_DEV
- [x] Verify live: devices = [N Phone(0), MacBook(1), AirPods(2)] -> pick :1
- [x] Build v0.8.1
- [x] Cài vào /Applications (đợi hop-20260717-1338 ghi + pipeline xong mới quit app; monitor lần 1 báo nhầm idle vì sandbox chặn kill -0 -> monitor lại bằng wz.py status), app chạy v0.8.1, engine ~/wz-bien-ban/engine đã sync
- [ ] User xác nhận iPhone không hiện màn hình micro khi ghi

## TÍNH NĂNG (2026-07-16): Chat AI sửa biên bản (Trợ lý biên bản)
Spec: `docs/superpowers/specs/2026-07-16-revise-chat-design.md` (đã duyệt). Floating button + popover chat ở MeetingDetail tab Biên bản; mỗi lượt nhắn = 1 lần `claude -p` viết lại bien-ban.md. Không tự xuất PDF, không hoàn tác, chat không lưu file.
- [x] wz.py: helper `_meeting_glossary(out_dir)` + `_run_claude()` dùng chung + lệnh `revise <name>` (stdin = yêu cầu sửa)
- [x] ENGINE-PROTOCOL.md: ghi lệnh `revise`
- [x] EngineService.runStreaming: thêm tham số `stdin?` (+ nuốt EPIPE khi engine thoát sớm)
- [x] ipc-contract + types: `meetings:revise`, `ReviseResult`
- [x] ipc.ts: handler revise (guard 1 yêu cầu/cuộc họp, NO_CLAUDE, timeout 20p)
- [x] preload: `meetingsRevise(name, feedback)`
- [x] icons.tsx: thêm Sparkle + PaperPlaneTilt (Phosphor duotone chính gốc)
- [x] ReviseChat.tsx + CSS (fab, popover, bubble, chip, spinner)
- [x] MeetingDetail: gắn ReviseChat ở tab Biên bản
- [x] Kiểm chứng: E2E engine revise trên cuộc họp giả (WZ_DATA_DIR cách ly) - bổ sung mục 3.2 + quyết định đúng từ transcript, phần khác giữ nguyên, exit 0; stdin rỗng/không có biên bản -> exit 1; typecheck + build pass
- [x] Bump 0.6.0→0.7.0, dist:mac:unsigned, verify asar có "Trợ lý biên bản" + engine có revise, cài /Applications, app chạy v0.7.0

**Review:** Tính năng thuần additive: engine thêm 1 lệnh (tái dùng logic glossary/claude tách thành helper, `write_bienban` không đổi hành vi), 1 IPC mới, 1 component UI. Chưa kiểm tra bằng mắt popover trong app thật (user tự bấm thử ở màn chi tiết cuộc họp, tab Biên bản, nút tròn ✦ góc dưới-phải).

---
## BUG FIX (2026-07-13): Nút Record "không có gì xảy ra"

**Root cause** (từ `~/wz-bien-ban/output/hop-20260713-1104/_record.log`):
- Mặc định ghi mic + tiếng hệ thống → `record-start` chạy `wz-syscap` (ScreenCaptureKit) làm `pids[0]` + ffmpeg mic `pids[1]`.
- Chưa cấp quyền "Ghi màn hình" → `wz-syscap` chết ngay (`SCStreamErrorDomain Code=-3801`).
- Desktop `isRecording()` chỉ kiểm `st.pid` (= syscap đã chết) → báo "không ghi" dù mic còn sống → UI không lật sang trạng thái đang ghi → "không có gì xảy ra".
- `record-start` trả về thành công, không phát hiện syscap chết → ffmpeg mic bị bỏ rơi, ghi mãi.

**Quyết định (user):** thiếu quyền → hạ xuống mic-only + cảnh báo (không chặn). Bản ghi hỏng đang chạy → dừng & xoá. [XONG]

**Plan:**
- [x] Dọn ffmpeg mồ côi + xoá cuộc họp hỏng + xoá state cũ (live cleanup)
- [ ] wz.py `record_start`: phát hiện syscap chết ngay (poll ~0.8s) → bỏ pid chết, giữ mode="system" (record_stop tự dựng từ mic.wav), in `WARN_NOSYS`
- [ ] wz.py `record_start`: guard dùng any-pid-alive (nhất quán với `status`)
- [ ] EngineService.ts `isRecording()`: any-pid-alive trên `st.pids` (khớp wz.py) — fix chính
- [ ] ipc.ts `recorderStart`: trả `warnNoSystemAudio` từ `WARN_NOSYS`
- [ ] preload: thêm `warnNoSystemAudio` vào kiểu trả về + IPC `openScreenRecordingPrefs`
- [ ] Home.tsx: banner khi mất tiếng hệ thống + nút mở cài đặt Ghi màn hình
- [ ] Settings.tsx: nút mở/cấp quyền Ghi màn hình cạnh công tắc tiếng hệ thống

**Verify:**
- [ ] E2E engine: chạy `record-start` (quyền vẫn bị từ chối) → có WARN_NOSYS + state pids=[mic] + mic đang ghi; rồi `record-stop`
- [ ] `isRecording()` mới trả recording:true với state thật
- [ ] `npm run typecheck` + `npm run build` pass
- [ ] Rebuild app để user test (gộp 1 lần sau khi làm tính năng import file ghi âm ngoài)

## TÍNH NĂNG (2026-07-13): Nhập file ghi âm ngoài → tạo cuộc họp
Spec: `docs/superpowers/specs/2026-07-13-import-recording-design.md`. Quyết định: chỉ transcribe (biên bản deferred), nhận webm/m4a/mp3/wav, nút ở màn Cuộc họp, tự đặt tên theo file + hồ sơ mặc định Cá nhân, tái dùng màn Processing rồi tự mở chi tiết.
- [x] Engine wz.py `import-file`: validate đuôi/tồn tại, tên duy nhất, ffmpeg→audio.16k.wav, meeting.json(started=mtime), transcribe+merge, DỪNG
- [x] IPC importFile + preload + PipelineState.origin + importAndProcess + dialog handler
- [x] Meetings.tsx nút "⬆ Nhập file ghi âm"; App.tsx lật tab + tự mở chi tiết khi done (ref once); Processing.tsx chế độ import
- [x] Verify: E2E file demo .webm (audio.16k.wav 28MB, transcript.raw/.speakers, started=mtime, exit0); sai định dạng/thiếu file→exit1; trùng tên→hậu tố; typecheck+build pass
- [x] Đã review tay code subagent (engine + importAndProcess + App effects) — đúng spec, không đụng bug-fix cũ
- [x] Rebuild app để user test (gộp cả bug fix + tính năng này) → `Claude Recorder-0.2.0-arm64.dmg`
## TÍNH NĂNG (2026-07-14): Duotone icons
Spec `docs/superpowers/specs/2026-07-14-duotone-icons-design.md`. Thay toàn bộ emoji + ký hiệu (🎙️📄✅⚙️🌙☀️⚠️🔊🎤🗑⬆📁🔒🗄↩ ● ■ ＋ ✓ ☑ + toolbar MeetingDetail ✏️🔁📋⏱💬) bằng Phosphor Duotone (MIT) nhúng sẵn (offline), fill=currentColor + path phụ opacity 0.2 → tự đổi theo Light/Dark. Module `components/icons.tsx` (24 icon). Verified: emoji grep sạch, typecheck+build. Còn ✕ ← → ⌘ (ký hiệu text, ngoài phạm vi). Bump→0.6.0.

## TÍNH NĂNG (2026-07-14): Dark mode
Công tắc Sáng/Tối (🌙/☀️) ở sidebar; lưu `theme` trong Settings (tái dùng settingsGet/Set, không IPC mới); App.tsx set `data-theme` trên <html>. theme.css thêm block `:root[data-theme="dark"]` override 16 palette var + audit ~46 hex cứng (convert/override), color-scheme dark. Sidebar navy giữ nguyên 2 chế độ. Verified typecheck+build+review.

## TÍNH NĂNG (2026-07-13): Archive task
Toggle "Đang làm | Lưu trữ (N)" trên trang Tasks; nút 🗄 Lưu trữ mỗi dòng (active), ↩ Khôi phục + 🗑 xoá vĩnh viễn (archive). Thêm `archived` vào Task, widen updateTask patch, tái dùng tasksUpdate (không IPC mới). Tương thích tasks.json cũ (thiếu archived = false). Verified typecheck+build+review. Bump 0.4.0→0.5.0, đã install + mở `/Applications/Claude Recorder.app`.

## TÍNH NĂNG (2026-07-13): Trang "Tasks"
Spec: `docs/superpowers/specs/2026-07-13-tasks-page-design.md`. Thêm từng action item của biên bản vào task list (nút + mỗi dòng + "Thêm tất cả" ở màn chi tiết), quản lý ở trang Tasks (sửa inline lưu on-blur, xoá, tick xong→gạch ngang+xuống cuối), due date ô chữ tự do, lưu nguồn cuộc họp (bấm mở lại).
- [x] TasksStore.ts (tasks.json) + paths.tasksFile + Task/TaskInput types + 5 IPC (list/create/createMany/update/delete)
- [x] format.ts parseActionItems (parse bảng Việc|Người phụ trách|Deadline); MeetingDetail panel "Việc cần làm"; Tasks.tsx; App.tsx nav ✅ Tasks; theme.css
- [x] Verify: parseActionItems 7 dòng đúng trên biên bản thật; TasksStore round-trip; typecheck+build pass; review tay code (store/parser/Tasks/panel) đúng spec
- [x] Bump 0.3.0→0.4.0, rebuild → `Claude Recorder-0.4.0-arm64.dmg` (verified asar có tasks:list + UI strings)

---
- [x] (phát sinh) User báo không thấy nút Nhập file + xin hiện version: hoá ra đang chạy bản CŨ 0.2.0 (cả cũ lẫn mới đều 0.2.0). Bump version 0.2.0→0.3.0; thêm IPC appVersion + hiện "Claude Recorder · v{version}" ở footer sidebar để debug bản đang chạy. Rebuild → `Claude Recorder-0.3.0-arm64.dmg`. Verified: app version 0.3.0, asar có app:version + importFile + nút. User cần QUIT app cũ + Replace vào /Applications.

---
**Review (bug fix):** root cause = syscap chết (chưa cấp quyền Ghi màn hình) + `isRecording()` chỉ kiểm pids[0]=syscap → UI không lật. Verified E2E cả happy path (syscap sống → pids=[both], no WARN) lẫn failure path (stub chết → WARN_NOSYS, pids=[mic]); isRecording mới trả recording:true trên state bug gốc, code cũ trả false; typecheck+build pass. Đã dừng 6 ffmpeg mồ côi (cùng bug TCC cả sáng nay). Lưu ý: ffmpeg avfoundation phớt lờ SIGINT/SIGTERM, phải SIGKILL - record_stop dùng SIGINT+chờ 6s có thể là nguồn mồ côi khác (ngoài phạm vi).

---

Plan chi tiết: `~/.claude-accounts/.../plans/indexed-launching-coral.md`

- [x] 1. wz.py: thêm `list`, `devices`, `print-html`, `bienban --no-pdf` (additive) + verify
- [x] 1b. (yêu cầu thêm từ user) UI cảnh báo khi chưa có Claude Code CLI + hướng dẫn cài: banner ở Home, màn lỗi NO_CLAUDE ở Processing, panel Settings
- [x] 2. Scaffold `desktop/` (electron-vite + React + TS + electron-builder)
- [x] 3. Main process: paths, EngineService, SettingsStore, ipc, window, tray
- [x] 4. PipelineService + PdfService (printToPDF)
- [x] 5. SetupService (onboarding first-run)
- [x] 6. Renderer: theme + Onboarding/Home/Processing/Meetings/MeetingDetail/Settings
- [x] 7. Verify: ghi 8s → transcript OK (data dir cách ly); bienban --no-pdf OK; PDF Electron = PDF Chrome (11 trang, layout khớp)
- [x] 8. electron-builder.yml + entitlements + dist:mac:unsigned
- [x] 9. Docs: desktop/ENGINE-PROTOCOL.md, cập nhật README
- [x] 10. (yêu cầu thêm) Mặc định BẬT ghi tiếng trong máy + app tự xin quyền OS lúc mở
- [x] 11. (yêu cầu thêm) Chỉnh sửa biên bản (Markdown editor) + Tìm & thay thế hàng loạt (biên bản + transcript) → Xuất PDF theo bản đã sửa
- [x] 12. (yêu cầu thêm) App icon riêng (mic + sóng âm, navy brand): icon.svg/png/icns + dock icon dev
- [x] 13. (yêu cầu thêm) Tray icon template thật + đồng hồ MM:SS khi ghi (monospacedDigit, cập nhật 1s); confirm trước khi kết thúc họp (UI + tray); xoá cuộc họp có confirm (list + detail, chặn xoá khi đang ghi)
  - Lưu ý máy dev: icon tray bị notch MacBook che vì menu bar đầy (~16 icon) - item nằm x=910 trong vùng notch 764-964. Code đúng, cần dọn bớt icon menu bar hoặc dùng Bartender/Ice.
- [x] 14. (yêu cầu thêm - thương mại hoá) Prompt AI sạch dữ liệu công ty: glossary 2 tầng (repo = generic template; ~/wz-bien-ban/glossary.yaml = dữ liệu riêng user, engine tự gộp). Dữ liệu WZ cũ đã chuyển sang file riêng trên máy dev. Prompt wz.py/MCP/skill/commands vốn đã generic.
- [x] 15. (yêu cầu thêm) Glossary editor ngay trong Settings (textarea + nút Lưu) + path file click được (showItemInFolder), bỏ mở bằng external editor.
- [x] 19. (yêu cầu thêm) Multi-select hồ sơ ngữ cảnh: meeting.json lưu `profiles: []`; "Cá nhân" thành hồ sơ thật (profiles/Cá nhân/, file cũ ~/wz-bien-ban/glossary.yaml tự di trú vào 1 lần, engine giữ fallback file cũ cho plugin-only users); chọn nhiều chips ✓ ở Home/Processing/MeetingDetail, engine merge tất cả hồ sơ được chọn; legacy `profile` đơn = ["Cá nhân", X]; lastProfiles trong settings; verify test cách ly (merge 2 hồ sơ + loại hồ sơ không chọn + normalize legacy).
- [x] 18. (yêu cầu thêm) Hồ sơ ngữ cảnh thay từ điển YAML: viết văn xuôi tự do (người, chức vụ, công ty, sản phẩm, từ nghe sai); prompt engine đổi thành "NGỮ CẢNH & TỪ ĐIỂN"; hồ sơ "Cá nhân" (mặc định, luôn áp dụng) + công ty; chọn hồ sơ TRƯỚC khi ghi (Home) hoặc SAU khi ghi (Processing lúc đang transcribe qua meetings:setProfile, MeetingDetail + "Viết lại biên bản"); editor font thường, template văn xuôi mẫu.
- [x] 17. (yêu cầu thêm) Bỏ định danh Work Zone/workzone.ai.vn khỏi mọi UI desktop app, chỉ giữ "WZ": sidebar, title, tray, onboarding, Info.plist (productName "WZ Bien Ban" + CFBundleDisplayName "WZ Biên Bản"), letterhead + footer PDF (render.py). Giữ appId (không phải UI, giữ quyền TCC) và path nội bộ. Lưu ý: đổi productName làm userData của BẢN ĐÓNG GÓI đổi thư mục -> settings app đóng gói reset 1 lần (dev không ảnh hưởng).
- [x] 16. (yêu cầu thêm) Hồ sơ công ty (profiles): chọn công ty khi bắt đầu họp (chips ở Home, nhớ lần cuối, tray dùng lần cuối); profile ghi vào meeting.json; bienban chỉ merge glossary sản phẩm + chung + ĐÚNG công ty đó (verify cách ly bằng test); tabs từ điển theo công ty ở Settings (+ thêm công ty); badge + lọc công ty ở danh sách Cuộc họp. Engine: `record-start --profile`, `list` trả profile. Plugin/MCP không profile = hành vi cũ.

## Review (2026-07-10)

**Đã giao:** App desktop Electron hoàn chỉnh tại `desktop/` (electron-vite + React + TS + electron-builder).

- Engine Python giữ nguyên, chỉ thêm 4 lệnh additive vào `wz.py` (`list`, `devices`, `print-html`, `bienban --no-pdf`) - plugin/MCP không đổi hành vi.
- PDF render bằng `printToPDF` của Electron: so trực quan với bản Chrome cũ → 11 trang, layout khớp từng điểm.
- Verify end-to-end (data dir cách ly): ghi 8s → transcript OK; `bienban --no-pdf` với transcript thật → biên bản chuẩn.
- DMG unsigned build OK: 105MB, engine + wz-syscap bundle đúng vào Resources/engine.
- Yêu cầu bổ sung trong phiên: cảnh báo + hướng dẫn cài Claude Code (3 chỗ); mặc định BẬT ghi tiếng trong máy + app tự xin quyền mic/screen lúc mở; editor biên bản + Tìm & thay thế hàng loạt (biên bản + transcript).

**Chưa làm (chờ quyết định/điều kiện):**
- Ký + notarize DMG (cần Apple Developer ID; electron-builder tự làm khi set CSC_NAME - xem `app/SIGNING.md`).
- Windows: seam đã để sẵn (`desktop/ENGINE-PROTOCOL.md`, `paths.ts`); cần `wz-win.py` (WASAPI + faster-whisper).
- Chưa commit (chờ user yêu cầu).

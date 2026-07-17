# Spec: Nhập file ghi âm ngoài → tạo cuộc họp

Ngày: 2026-07-13

## Mục tiêu
Cho phép user chọn một file ghi âm có sẵn (từ công cụ khác) và tạo một cuộc họp từ
nó: chuyển giọng nói thành văn bản (transcript + tách người nói), rồi DỪNG. Biên bản
viết sau khi user bấm nút ở màn chi tiết (tái dùng luồng "Viết lại biên bản" sẵn có).

## Quyết định đã chốt (với user)
- Pipeline: **chỉ transcribe**, không tự viết biên bản/PDF. Biên bản viết khi user bấm.
- Định dạng nhận: **`.webm`, `.m4a`, `.mp3`, `.wav`** (chỉ audio phổ biến, không video).
- Điểm vào: **màn "Cuộc họp"** (nút ở đầu danh sách).
- Không hỏi tên/hồ sơ lúc nhập: tự đặt tên theo file, hồ sơ mặc định "Cá nhân"; user sửa
  hồ sơ ở màn chi tiết trước khi viết biên bản. (Không có tính năng đổi tên — ngoài phạm vi.)
- Tiến trình: **tái dùng màn Processing** (bắt đầu ở bước transcribing); xong tự mở màn
  chi tiết cuộc họp.

## Kiến trúc & thay đổi

### 1. Engine — `wz.py`: lệnh mới `import-file`
`wz.py import-file <src> [tên]`
1. Kiểm tra `src` tồn tại và đuôi ∈ {`.webm`, `.m4a`, `.mp3`, `.wav`} (không phân biệt hoa
   thường). Sai → in lỗi rõ ràng, return 1.
2. Tên cuộc họp: `_safe_name(tên or Path(src).stem)`; nếu rỗng → theo dấu thời gian
   `hop-YYYYMMDD-HHMMSS`. Nếu thư mục `OUTPUT/<name>` đã tồn tại → thêm hậu tố `-HHMMSS`
   để không đè cuộc họp khác.
3. `ensure_ffmpeg()` rồi `ffmpeg -y -hide_banner -loglevel error -i <src> -ac 1 -ar 16000
   -c:a pcm_s16le <out_dir>/audio.16k.wav`. ffmpeg giải mã được cả 4 định dạng.
   ffmpeg lỗi (code ≠ 0) hoặc wav < 1KB → in lỗi, return 1.
4. Ghi `meeting.json`: `{"started": <mtime file nguồn, epoch giây>}` (không ghi profiles →
   reader tự mặc định "Cá nhân"). `mtime` để sắp xếp theo thời điểm ghi gốc; lỗi lấy mtime
   → dùng `time.time()`.
5. In `OUTPUT_DIR=<out_dir>` (cho desktop bắt tên) và dòng chứa "Đang transcript" (cho
   desktop chuyển stage), gọi `_transcribe(name)` + `_merge(name)`. DỪNG ở đây (không
   biên bản, không PDF). In dòng kết thúc + `OUTPUT_DIR=` lần nữa nếu tiện. Return 0.
6. Đăng ký trong `main()`: thêm nhánh `cmd == "import-file"` (gọi `ensure_ffmpeg` như các
   lệnh dài khác) → `import_file(pos[0], pos[1] if len>1 else None)`. Cập nhật docstring.

### 2. Desktop — hợp đồng IPC
- `ipc-contract.ts`: thêm kênh `importFile: 'recorder:importFile'`.
- `preload/index.ts`: `importFile: (): Promise<{ started: boolean; canceled?: boolean;
  error?: string }> => ipcRenderer.invoke(IPC.importFile)`.

### 3. Desktop — main
- `types.ts` `PipelineState`: thêm `origin?: 'record' | 'import'`.
- `PipelineService.ts`: hàm mới `importAndProcess(src: string)`:
  - Guard giống `stopAndProcess` (chỉ chạy khi stage ∈ idle/done/error).
  - `setState({ stage: 'transcribing', origin: 'import', meetingName: undefined,
    pdfPath: undefined, errorStage: undefined, errorCode: undefined, message: undefined })`.
  - `runStreaming(['import-file', src], onLine)`: bắt "Đang transcript" (giữ ở transcribing),
    bắt `OUTPUT_DIR=` → `setState({ meetingName })`.
  - code ≠ 0 hoặc thiếu name → `fail('transcribing', msg)`.
  - Thành công → `setState({ stage: 'done', origin: 'import', meetingName })` (KHÔNG chạy
    minutesAndPdf, KHÔNG pdfPath).
  - Đặt lại `origin: 'record'` ở các luồng record hiện có (`stopAndProcess` khởi tạo state
    nên set `origin: 'record'`; `retryMinutes`/minutesAndPdf giữ nguyên origin của meeting
    đang xử lý — record). Đơn giản nhất: `stopAndProcess` và `minutesAndPdf` set
    `origin: 'record'` khi khởi tạo stage của chúng.
- `ipc.ts`: handler `IPC.importFile`:
  - `dialog.showOpenDialog({ properties: ['openFile'], filters: [{ name: 'Ghi âm',
    extensions: ['webm','m4a','mp3','wav'] }] })`.
  - Hủy → `{ started: false, canceled: true }`.
  - Có file → `void importAndProcess(filePath)` (fire-and-forget, tiến trình qua event);
    trả `{ started: true }`.

### 4. Desktop — renderer
- `Meetings.tsx`: nút "⬆ Nhập file ghi âm" ở đầu danh sách. onClick gọi
  `window.wz.importFile()`. Nếu `started` → không cần làm gì thêm (App tự chuyển sang
  Processing nhờ pipeline event); nếu `error` → hiện thông báo.
- `App.tsx`:
  - Khi `pipelineBusy`, hiện Processing bất kể tab đang ở đâu (để import khởi từ tab
    Cuộc họp vẫn thấy tiến trình) — hoặc `setTab('record')` khi bắt đầu import. Chọn:
    thêm effect: khi `pipeline.stage` chuyển sang 'transcribing' với `origin==='import'`
    và tab!=='record' → `setTab('record')`.
  - Effect kết thúc import: khi `pipeline.stage==='done' && pipeline.origin==='import'`
    → `openMeeting(pipeline.meetingName)` rồi `window.wz.pipelineReset()`. Dùng ref để
    chỉ chạy một lần cho mỗi lần done.
- `Processing.tsx`: khi `pipeline.origin==='import'`, danh sách bước chỉ gồm
  `['transcribing']` (ẩn stopping/minutes/pdf) và tiêu đề phù hợp ("Đang xử lý file ghi âm").

## Xử lý lỗi
- File sai định dạng / không đọc được / ffmpeg lỗi → engine return 1 + thông điệp →
  pipeline `error` ở stage `transcribing`, hiện ở màn Processing (đã có UI lỗi + nút thử lại
  về Home). Transcript chưa có nên không mất gì.
- Import khi đang ghi hoặc pipeline bận → guard chặn (không làm gì / thông báo bận).

## Kiểm thử (verify)
1. Engine E2E với file demo `/Users/n/Nexus/Recorder/recordings/2026-07-13T03-00-16-877Z-2ed41231.webm`
   (chạy trong WZ_DATA_DIR tạm để không đụng dữ liệu thật): chạy `import-file` → khẳng định
   `audio.16k.wav` được tạo (>1KB), `transcript.raw.txt`/`transcript.speakers.txt` xuất hiện,
   `meeting.json.started` = mtime file, exit 0, có in `OUTPUT_DIR=`.
2. Đặt tên trùng: chạy import 2 lần cùng file → thư mục thứ 2 có hậu tố, không đè.
3. File sai định dạng (đổi tên .txt) → exit 1 + thông điệp rõ.
4. `npm run typecheck` + `npm run build` (desktop) pass.
5. Rà tay: nút xuất hiện ở màn Cuộc họp; sau transcribe tự mở màn chi tiết; màn chi tiết
   hiện transcript + trạng thái "Chưa có biên bản" + nút "Viết lại biên bản".

## Ngoài phạm vi
- Nhập file video (mp4/mov). Đổi tên cuộc họp trong app. Kéo-thả file. Nhập hàng loạt.

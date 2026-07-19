# Thiết kế: Đồng bộ Wiki ↔ GitHub Repo (backup 2 chiều, thủ công)

Ngày: 2026-07-19
Trạng thái: Đã duyệt thiết kế — chờ viết plan triển khai

## 1. Mục tiêu

Cho phép người dùng backup và đồng bộ thư mục Wiki (`~/wz-bien-ban/wiki/`) lên một
GitHub repo riêng, để:

- Có bản backup an toàn trên GitHub.
- Dùng cùng một Wiki trên nhiều máy (đồng bộ 2 chiều).

Đồng bộ được **kích hoạt thủ công** bằng nút "Sync" — không tự chạy nền.

## 2. Nguyên tắc & bối cảnh

- **Working tree = `~/wz-bien-ban/wiki/`** (gồm cả `assets/`). Mọi note là file
  Markdown thuần với frontmatter tối giản; ảnh nằm trong `assets/` với đường dẫn
  tương đối. Vì vậy thư mục này chính là một git working tree tự nhiên — **không
  đổi mô hình dữ liệu, không cần bước export**.
- Chỉ đồng bộ nội dung trong `wiki/`. Các dữ liệu khác của app (`output/`,
  `tasks.json`, `.env`, `.venv/`, `.state.json`, `profiles/`) **không** được đưa
  lên GitHub.

## 3. Các quyết định đã chốt

| Chủ đề | Quyết định |
|---|---|
| Hướng đồng bộ | 2 chiều (push + pull), dùng trên nhiều máy |
| Kích hoạt | Thủ công — nút "Sync" |
| Xác thực | Personal Access Token (PAT) do người dùng tạo trên GitHub |
| Git engine | `isomorphic-git` + `isomorphic-git/http/node` (thuần JS, đóng gói trong app, chạy trong Electron main process) — không phụ thuộc git cài trên máy |
| Máy thứ 2 lần đầu | **Merge gộp** cả note local sẵn có và note từ remote |

## 4. Lưu cấu hình

Theo đúng tiền lệ hiện có trong codebase:

- **Không bí mật** → `settings.json` (Electron `userData`). Thêm vào type
  `Settings` (`desktop/src/shared/types.ts`) một nhánh:

  ```ts
  gitSync?: {
    enabled: boolean;
    repoUrl: string;        // https://github.com/<owner>/<repo>.git
    branch: string;         // mặc định "main"
    authorName: string;     // dùng cho commit
    authorEmail: string;
    lastSyncedAt?: number;  // epoch ms
    lastSyncStatus?: 'ok' | 'conflict' | 'error';
    lastSyncMessage?: string;
  }
  ```

- **Bí mật** → `~/wz-bien-ban/.env`, biến `GITHUB_TOKEN=...`, đọc/ghi bằng cơ chế
  `.env` sẵn có trong `SettingsStore.ts` (mirror `HF_TOKEN`). Token **không bao
  giờ** được gửi về renderer; renderer chỉ biết token "đã đặt / chưa đặt".

## 5. Thuật toán "Sync" (mỗi lần bấm nút)

Chạy trong main process (`GitSyncStore.ts`). Đầu vào: `wikiDir`, config, token.

1. **Đảm bảo repo:** nếu `wiki/.git` chưa tồn tại → `git.init` (branch mặc định
   theo config, mặc định `main`), set `origin` = `repoUrl`. Ghi file `.gitignore`
   trong `wiki/` để loại trừ rác nếu cần (mặc định trống — cả `assets/` đều theo dõi).
2. **Commit local:** stage toàn bộ thay đổi (thêm/sửa/xóa) và commit nếu có thay
   đổi. Message: `sync from <hostname> <ISO timestamp>`. Tác giả lấy từ
   `authorName`/`authorEmail`.
3. **Fetch** từ `origin`.
4. **Merge** `origin/<branch>` vào local:
   - Local chỉ đi sau remote → fast-forward.
   - Phân nhánh → merge 3 chiều (`abortOnConflict: false`). File text (`.md`) tự
     merge; đoạn xung đột được chèn conflict marker.
5. **Kiểm tra xung đột còn lại:** nếu còn conflict marker trong file text, hoặc có
   xung đột file nhị phân trong `assets/` (không tự merge được) → **DỪNG, KHÔNG
   push**. Trả về trạng thái `conflict` kèm danh sách file để người dùng sửa rồi
   Sync lại. Không mất dữ liệu (commit local đã lưu, remote chưa bị đụng).
6. **Push** lên `origin/<branch>`.
7. Cập nhật `lastSyncedAt`, `lastSyncStatus`, `lastSyncMessage`; đẩy event tiến
   trình về renderer trong lúc chạy (bắt đầu / fetch / merge / push / xong).

## 6. Lần đầu kết nối

- **Remote trống:** init → commit toàn bộ wiki hiện có → push. Xong.
- **Remote đã có note (máy thứ 2):** init → fetch → merge remote vào local (giữ
  cả note local mới lẫn note remote — merge gộp) → push. Nếu đụng nhau → như
  bước 5 (dừng, báo xung đột).

## 7. Giao diện

### Settings — mục mới "Đồng bộ GitHub"
- Ô nhập **Repo URL** (`https://github.com/<owner>/<repo>.git`).
- Ô nhập **PAT** (dạng password, ẩn ký tự). Chỉ hiển thị "đã đặt / chưa đặt", không
  hiển thị lại token đã lưu.
- Nút **"Kiểm tra kết nối"** — thử fetch bằng token/repoUrl, báo OK hoặc lỗi.
- Hiển thị **trạng thái & lần sync gần nhất** (thời gian + ok/conflict/error).
- Link hướng dẫn tạo PAT (fine-grained, chỉ quyền Contents:read/write cho repo backup),
  mở bằng `shell:openExternal`.

### Màn Wiki — nút "Sync" ở header
- Trạng thái: idle → spinner "Đang đồng bộ…" → ✓ kèm thời gian / ⚠ xung đột / ✕ lỗi.
- Khi xung đột/lỗi: bấm mở chi tiết (danh sách file xung đột hoặc thông báo lỗi).
- Nếu chưa cấu hình repo/token: nút dẫn người dùng sang Settings.

## 8. Code (theo pattern IPC 3 file sẵn có)

- Module mới `desktop/src/main/gitsync/GitSyncStore.ts` — toàn bộ logic
  isomorphic-git (ensureRepo, commitLocal, fetch, merge, push, test).
- Channel mới trong `desktop/src/shared/ipc-contract.ts`:
  - `gitSyncNow` — chạy thuật toán mục 5.
  - `gitSyncConfigGet` / `gitSyncConfigSet` — đọc/ghi config + trạng thái token.
  - `gitSyncTest` — kiểm tra kết nối.
- Handler trong `desktop/src/main/ipc.ts`; wrapper trong `desktop/src/preload/index.ts`
  (`window.wz`).
- Event tiến trình qua `IPC_EVENTS` (main → renderer) như các luồng hiện có.
- Thêm dependency: `isomorphic-git` (cần `--legacy-peer-deps` như phần còn lại của
  dự án React 19). HTTP transport: `isomorphic-git/http/node`.

## 9. Xử lý lỗi

- Thiếu token / repoUrl → trả lỗi rõ ràng, dẫn sang Settings.
- Token sai / hết hạn / không đủ quyền → bắt lỗi 401/403 từ isomorphic-git, báo
  "PAT không hợp lệ hoặc thiếu quyền".
- Không có mạng → báo lỗi mạng, giữ nguyên commit local.
- Push bị từ chối (non-fast-forward do có người push xen giữa) → tự fetch+merge lại
  một lần rồi push; nếu vẫn thất bại → báo lỗi để Sync lại.
- Mọi lỗi đều không làm mất dữ liệu local: commit local luôn được lưu trước khi
  chạm remote.

## 10. Kiểm thử

- Unit test thuật toán sync với một "remote" là **bare repo cục bộ** (file://):
  - Repo trống → push toàn bộ.
  - Local đi sau remote → fast-forward về.
  - Phân nhánh, không đụng nhau → merge tự động + push.
  - Phân nhánh, xung đột `.md` → dừng ở trạng thái `conflict`, không push.
  - Xung đột file nhị phân trong `assets/` → dừng đúng.
  - Push non-fast-forward → tự merge lại rồi push thành công.
- Test đọc/ghi config: token vào `.env`, config vào `settings.json`, renderer chỉ
  thấy "đã đặt token".

## 11. Ngoài phạm vi (v1)

- Đồng bộ tự động (nền / định kỳ / theo save).
- OAuth device flow, SSH.
- Đồng bộ các thư mục khác ngoài `wiki/`.
- UI giải quyết xung đột trong app (v1: người dùng tự sửa file rồi Sync lại).
- Quản lý nhiều repo / nhiều nhánh cùng lúc.

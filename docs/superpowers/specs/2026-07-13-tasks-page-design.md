# Spec: Trang "Tasks" (danh sách việc cần làm)

Ngày: 2026-07-13

## Mục tiêu
Thêm một trang **Tasks** đơn giản: user thêm từng action item của biên bản vào "task
list" của mình, rồi tự quản lý (sửa/xoá/tick xong) tuỳ ý ở trang Tasks. Bố cục bảng
giống ảnh mẫu: checkbox · Name · Assignee · Due date · (＋ thêm), có dòng "＋ Add item".

## Quyết định đã chốt (với user)
- Thêm từ **màn chi tiết cuộc họp**: mỗi action item có nút **"+ Thêm vào Tasks"**, kèm
  nút **"Thêm tất cả"**.
- **Due date = ô chữ tự do** (giữ nguyên deadline dạng chữ như "Trong tuần", "Chưa chốt").
- Mỗi task **lưu liên kết cuộc họp nguồn**, hiện nhãn tên cuộc họp, bấm mở lại cuộc họp.
- Task tick xong → **gạch ngang + gom xuống cuối** danh sách.
- Giao diện theo **theme sáng hiện có của app** (sidebar navy/thẻ trắng); ảnh mẫu (nền tối)
  chỉ tham chiếu bố cục cột.

## Mô hình dữ liệu
File `~/wz-bien-ban/tasks.json` (mảng). Mỗi task:
```ts
interface Task {
  id: string          // randomUUID (main)
  name: string        // Việc
  assignee: string    // Người phụ trách
  due: string         // Deadline (chữ tự do)
  done: boolean
  source?: { meeting: string }  // tên folder cuộc họp nguồn (nếu thêm từ biên bản)
  createdAt: number   // epoch ms, để giữ thứ tự chèn
}
```
- Không cần Python/engine. Xử lý toàn bộ ở Electron main.

## Kiến trúc & thay đổi

### 1. Main — `desktop/src/main/tasks/TasksStore.ts` (mới, theo mẫu SettingsStore)
- `listTasks(): Task[]` — đọc tasks.json (không có → `[]`; JSON hỏng → `[]`).
- `createTask(input: { name?; assignee?; due?; source? }): Task` — sinh id (`crypto.randomUUID()`),
  `createdAt = Date.now()`, mặc định field rỗng, `done=false`; ghi file; trả task mới.
- `createTasks(inputs: Array<...>): Task[]` — tạo nhiều, ghi 1 lần; trả mảng mới.
- `updateTask(id, patch: Partial<Pick<Task,'name'|'assignee'|'due'|'done'>>): Task` — merge, ghi,
  trả task đã cập nhật (không thấy id → throw).
- `deleteTask(id): void` — lọc bỏ, ghi.
- Ghi file: `fs.writeFileSync(tasksFile, JSON.stringify(list, null, 2))`. Thêm `tasksFile`
  vào `paths.ts` = `path.join(dataDir, 'tasks.json')`.

### 2. Shared — `types.ts`
- Thêm `interface Task` như trên. `TaskInput = { name?: string; assignee?: string; due?: string; source?: { meeting: string } }`.

### 3. IPC — contract + preload + handlers
- `ipc-contract.ts`: `tasksList: 'tasks:list'`, `tasksCreate: 'tasks:create'`,
  `tasksCreateMany: 'tasks:createMany'`, `tasksUpdate: 'tasks:update'`, `tasksDelete: 'tasks:delete'`.
- `ipc.ts`: 5 handler gọi thẳng TasksStore.
- `preload/index.ts`:
  - `tasksList(): Promise<Task[]>`
  - `tasksCreate(input: TaskInput): Promise<Task>`
  - `tasksCreateMany(inputs: TaskInput[]): Promise<Task[]>`
  - `tasksUpdate(id: string, patch: Partial<Task>): Promise<Task>`
  - `tasksDelete(id: string): Promise<void>`

### 4. Renderer — parser `format.ts`
- `parseActionItems(md: string): { name: string; assignee: string; due: string }[]`
  - Tìm đề mục chứa "Action item" (không phân biệt hoa thường).
  - Đọc bảng markdown ngay sau đó: bỏ dòng header + dòng phân cách `|---|`, mỗi dòng dữ liệu
    `| a | b | c |` → tách theo `|`, trim, lấy 3 cột đầu → {name:a, assignee:b, due:c}.
  - Dừng khi gặp dòng không bắt đầu bằng `|` (hết bảng) hoặc đề mục mới. Bỏ qua dòng rỗng
    ngay trước bảng. Cột thiếu → chuỗi rỗng. Không thấy section/bảng → `[]`.

### 5. Renderer — MeetingDetail: panel "Việc cần làm"
- Khi `detail.bienBanMd` có action items (`parseActionItems(...).length > 0`), hiện panel gọn
  (thẻ) phía trên/cạnh biên bản: tiêu đề "Việc cần làm — thêm vào Tasks".
- Mỗi dòng: text việc + (người phụ trách · deadline nhỏ) + nút **"+ Thêm vào Tasks"** →
  `tasksCreate({ name, assignee, due, source: { meeting: name_cuoc_hop } })`.
- Nút **"Thêm tất cả"** → `tasksCreateMany([...])`.
- Sau khi thêm hiện xác nhận nhỏ ("Đã thêm N việc vào Tasks"); nút mỗi dòng đổi trạng thái
  "✓ Đã thêm" (không chặn thêm lại — user tự quản lý bên Tasks).

### 6. Renderer — trang Tasks (`screens/Tasks.tsx` mới)
- Nạp `tasksList()` khi mount; giữ state cục bộ.
- Sắp xếp hiển thị: chưa xong trước (theo createdAt tăng), đã xong xuống cuối (theo createdAt).
- Bảng khớp ảnh mẫu (theme sáng):
  - Header: ô tick (icon), Name, Assignee, Due date, nút ＋ (thêm task rỗng).
  - Mỗi dòng: checkbox `done` (toggle → `tasksUpdate(id,{done})`, cập nhật + re-sort);
    3 ô `<input>` (Name/Assignee/Due) controlled theo state, **lưu on blur** qua
    `tasksUpdate` (chỉ gọi khi giá trị đổi); placeholder "Untitled item" cho name rỗng;
    khi `done` → chữ gạch ngang (line-through, màu mờ).
  - Nhãn nguồn: nếu `source.meeting` → thẻ nhỏ tên cuộc họp, bấm → điều hướng mở cuộc họp đó.
  - Nút xoá (🗑, hiện khi hover) → `tasksDelete(id)` + bỏ khỏi state.
  - Dòng cuối **"＋ Add item"** → `tasksCreate({})` → thêm vào state, focus ô Name.
- Rỗng: hiện gợi ý "Chưa có việc nào. Thêm từ Action items của một cuộc họp, hoặc bấm ＋ Add item."

### 7. Renderer — App.tsx điều hướng
- `Tab` thêm `'tasks'`. Nav item "✅ Tasks" (sau "Cuộc họp"). Render `<Tasks onOpenMeeting={openMeeting} />`
  khi `tab==='tasks'`.
- `openMeeting` (đã có) dùng để nhãn nguồn mở cuộc họp (chuyển tab meetings + set selected).

### 8. theme.css
- Thêm style bảng Tasks (header, dòng, ô input trong suốt, checkbox tròn, nhãn nguồn, hover
  hiện nút xoá) theo tông sáng hiện có. Tái dùng biến màu/thẻ sẵn có.

## Xử lý lỗi / biên
- tasks.json hỏng → coi như rỗng (không crash).
- Action item không có bảng / biên bản chưa viết → panel không hiện.
- Ô input rỗng vẫn lưu được (task "Untitled").

## Kiểm thử (verify)
1. Unit `parseActionItems`: chạy trên biên bản thật
   `~/wz-bien-ban/output/hop-20260710-1002/bien-ban.md` → khẳng định 7 dòng, cột đúng
   (vd dòng 1: name chứa "Xóa user Claude", assignee "Otis (Hào)", due "Trong tuần").
   Cũng test chuỗi không có action items → `[]`.
2. TasksStore round-trip trong WZ_DATA_DIR tạm: create → list → update → delete, đọc lại
   tasks.json khớp.
3. `npm run typecheck` + `npm run build` (desktop) pass.
4. Rà tay: thêm từ 1 cuộc họp → xuất hiện ở Tasks với nhãn nguồn; sửa/blur lưu; tick xong
   gạch ngang + xuống cuối; ＋ Add item + xoá hoạt động; bấm nhãn nguồn mở đúng cuộc họp.

## Ngoài phạm vi
Nhắc nhở/thông báo, xử lý ngày thật (chỉ chữ tự do), kéo-thả sắp xếp, đồng bộ đám mây,
gộp trùng action item.

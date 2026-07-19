# Wiki editor kiểu Notion + kéo-thả ảnh — Design (2026-07-18)

## Mục tiêu
Trang note Wiki soạn thảo "tiện như Notion": editor WYSIWYG luôn-sửa-được, kéo-thả/dán ảnh chèn ngay, slash menu, bảng/checklist, drag-handle. Tham khảo `/Users/n/Code/ForFun/md-editor-plus` (VSCode ext, Tiptap). File lưu vẫn là markdown chuẩn (engine wiki-ask/MCP đọc được; Copy/Tải .md giữ nguyên).

## Quyết định đã chốt với user
- **Tiptap WYSIWYG** (không phải textarea+preview). Pin **v2.27.2** + `tiptap-markdown@0.8.10` (combo proven của dự án tham khảo; v3 rủi ro với tiptap-markdown). React 19 → cài `--legacy-peer-deps`.
- **Ảnh**: chép vào `~/wz-bien-ban/wiki/assets/<tên-duy-nhất>.<ext>`, trong .md ghi đường dẫn **tương đối** `![](assets/x.png)` (portable). Hiển thị qua **custom protocol `wzasset://`** (không nới lỏng file://).
- **Editor luôn-sửa-được** = view duy nhất (bỏ chế độ đọc riêng + nút "Chỉnh sửa"). Auto-save debounce.
- **Wikilink `[[..]]`** = custom Tiptap node: chip bấm được trong editor + round-trip đúng `[[Title]]`.

## Kiến trúc

### Main
- `wzasset://` protocol (registerSchemesAsPrivileged trước app.ready + protocol.handle sau ready): `wzasset://asset/<file>` → đọc `wikiDir/assets/<file>` (chặn path traversal: chỉ basename). Trả stream/buffer với mime theo đuôi.
- IPC `wiki:saveAsset(base64: string, ext: string)`: validate ext ảnh (png/jpg/jpeg/gif/webp/svg), ghi `wikiDir/assets/<sha1|counter>.<ext>`, tạo thư mục nếu thiếu, trả `{ rel: 'assets/<file>' }`.
- CSP (index.html): `img-src 'self' wzasset: data:` (thêm vào default-src 'self').

### Renderer
- `NoteEditor.tsx` (React, `useEditor`): extensions StarterKit (tắt trùng), Underline, Link, TaskList/TaskItem, Table(+row/header/cell), Image→`ResolvedImage` (renderHTML rewrite `assets/..`→`wzasset://asset/..`; giữ src tương đối khi getMarkdown), Placeholder, GlobalDragHandle, Markdown (tiptap-markdown: html false, để round-trip .md), Wikilink node.
- Ảnh: bắt `handleDOMEvents.drop` + `handlePaste` của editor; `findImageFiles(dataTransfer/clipboard)` → FileReader base64 → `wiki:saveAsset` → chèn `image` node với src = rel. (Mượn logic imagePaste.ts nhưng thay postMessage bằng IPC, batch giữ thứ tự.)
- `Wikilink` node: inline atom, attr `target`; input rule `[[...]]` khi gõ; parse/serialize markdown `[[target]]`; renderHTML = span.wikilink (mờ nếu chưa resolve); click → gọi `onOpenNote(resolvedId)` truyền qua editorProps.
- Slash menu: extension Suggestion char `/` → danh sách lệnh (H1/H2/H3, bullet, số, checklist, quote, code, bảng 3x3, hr, ảnh). Bubble menu: `@tiptap/react` BubbleMenu (bold/italic/underline/strike/code/link).
- Auto-save: `onUpdate` → debounce 600ms → `getMarkdown()` → `wikiSave(id,{title,tags,content})`. Lưu ngay khi rời note/đổi title/tags.

### Wiki.tsx
- Bỏ nhánh `read view (dangerouslySetInnerHTML)` + textarea edit. Note view = title input (inline, serif) + tags input + `<NoteEditor>` + toolbar (Copy MD/Tải .md/Xuất PDF/Xoá) + backlinks. Xuất PDF vẫn dùng renderNoteHtml từ markdown hiện tại (đọc từ editor.getMarkdown hoặc note.content mới lưu).

## Ngoài phạm vi v1
mermaid, kanban/board, callout/toggle, color/highlight chữ, syntax-highlight (lowlight), annotation, dịch, autocomplete gợi ý tên note khi gõ `[[`.

## Rủi ro / lưu ý
- tiptap-markdown round-trip: kiểm bảng/checklist/code/ảnh/wikilink giữ đúng khi lưu-mở lại. Nếu mất mát → điều chỉnh cấu hình Markdown extension.
- Ảnh cũ trong note (nếu có path lạ) chỉ resolve `assets/..`; path khác để nguyên.
- Xuất PDF template vẫn màu azure cũ (việc treo riêng, ngoài phạm vi).

## Verify
typecheck + build; drive app (Playwright _electron): mở note gõ text + định dạng, drop 1 ảnh (giả lập), kiểm `getMarkdown` ra `![](assets/..)` + file tồn tại, wikilink `[[..]]` chip bấm điều hướng + round-trip, lưu-mở-lại giữ nội dung; xem Sáng/Tối. Rồi bump version + build DMG + cài + relaunch (theo preference).

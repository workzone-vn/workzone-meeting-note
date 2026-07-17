# Wiki + Knowledge Graph (Obsidian-style) — thiết kế

Ngày: 2026-07-17 · Trạng thái: đã duyệt

## Mục tiêu

Học online thấy gì hay thì take note vào Wiki trong app; sau đọc lại, tra cứu bằng AI.
Ghi chú nối nhau bằng wikilink `[[...]]` + tag → thành knowledge graph để cả người
(graph view) lẫn AI (wiki-ask lan theo liên kết) tìm trong "biển kiến thức".

## Quyết định đã chốt với user

- Danh sách phẳng + tag + tìm kiếm toàn văn (KHÔNG cây trang cha/con).
- Chỉ tab Wiki trong app (KHÔNG quick-note từ tray đợt này).
- AI hỏi đáp trả lời kèm chip ghi chú nguồn bấm mở được.
- Bổ sung: wikilink `[[Tên note]]` (link chưa tồn tại hiện mờ, bấm tạo mới),
  backlinks cuối trang, graph view kiểu Obsidian (node xám = note, xanh = #tag),
  wiki-ask dùng graph: seed theo từ khoá rồi lan 1 bước theo wikilink/backlink.

## Lưu trữ

`~/wz-bien-ban/wiki/<slug>.md` — file markdown thường (sync/sửa ngoài app được):

```
---
title: Tiêu đề tự do
tags: tag1, tag2
updated: <epoch giây>
---
Nội dung markdown, wikilink dạng [[Tiêu đề note khác]].
```

`id` = tên file không đuôi (slug từ title lúc tạo, ổn định về sau kể cả đổi title).
Wikilink resolve theo title (không phân biệt hoa thường) hoặc slug.

## Main process — `wiki/WikiStore.ts` (fs thuần, không spawn python)

- `listNotes()`: [{id, title, tags, updated, excerpt, links (id đã resolve), unresolved}]
- `getNote(id)`: + content + backlinks [{id,title}]
- `createNote(title)` (slug duy nhất) / `saveNote(id, {title,tags,content})` / `deleteNote(id)`
- IPC: `wiki:list|get|create|save|delete|ask` — delete có confirm dialog (ở ipc.ts).

## Engine — `wz.py wiki-ask` (câu hỏi qua stdin, pattern như `revise`)

1. Đọc mọi note trong `WZ_DATA_DIR/wiki/`.
2. Seed: chấm điểm theo từ khoá câu hỏi (title ×3, tag ×2, nội dung ×1), lấy top.
3. Lan 1 bước: note mà seed trỏ tới (wikilink) + note trỏ về seed (backlink),
   đến giới hạn ~60k ký tự. Không match gì → lấy các note mới nhất.
4. `claude -p`: trả lời tiếng Việt bằng markdown DỰA TRÊN ghi chú, dòng cuối
   `SOURCES=<id>|<id>` liệt kê note đã dùng. `NO_CLAUDE` + exit 2 như các lệnh khác.
5. App parse: answer = stdout bỏ dòng SOURCES; sources map id → title.

## UI — tab "Wiki" mới (sidebar, icon Notebook)

- **Danh sách**: nút [+ Ghi chú mới] [Đồ thị]; ô "Hỏi Wiki (AI)" (câu hỏi → spinner →
  card trả lời render markdown + chip nguồn); tìm kiếm toàn văn; lọc tag (chips);
  dòng note = title, tags, ngày sửa, excerpt.
- **Trang note**: xem markdown render, `[[link]]` thành link bấm được (mờ nếu chưa có,
  bấm tạo mới); mục "Liên kết đến đây" (backlinks); Chỉnh sửa (title/tags/textarea
  như editor biên bản), Xoá (confirm).
- **Graph view**: canvas force-directed TỰ VIẾT (~80 dòng, không thêm thư viện -
  app offline): node note xám, node #tag xanh, cạnh = wikilink + note-tag; kéo node,
  hover nổi label, bấm note mở trang, bấm tag về danh sách lọc tag đó.

## Không làm đợt này

Cây trang, tray quick-note, rich editor, sync cloud, embed ảnh, rename id file.

## Kiểm chứng

- Engine wiki-ask: wiki giả 4-5 note có wikilink → hỏi → trả lời đúng + SOURCES gồm
  cả note lan theo link; không match → vẫn trả lời từ note mới nhất; NO_CLAUDE path.
- typecheck + build; cài app, user thử tạo note, link, graph, hỏi AI.

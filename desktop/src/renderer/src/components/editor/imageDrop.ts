// Kéo-thả ảnh từ ngoài vào + dán ảnh (screenshot) trong editor Tiptap.
// Đọc bytes -> base64 -> IPC wiki:saveAsset (main ghi wiki/assets, trả rel) -> chèn node ảnh.
// Bất đồng bộ: bắt vị trí chèn ngay, lưu xong mới chèn (nhiều ảnh chèn theo thứ tự).
import type { Editor } from '@tiptap/react'

/** Gom mọi File ảnh từ DataTransfer (ưu tiên files của drop, rồi items của paste). */
export function findImageFiles(dt: DataTransfer | null): File[] {
  if (!dt) return []
  const out: File[] = []
  for (const f of dt.files ? Array.from(dt.files) : []) {
    if (f.type.startsWith('image/')) out.push(f)
  }
  if (out.length) return out
  for (const it of dt.items ? Array.from(dt.items) : []) {
    if (it.kind === 'file' && it.type.startsWith('image/')) {
      const f = it.getAsFile()
      if (f) out.push(f)
    }
  }
  return out
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => {
      const res = r.result as string // data:<mime>;base64,XXXX
      const comma = res.indexOf(',')
      resolve(comma >= 0 ? res.slice(comma + 1) : res)
    }
    r.onerror = () => reject(r.error)
    r.readAsDataURL(file)
  })
}

function extOf(file: File): string {
  const fromType = file.type.split('/')[1]
  if (fromType) return fromType.replace('+xml', '') // image/svg+xml -> svg
  const m = file.name.match(/\.([a-z0-9]+)$/i)
  return m ? m[1].toLowerCase() : 'png'
}

/**
 * Lưu danh sách ảnh rồi chèn vào editor tại `pos` (tăng dần cho từng ảnh).
 * Trả về Promise (chỉ để test/verify; caller không cần await).
 */
export async function insertImageFiles(editor: Editor, files: File[], pos: number): Promise<void> {
  let at = pos
  for (const file of files) {
    try {
      const base64 = await fileToBase64(file)
      const { rel } = await window.wz.wikiSaveAsset(base64, extOf(file))
      if (editor.isDestroyed) return
      editor
        .chain()
        .insertContentAt(at, { type: 'image', attrs: { src: rel, alt: file.name.replace(/\.[a-z0-9]+$/i, '') } })
        .run()
      at = editor.state.selection.to // ảnh kế tiếp chèn sau ảnh vừa rồi
    } catch (e) {
      console.error('[wiki] lưu ảnh lỗi:', e)
    }
  }
}

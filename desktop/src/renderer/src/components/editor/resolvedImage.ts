// Ảnh trong editor: node attr `src` GIỮ đường dẫn tương đối `assets/x.png` (nguồn
// duy nhất cho markdown -> tiptap-markdown serialize ra ![](assets/x.png)).
// renderHTML CHỈ lúc hiển thị mới đổi sang wzasset://asset/.. để load được qua protocol.
import Image from '@tiptap/extension-image'
import { mergeAttributes } from '@tiptap/core'

/** assets/x.png -> wzasset://asset/x.png ; đường dẫn khác (http, data:, wzasset:) giữ nguyên. */
export function resolveAssetSrc(src: string): string {
  if (typeof src !== 'string') return src
  if (src.startsWith('assets/')) return `wzasset://asset/${src.slice('assets/'.length)}`
  return src
}

export const ResolvedImage = Image.extend({
  renderHTML({ HTMLAttributes }) {
    const out: Record<string, unknown> = { ...HTMLAttributes }
    if (typeof out.src === 'string') out.src = resolveAssetSrc(out.src)
    return ['img', mergeAttributes(this.options.HTMLAttributes, out)]
  }
})

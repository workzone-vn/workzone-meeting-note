// Wikilink [[Tiêu đề]] trong editor — làm bằng DECORATION (không phải node) để
// markdown round-trip là hiển nhiên: text vẫn là "[[..]]", tiptap-markdown giữ nguyên.
// Plugin quét text tìm [[..]], tô class .wikilink (bấm được) + xử lý click điều hướng.
import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import type { Node as PMNode } from '@tiptap/pm/model'

const WIKILINK_RE = /\[\[([^[\]|#]+)\]\]/g

function buildDecorations(doc: PMNode): DecorationSet {
  const decos: Decoration[] = []
  doc.descendants((node, pos) => {
    if (!node.isText || !node.text) return
    const text = node.text
    WIKILINK_RE.lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = WIKILINK_RE.exec(text)) !== null) {
      const from = pos + m.index
      const to = from + m[0].length
      decos.push(
        Decoration.inline(from, to, {
          class: 'wikilink',
          'data-target': m[1].trim()
        })
      )
    }
  })
  return DecorationSet.create(doc, decos)
}

export interface WikilinkOptions {
  onClickLink: (target: string) => void
}

export const Wikilink = Extension.create<WikilinkOptions>({
  name: 'wikilink',
  addOptions() {
    return { onClickLink: () => {} }
  },
  addProseMirrorPlugins() {
    const options = this.options
    return [
      new Plugin({
        key: new PluginKey('wikilink'),
        state: {
          init: (_, { doc }) => buildDecorations(doc),
          apply: (tr, old) => (tr.docChanged ? buildDecorations(tr.doc) : old)
        },
        props: {
          decorations(state) {
            return this.getState(state)
          },
          handleClick(_view, _pos, event) {
            const el = event.target as HTMLElement | null
            const target = el?.getAttribute?.('data-target')
            if (el?.classList?.contains('wikilink') && target) {
              options.onClickLink(target)
              return true
            }
            return false
          }
        }
      })
    ]
  }
})

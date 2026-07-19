// Extension slash "/" : dùng @tiptap/suggestion để bắt trigger + query, render menu
// bằng ReactRenderer trong popup tippy (tippy.js đã có sẵn). Mỗi lệnh xoá "/query"
// rồi áp block tương ứng.
import { Extension, type Range } from '@tiptap/core'
import type { Editor } from '@tiptap/core'
import Suggestion from '@tiptap/suggestion'
import { ReactRenderer } from '@tiptap/react'
import tippy, { type Instance as TippyInstance } from 'tippy.js'
import 'tippy.js/dist/tippy.css'
import { SlashMenu, type SlashItem, type SlashMenuHandle } from './SlashMenu'

interface CmdArg {
  editor: Editor
  range: Range
}

const COMMANDS: { title: string; hint: string; keys: string[]; run: (a: CmdArg) => void }[] = [
  { title: 'Tiêu đề 1', hint: 'H1', keys: ['h1', 'tieu de', 'heading'], run: ({ editor, range }) => editor.chain().focus().deleteRange(range).setNode('heading', { level: 1 }).run() },
  { title: 'Tiêu đề 2', hint: 'H2', keys: ['h2', 'tieu de'], run: ({ editor, range }) => editor.chain().focus().deleteRange(range).setNode('heading', { level: 2 }).run() },
  { title: 'Tiêu đề 3', hint: 'H3', keys: ['h3', 'tieu de'], run: ({ editor, range }) => editor.chain().focus().deleteRange(range).setNode('heading', { level: 3 }).run() },
  { title: 'Danh sách chấm', hint: '•', keys: ['bullet', 'list', 'danh sach'], run: ({ editor, range }) => editor.chain().focus().deleteRange(range).toggleBulletList().run() },
  { title: 'Danh sách số', hint: '1.', keys: ['ordered', 'number', 'so'], run: ({ editor, range }) => editor.chain().focus().deleteRange(range).toggleOrderedList().run() },
  { title: 'Checklist', hint: '☑', keys: ['task', 'todo', 'check'], run: ({ editor, range }) => editor.chain().focus().deleteRange(range).toggleTaskList().run() },
  { title: 'Trích dẫn', hint: '❝', keys: ['quote', 'trich dan'], run: ({ editor, range }) => editor.chain().focus().deleteRange(range).toggleBlockquote().run() },
  { title: 'Khối code', hint: '</>', keys: ['code'], run: ({ editor, range }) => editor.chain().focus().deleteRange(range).toggleCodeBlock().run() },
  { title: 'Bảng', hint: '⊞', keys: ['table', 'bang'], run: ({ editor, range }) => editor.chain().focus().deleteRange(range).insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run() },
  { title: 'Đường kẻ', hint: '—', keys: ['divider', 'hr', 'duong ke'], run: ({ editor, range }) => editor.chain().focus().deleteRange(range).setHorizontalRule().run() }
]

export const SlashCommand = Extension.create({
  name: 'slashCommand',
  addProseMirrorPlugins() {
    return [
      Suggestion({
        editor: this.editor,
        char: '/',
        startOfLine: false,
        allowSpaces: false,
        command: ({ editor, range, props }) => (props as { run: (a: CmdArg) => void }).run({ editor, range }),
        items: ({ query }: { query: string }) => {
          const q = query.trim().toLowerCase()
          const matched = q
            ? COMMANDS.filter(
                (c) => c.title.toLowerCase().includes(q) || c.keys.some((k) => k.includes(q))
              )
            : COMMANDS
          return matched.map((c) => ({ title: c.title, hint: c.hint, command: c.run }))
        },
        render: () => {
          let component: ReactRenderer<SlashMenuHandle, { items: SlashItem[] }> | null = null
          let popup: TippyInstance[] | null = null
          return {
            onStart: (props) => {
              component = new ReactRenderer(SlashMenu, {
                props: { items: props.items },
                editor: props.editor
              })
              if (!props.clientRect) return
              popup = tippy('body', {
                getReferenceClientRect: props.clientRect as () => DOMRect,
                appendTo: () => document.body,
                content: component.element,
                showOnCreate: true,
                interactive: true,
                trigger: 'manual',
                placement: 'bottom-start'
              })
            },
            onUpdate: (props) => {
              component?.updateProps({ items: props.items })
              if (props.clientRect) {
                popup?.[0]?.setProps({ getReferenceClientRect: props.clientRect as () => DOMRect })
              }
            },
            onKeyDown: (props) => {
              if (props.event.key === 'Escape') {
                popup?.[0]?.hide()
                return true
              }
              return component?.ref?.onKeyDown(props.event) ?? false
            },
            onExit: () => {
              popup?.[0]?.destroy()
              component?.destroy()
            }
          }
        }
      })
    ]
  }
})

// Editor Wiki kiểu Notion (Tiptap). Luôn-sửa-được; auto-save debounce qua onChange.
// Kéo-thả/dán ảnh -> wiki/assets. Slash "/" chèn khối. Bubble menu bôi đen định dạng.
// Wikilink [[..]] tô sáng + bấm điều hướng. Lưu/đọc markdown chuẩn (tiptap-markdown).
import { useEffect, useRef } from 'react'
import { BubbleMenu, EditorContent, useEditor, type Editor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'
import Link from '@tiptap/extension-link'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
import Table from '@tiptap/extension-table'
import TableRow from '@tiptap/extension-table-row'
import TableHeader from '@tiptap/extension-table-header'
import TableCell from '@tiptap/extension-table-cell'
import Placeholder from '@tiptap/extension-placeholder'
import { Markdown } from 'tiptap-markdown'
import { ResolvedImage } from './editor/resolvedImage'
import { Wikilink } from './editor/wikilink'
import { SlashCommand } from './editor/slash'
import { findImageFiles, insertImageFiles } from './editor/imageDrop'

interface NoteEditorProps {
  markdown: string
  onChange: (markdown: string) => void
  onClickWikilink: (target: string) => void
}

export function NoteEditor({ markdown, onChange, onClickWikilink }: NoteEditorProps): React.JSX.Element {
  const editorRef = useRef<Editor | null>(null)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ dropcursor: { color: '#cc785c', width: 2 } }),
      Underline,
      Link.configure({ openOnClick: false }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Table.configure({ resizable: false }),
      TableRow,
      TableHeader,
      TableCell,
      ResolvedImage,
      Placeholder.configure({
        placeholder: 'Viết ghi chú… gõ “/” để chèn khối, kéo ảnh vào để chèn, [[Tên note]] để liên kết.'
      }),
      Markdown.configure({ html: false, transformPastedText: true, transformCopiedText: true }),
      Wikilink.configure({ onClickLink: onClickWikilink }),
      SlashCommand
    ],
    content: markdown,
    editorProps: {
      attributes: { class: 'note-tiptap' },
      handlePaste(view, event) {
        const files = findImageFiles(event.clipboardData)
        if (!files.length || !editorRef.current) return false
        event.preventDefault()
        void insertImageFiles(editorRef.current, files, view.state.selection.from)
        return true
      },
      handleDrop(view, event) {
        const files = findImageFiles((event as DragEvent).dataTransfer)
        if (!files.length || !editorRef.current) return false
        event.preventDefault()
        const coords = view.posAtCoords({ left: (event as DragEvent).clientX, top: (event as DragEvent).clientY })
        const pos = coords?.pos ?? view.state.selection.from
        void insertImageFiles(editorRef.current, files, pos)
        return true
      }
    },
    onUpdate({ editor }) {
      if (saveTimer.current) clearTimeout(saveTimer.current)
      saveTimer.current = setTimeout(() => {
        onChangeRef.current(editor.storage.markdown.getMarkdown())
      }, 600)
    }
  })
  editorRef.current = editor

  // Lưu ngay phần chưa kịp debounce khi rời note/đóng editor.
  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current)
      const ed = editorRef.current
      if (ed && !ed.isDestroyed) onChangeRef.current(ed.storage.markdown.getMarkdown())
    }
  }, [])

  return (
    <div className="note-editor">
      {editor && (
        <BubbleMenu editor={editor} tippyOptions={{ duration: 100 }} className="bubble-menu">
          <button className={editor.isActive('bold') ? 'on' : ''} onClick={() => editor.chain().focus().toggleBold().run()}>
            <b>B</b>
          </button>
          <button className={editor.isActive('italic') ? 'on' : ''} onClick={() => editor.chain().focus().toggleItalic().run()}>
            <i>I</i>
          </button>
          <button className={editor.isActive('underline') ? 'on' : ''} onClick={() => editor.chain().focus().toggleUnderline().run()}>
            <u>U</u>
          </button>
          <button className={editor.isActive('strike') ? 'on' : ''} onClick={() => editor.chain().focus().toggleStrike().run()}>
            <s>S</s>
          </button>
          <button className={editor.isActive('code') ? 'on' : ''} onClick={() => editor.chain().focus().toggleCode().run()}>
            {'</>'}
          </button>
          <button
            className={editor.isActive('link') ? 'on' : ''}
            onClick={() => {
              if (editor.isActive('link')) {
                editor.chain().focus().unsetLink().run()
                return
              }
              const url = window.prompt('Dán đường link:')
              if (url) editor.chain().focus().setLink({ href: url }).run()
            }}
          >
            🔗
          </button>
        </BubbleMenu>
      )}
      <EditorContent editor={editor} className="note-editor-content" />
    </div>
  )
}

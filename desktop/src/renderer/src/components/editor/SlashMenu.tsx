// Danh sách lệnh slash "/" (Notion-style). forwardRef để suggestion uỷ quyền phím
// mũi tên/Enter vào đây. Điều hướng bằng bàn phím + bấm chuột.
import { forwardRef, useEffect, useImperativeHandle, useState } from 'react'

export interface SlashItem {
  title: string
  hint: string
  command: () => void
}

export interface SlashMenuHandle {
  onKeyDown: (e: KeyboardEvent) => boolean
}

export const SlashMenu = forwardRef<SlashMenuHandle, { items: SlashItem[] }>(function SlashMenu(
  { items },
  ref
) {
  const [sel, setSel] = useState(0)
  useEffect(() => setSel(0), [items])

  useImperativeHandle(ref, () => ({
    onKeyDown: (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        setSel((s) => (s + 1) % Math.max(items.length, 1))
        return true
      }
      if (e.key === 'ArrowUp') {
        setSel((s) => (s - 1 + items.length) % Math.max(items.length, 1))
        return true
      }
      if (e.key === 'Enter') {
        items[sel]?.command()
        return true
      }
      return false
    }
  }))

  if (!items.length) return <div className="slash-menu slash-empty">Không có lệnh</div>
  return (
    <div className="slash-menu">
      {items.map((it, i) => (
        <button
          key={it.title}
          className={`slash-item ${i === sel ? 'active' : ''}`}
          onMouseEnter={() => setSel(i)}
          onMouseDown={(e) => {
            e.preventDefault()
            it.command()
          }}
        >
          <span className="slash-title">{it.title}</span>
          <span className="slash-hint">{it.hint}</span>
        </button>
      ))}
    </div>
  )
})

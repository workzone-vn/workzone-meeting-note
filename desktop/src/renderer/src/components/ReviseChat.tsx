// Trợ lý biên bản: floating button + popover chat ở màn chi tiết cuộc họp.
// 2 chế độ: "Sửa biên bản" (engine `revise` viết lại bien-ban.md) và "Lưu Wiki"
// (engine `wiki-note` chắt nội dung cuộc họp thành ghi chú Wiki). Lịch sử chat
// chỉ giữ trong state khi màn hình đang mở, không lưu file.
import { useEffect, useRef, useState } from 'react'
import { PaperPlaneTilt, Sparkle } from './icons'

interface Msg {
  role: 'user' | 'ai'
  text: string
  error?: boolean
}

const QUICK_CHIPS = [
  { label: 'Chi tiết hơn', prompt: 'Viết chi tiết hơn, bổ sung thêm ý từ transcript.' },
  { label: 'Ngắn gọn hơn', prompt: 'Viết ngắn gọn hơn, giữ đủ ý chính.' }
]

const DONE_MSG = 'Đã cập nhật biên bản theo yêu cầu. Bạn xem lại nội dung nhé - ưng ý thì bấm "Xuất PDF".'
const NO_CLAUDE_MSG =
  'Chưa thấy Claude Code trên máy nên không làm được. Cài đặt theo hướng dẫn ở mục Cài đặt rồi thử lại nhé.'

export function ReviseChat({
  name,
  onUpdated
}: {
  name: string
  onUpdated: () => void
}): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<'revise' | 'wiki'>('revise')
  const [msgs, setMsgs] = useState<Msg[]>([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const listRef = useRef<HTMLDivElement>(null)

  // Đổi cuộc họp -> hội thoại cũ không còn liên quan
  useEffect(() => {
    setMsgs([])
    setInput('')
    setOpen(false)
    setMode('revise')
  }, [name])

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight })
  }, [msgs, busy, open])

  const send = async (text: string): Promise<void> => {
    const t = text.trim()
    if (!t || busy) return
    setMsgs((m) => [...m, { role: 'user', text: t }])
    setInput('')
    setBusy(true)
    const failVerb = mode === 'wiki' ? 'Tạo ghi chú không thành công' : 'Sửa không thành công'
    try {
      if (mode === 'wiki') {
        const r = await window.wz.meetingsWikiNote(name, t)
        if (r.ok) {
          setMsgs((m) => [
            ...m,
            { role: 'ai', text: `Đã tạo ghi chú Wiki: "${r.title}". Mở tab Wiki để xem/sửa - ghi chú cũng vào đồ thị và ô hỏi AI luôn.` }
          ])
        } else if (r.errorCode === 'NO_CLAUDE') {
          setMsgs((m) => [...m, { role: 'ai', error: true, text: NO_CLAUDE_MSG }])
        } else {
          setMsgs((m) => [
            ...m,
            { role: 'ai', error: true, text: `${failVerb}: ${r.message || 'lỗi không rõ'}` }
          ])
        }
        return
      }
      const r = await window.wz.meetingsRevise(name, t)
      if (r.ok) {
        onUpdated()
        setMsgs((m) => [...m, { role: 'ai', text: DONE_MSG }])
      } else if (r.errorCode === 'NO_CLAUDE') {
        setMsgs((m) => [...m, { role: 'ai', error: true, text: NO_CLAUDE_MSG }])
      } else {
        setMsgs((m) => [
          ...m,
          { role: 'ai', error: true, text: `${failVerb}: ${r.message || 'lỗi không rõ'}` }
        ])
      }
    } catch (e) {
      setMsgs((m) => [
        ...m,
        { role: 'ai', error: true, text: `${failVerb}: ${e instanceof Error ? e.message : e}` }
      ])
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      {open && (
        <div className="revise-pop">
          <div className="revise-head">
            <span className="revise-title">
              <Sparkle size={15} /> Trợ lý biên bản
            </span>
            <button className="revise-close" title="Đóng" onClick={() => setOpen(false)}>
              ✕
            </button>
          </div>
          <div className="revise-msgs" ref={listRef}>
            {msgs.length === 0 && !busy && (
              <div className="revise-empty">
                {mode === 'revise' ? (
                  <>
                    Nhắn yêu cầu để AI chỉnh sửa nội dung biên bản, ví dụ: &quot;bỏ mục 4&quot;,
                    &quot;tóm tắt gọn hơn&quot;, &quot;bổ sung phần bàn về ngân sách&quot;.
                  </>
                ) : (
                  <>
                    Mô tả phần nội dung cuộc họp muốn lưu thành ghi chú Wiki, ví dụ: &quot;nội
                    dung đào tạo về social content&quot;, &quot;các quyết định về ngân sách&quot;.
                  </>
                )}
              </div>
            )}
            {msgs.map((m, i) => (
              <div key={i} className={`revise-msg ${m.role}${m.error ? ' error' : ''}`}>
                {m.text}
              </div>
            ))}
            {busy && (
              <div className="revise-working">
                <span className="spinner" /> {mode === 'wiki' ? 'Đang tạo ghi chú Wiki...' : 'Đang chỉnh sửa...'}
              </div>
            )}
          </div>
          <div className="revise-chips">
            <button
              className={`revise-chip mode ${mode === 'revise' ? 'active' : ''}`}
              disabled={busy}
              onClick={() => setMode('revise')}
            >
              Sửa biên bản
            </button>
            <button
              className={`revise-chip mode ${mode === 'wiki' ? 'active' : ''}`}
              disabled={busy}
              onClick={() => setMode('wiki')}
            >
              Lưu Wiki
            </button>
            {mode === 'revise' &&
              QUICK_CHIPS.map((c) => (
                <button key={c.label} className="revise-chip" disabled={busy} onClick={() => void send(c.prompt)}>
                  {c.label}
                </button>
              ))}
          </div>
          <div className="revise-inputrow">
            <input
              className="revise-input"
              placeholder={
                mode === 'wiki' ? 'Muốn lưu nội dung gì vào Wiki?...' : 'Nhắn yêu cầu chỉnh sửa...'
              }
              value={input}
              disabled={busy}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void send(input)
              }}
            />
            <button
              className="revise-send"
              title="Gửi"
              disabled={busy || !input.trim()}
              onClick={() => void send(input)}
            >
              {busy ? <span className="spinner" /> : <PaperPlaneTilt size={16} />}
            </button>
          </div>
        </div>
      )}
      <button
        className={`revise-fab ${open ? 'open' : ''}`}
        title={open ? 'Đóng trợ lý biên bản' : 'Trợ lý biên bản - chat để AI sửa nội dung'}
        onClick={() => setOpen((v) => !v)}
      >
        {open ? '✕' : <Sparkle size={22} />}
      </button>
    </>
  )
}

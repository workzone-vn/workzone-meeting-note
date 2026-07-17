import { useEffect, useRef, useState } from 'react'
import type { Task } from '../../../shared/types'
import { Archive, ArrowUUpLeft, CheckSquare, FileText, Plus, Trash } from '../components/icons'
import { titleCase } from '../lib/format'

type Field = 'name' | 'assignee' | 'due'
type View = 'active' | 'archived'

export function Tasks({
  onOpenMeeting
}: {
  onOpenMeeting: (name: string) => void
}): React.JSX.Element {
  const [tasks, setTasks] = useState<Task[] | null>(null)
  const [focusId, setFocusId] = useState<string | null>(null) // ô Name cần focus sau khi thêm
  const [view, setView] = useState<View>('active') // đang xem "Đang làm" hay "Lưu trữ"
  // giá trị 3 ô đã lưu gần nhất -> chỉ gọi update khi blur nếu có thay đổi
  const savedRef = useRef<Record<string, Pick<Task, 'name' | 'assignee' | 'due'>>>({})

  const remember = (t: Task): void => {
    savedRef.current[t.id] = { name: t.name, assignee: t.assignee, due: t.due }
  }

  useEffect(() => {
    void window.wz
      .tasksList()
      .then((list) => {
        list.forEach(remember)
        setTasks(list)
      })
      .catch(() => setTasks([]))
  }, [])

  // Coi thiếu field archived là false (tương thích tasks.json cũ)
  const isArchived = (t: Task): boolean => !!t.archived
  const archivedCount = (tasks ?? []).filter(isArchived).length

  // Lọc theo view rồi sắp xếp: chưa xong trước (createdAt tăng), đã xong xuống cuối
  const sorted = [...(tasks ?? [])]
    .filter((t) => (view === 'archived' ? isArchived(t) : !isArchived(t)))
    .sort((a, b) => (a.done !== b.done ? Number(a.done) - Number(b.done) : a.createdAt - b.createdAt))

  const setField = (id: string, field: Field, value: string): void =>
    setTasks((prev) => (prev ?? []).map((t) => (t.id === id ? { ...t, [field]: value } : t)))

  const saveField = async (t: Task, field: Field): Promise<void> => {
    const saved = savedRef.current[t.id]
    if (saved && saved[field] === t[field]) return // không đổi -> khỏi ghi
    const updated = await window.wz.tasksUpdate(t.id, { [field]: t[field] })
    remember(updated)
  }

  const toggleDone = async (t: Task): Promise<void> => {
    const updated = await window.wz.tasksUpdate(t.id, { done: !t.done })
    remember(updated)
    setTasks((prev) => (prev ?? []).map((x) => (x.id === t.id ? updated : x)))
  }

  // Lưu trữ / khôi phục: dùng lại kênh tasksUpdate, chỉ đổi cờ archived
  const setArchived = async (t: Task, archived: boolean): Promise<void> => {
    const updated = await window.wz.tasksUpdate(t.id, { archived })
    remember(updated)
    setTasks((prev) => (prev ?? []).map((x) => (x.id === t.id ? updated : x)))
  }

  const addItem = async (): Promise<void> => {
    const t = await window.wz.tasksCreate({})
    remember(t)
    setTasks((prev) => [...(prev ?? []), t])
    setFocusId(t.id)
  }

  const removeItem = async (id: string): Promise<void> => {
    await window.wz.tasksDelete(id)
    delete savedRef.current[id]
    setTasks((prev) => (prev ?? []).filter((t) => t.id !== id))
  }

  if (tasks === null) return <div className="empty">Đang tải...</div>

  const isActive = view === 'active'

  return (
    <div>
      <h1 className="page-title">Tasks</h1>

      <div className="task-toggle">
        <button
          className={`profile-chip ${isActive ? 'active' : ''}`}
          onClick={() => setView('active')}
        >
          Đang làm
        </button>
        <button
          className={`profile-chip ${!isActive ? 'active' : ''}`}
          onClick={() => setView('archived')}
        >
          Lưu trữ ({archivedCount})
        </button>
      </div>

      {sorted.length === 0 ? (
        isActive ? (
          <div className="empty">
            Chưa có việc nào. Thêm từ Action items của một cuộc họp, hoặc bấm <Plus size={14} /> Add
            item.
            <div style={{ marginTop: 16 }}>
              <button className="btn" onClick={() => void addItem()}>
                <Plus size={15} /> Add item
              </button>
            </div>
          </div>
        ) : (
          <div className="empty">Chưa có việc lưu trữ.</div>
        )
      ) : (
        <div className="task-table">
          <div className="task-table-head">
            <span title="Xong">
              <CheckSquare size={15} />
            </span>
            <span>Name</span>
            <span>Assignee</span>
            <span>Due date</span>
            {isActive ? (
              <button className="task-add-btn" title="Thêm việc" onClick={() => void addItem()}>
                <Plus size={16} />
              </button>
            ) : (
              <span />
            )}
          </div>

          {sorted.map((t) => (
            <div className={`task-row ${t.done ? 'done' : ''}`} key={t.id}>
              <input
                type="checkbox"
                className="task-check"
                checked={t.done}
                onChange={() => void toggleDone(t)}
              />
              <div className="task-name-cell">
                <input
                  className="task-input"
                  placeholder="Untitled item"
                  value={t.name}
                  ref={(el) => {
                    if (el && t.id === focusId) {
                      el.focus()
                      setFocusId(null)
                    }
                  }}
                  onChange={(e) => setField(t.id, 'name', e.target.value)}
                  onBlur={() => void saveField(t, 'name')}
                />
                {t.source?.meeting && (
                  <button
                    className="task-source"
                    title="Mở cuộc họp nguồn"
                    onClick={() => onOpenMeeting(t.source!.meeting)}
                  >
                    <FileText size={12} /> {titleCase(t.source.meeting)}
                  </button>
                )}
              </div>
              <input
                className="task-input"
                placeholder="—"
                value={t.assignee}
                onChange={(e) => setField(t.id, 'assignee', e.target.value)}
                onBlur={() => void saveField(t, 'assignee')}
              />
              <input
                className="task-input"
                placeholder="—"
                value={t.due}
                onChange={(e) => setField(t.id, 'due', e.target.value)}
                onBlur={() => void saveField(t, 'due')}
              />
              <div className="task-actions">
                {isActive ? (
                  <button
                    className="task-act"
                    title="Lưu trữ việc"
                    onClick={() => void setArchived(t, true)}
                  >
                    <Archive size={13} /> Lưu trữ
                  </button>
                ) : (
                  <button
                    className="task-act"
                    title="Khôi phục việc"
                    onClick={() => void setArchived(t, false)}
                  >
                    <ArrowUUpLeft size={13} /> Khôi phục
                  </button>
                )}
                <button className="task-del" title="Xoá việc" onClick={() => void removeItem(t.id)}>
                  <Trash size={15} />
                </button>
              </div>
            </div>
          ))}

          {isActive && (
            <button className="task-add-row" onClick={() => void addItem()}>
              <Plus size={15} /> Add item
            </button>
          )}
        </div>
      )}
    </div>
  )
}

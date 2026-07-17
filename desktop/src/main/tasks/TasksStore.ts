// Danh sách việc cần làm của user. Lưu nguyên mảng ở ~/wz-bien-ban/tasks.json.
// Toàn bộ xử lý ở main; renderer chỉ gọi qua IPC.
import { randomUUID } from 'crypto'
import * as fs from 'fs'
import type { Task, TaskInput } from '../../shared/types'
import { dataDir, tasksFile } from '../paths'

function read(): Task[] {
  try {
    const parsed = JSON.parse(fs.readFileSync(tasksFile, 'utf8'))
    return Array.isArray(parsed) ? parsed : []
  } catch {
    // chưa có file hoặc JSON hỏng -> coi như rỗng, không crash
    return []
  }
}

function write(list: Task[]): void {
  fs.mkdirSync(dataDir, { recursive: true })
  fs.writeFileSync(tasksFile, JSON.stringify(list, null, 2))
}

/** Tạo 1 task từ input (dùng lại cho create + createMany). Chưa ghi file. */
function build(input: TaskInput): Task {
  return {
    id: randomUUID(),
    name: input.name ?? '',
    assignee: input.assignee ?? '',
    due: input.due ?? '',
    done: false,
    archived: false,
    ...(input.source ? { source: input.source } : {}),
    createdAt: Date.now()
  }
}

export function listTasks(): Task[] {
  return read()
}

export function createTask(input: TaskInput): Task {
  const list = read()
  const task = build(input)
  list.push(task)
  write(list)
  return task
}

export function createTasks(inputs: TaskInput[]): Task[] {
  const list = read()
  const created = inputs.map(build)
  list.push(...created)
  write(list)
  return created
}

export function updateTask(
  id: string,
  patch: Partial<Pick<Task, 'name' | 'assignee' | 'due' | 'done' | 'archived'>>
): Task {
  const list = read()
  const i = list.findIndex((t) => t.id === id)
  if (i === -1) throw new Error(`Không tìm thấy task: ${id}`)
  list[i] = { ...list[i], ...patch }
  write(list)
  return list[i]
}

export function deleteTask(id: string): void {
  write(read().filter((t) => t.id !== id))
}

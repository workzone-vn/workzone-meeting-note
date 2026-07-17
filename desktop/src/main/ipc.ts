import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import * as fs from 'fs'
import * as path from 'path'
import { dataDir } from './paths'
import { IPC, IPC_EVENTS } from '../shared/ipc-contract'
import type {
  PipelineState,
  ReviseResult,
  SetupProgress,
  Settings,
  Task,
  TaskInput
} from '../shared/types'
import { isRecording, run, runStreaming } from './engine/EngineService'
import {
  exportPdfFor,
  getPipelineState,
  importAndProcess,
  onPipelineChange,
  processMeeting,
  resetPipeline,
  retryMinutes,
  stopAndSave
} from './engine/PipelineService'
import { confirmDialog } from './confirm'
import {
  deleteMeeting,
  findReplaceInMeeting,
  getMeeting,
  listMeetings,
  meetingDir,
  saveBienban,
  searchMeetings,
  setMeetingProfiles,
  setMeetingTitle,
  type FindReplacePair
} from './meetings'
import { PERSONAL_PROFILE, createProfile, listProfiles, profileGlossaryFile } from './profiles'
import {
  createNote,
  deleteNote,
  getNote,
  listNotes,
  resolveTitle,
  saveNote
} from './wiki/WikiStore'
import { getSetupStatus, startSetup } from './setup/SetupService'
import { getSettings, setSettings } from './settings/SettingsStore'
import {
  createTask,
  createTasks,
  deleteTask,
  listTasks,
  updateTask
} from './tasks/TasksStore'

function broadcast(channel: string, payload: unknown): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send(channel, payload)
  }
}

export function registerIpc(): void {
  onPipelineChange((s: PipelineState) => broadcast(IPC_EVENTS.pipelineProgress, s))

  ipcMain.handle(IPC.setupGetStatus, () => getSetupStatus())
  ipcMain.handle(IPC.setupStart, () => {
    // chạy nền, tiến trình báo qua event; không await để không treo invoke
    void startSetup((p: SetupProgress) => broadcast(IPC_EVENTS.setupProgress, p))
  })

  ipcMain.handle(IPC.recorderStart, async (_e, name?: string, profiles?: string[]) => {
    const profs = profiles ?? []
    const args = [
      'record-start',
      ...(name ? [name] : []),
      ...profs.flatMap((p) => ['--profile', p])
    ]
    const r = await run(args)
    if (r.code !== 0) throw new Error((r.stdout + r.stderr).slice(-300) || 'Không bắt đầu ghi được.')
    setSettings({ lastProfiles: profs }) // nhớ cho lần sau + cho tray
    const st = isRecording()
    broadcast(IPC_EVENTS.recorderChanged, st)
    return {
      name: st.name ?? name ?? '',
      warnSilent: r.stdout.includes('WARN_SILENT'),
      // syscap chết vì chưa cấp quyền Ghi âm thanh hệ thống (hoặc macOS < 14.2)
      // -> engine đã hạ xuống mic-only
      warnNoSystemAudio: r.stdout.includes('WARN_NOSYS')
    }
  })

  ipcMain.handle(IPC.recorderStop, async () => {
    const ok = await confirmDialog(
      'Kết thúc cuộc họp?',
      'Ghi âm sẽ dừng và lưu lại. Transcript & biên bản tạo sau, lúc nào bạn muốn.',
      'Kết thúc & lưu'
    )
    if (!ok) return { stopped: false }
    // await đến khi lưu xong (vài giây trộn audio) - renderer hiện "Đang lưu...".
    // KHÔNG transcript ở đây: ghi cuộc mới được ngay, xử lý là hành động chủ động.
    broadcast(IPC_EVENTS.recorderChanged, { recording: false })
    const r = await stopAndSave()
    broadcast(IPC_EVENTS.recorderChanged, isRecording())
    return { stopped: true, name: r.name ?? undefined, error: r.error }
  })

  // Sinh tiêu đề hiển thị từ nội dung: có biên bản thì lấy từ H1 (tức thì),
  // chưa có thì Claude đặt từ đoạn đầu transcript (có thể vài chục giây).
  ipcMain.handle(IPC.meetingsGenerateTitle, async (_e, name: string) => {
    meetingDir(name) // validate tên
    const r = await runStreaming(['title', name], () => {}, 3 * 60_000)
    if (r.code === 2 || r.stdout.includes('NO_CLAUDE')) {
      return { ok: false, errorCode: 'NO_CLAUDE' }
    }
    const m = r.stdout.match(/^TITLE=(.+)$/m)
    if (r.code !== 0 || !m) {
      return { ok: false, errorCode: 'GENERIC', message: (r.stdout + r.stderr).slice(-200) }
    }
    return { ok: true, title: m[1].trim() }
  })

  ipcMain.handle(IPC.meetingsSetTitle, (_e, name: string, title: string) =>
    setMeetingTitle(name, title)
  )
  ipcMain.handle(IPC.meetingsSearch, (_e, q: string) => searchMeetings(q))

  // Trợ lý biên bản chế độ "Lưu Wiki": chắt nội dung cuộc họp thành ghi chú Wiki.
  ipcMain.handle(IPC.meetingsWikiNote, async (_e, name: string, request: string) => {
    meetingDir(name) // validate tên
    const r = await runStreaming(['wiki-note', name], () => {}, 10 * 60_000, request)
    if (r.code === 2 || r.stdout.includes('NO_CLAUDE')) return { ok: false, errorCode: 'NO_CLAUDE' }
    const id = r.stdout.match(/^NOTE_ID=(.+)$/m)?.[1]?.trim()
    const title = r.stdout.match(/^NOTE_TITLE=(.+)$/m)?.[1]?.trim()
    if (r.code !== 0 || !id || !title) {
      return { ok: false, errorCode: 'GENERIC', message: (r.stdout + r.stderr).slice(-300) }
    }
    return { ok: true, id, title }
  })

  // Xử lý nền theo yêu cầu: transcript -> biên bản -> PDF (tiến trình qua event).
  ipcMain.handle(IPC.meetingsProcess, (_e, name: string) => {
    meetingDir(name) // validate tên
    const st = getPipelineState()
    const busy = !['idle', 'done', 'error'].includes(st.stage)
    if (busy) return { started: false, busyWith: st.meetingName }
    void processMeeting(name)
    return { started: true }
  })

  ipcMain.handle(IPC.importFile, async () => {
    const res = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [{ name: 'Ghi âm', extensions: ['webm', 'm4a', 'mp3', 'wav'] }]
    })
    if (res.canceled || res.filePaths.length === 0) return { started: false, canceled: true }
    // chạy nền - pipeline báo tiến trình qua event (giống record-stop)
    void importAndProcess(res.filePaths[0])
    return { started: true }
  })

  ipcMain.handle(IPC.recorderStatus, () => isRecording())
  ipcMain.handle(IPC.pipelineState, () => getPipelineState())
  ipcMain.handle(IPC.pipelineReset, () => resetPipeline())

  ipcMain.handle(IPC.meetingsList, () => listMeetings())
  ipcMain.handle(IPC.meetingsGet, (_e, name: string) => getMeeting(name))
  ipcMain.handle(IPC.meetingsOpenFolder, (_e, name: string) => shell.openPath(meetingDir(name)))
  ipcMain.handle(IPC.meetingsOpenPdf, (_e, name: string) =>
    shell.openPath(path.join(meetingDir(name), 'bien-ban.pdf'))
  )
  ipcMain.handle(IPC.meetingsExportPdf, async (_e, name: string) => ({
    pdfPath: await exportPdfFor(name)
  }))
  ipcMain.handle(IPC.meetingsWriteMinutes, (_e, name: string) => {
    const st = getPipelineState()
    const busy = !['idle', 'done', 'error'].includes(st.stage)
    if (busy && st.meetingName !== name) return { started: false, busyWith: st.meetingName }
    void retryMinutes(name)
    return { started: true }
  })
  ipcMain.handle(IPC.meetingsSaveBienban, (_e, name: string, content: string) =>
    saveBienban(name, content)
  )
  ipcMain.handle(IPC.meetingsSetProfile, (_e, name: string, profiles: string[]) =>
    setMeetingProfiles(name, profiles)
  )
  ipcMain.handle(IPC.meetingsDelete, async (_e, name: string) => {
    if (isRecording().name === name) {
      await dialog.showMessageBox({
        type: 'info',
        message: 'Cuộc họp này đang ghi âm',
        detail: 'Kết thúc cuộc họp trước rồi mới xoá được.',
        buttons: ['OK']
      })
      return { deleted: false }
    }
    const ok = await confirmDialog(
      `Xoá cuộc họp "${name}"?`,
      'Toàn bộ ghi âm, transcript, biên bản và PDF của cuộc họp này sẽ bị xoá vĩnh viễn. Không hoàn tác được.',
      'Xoá vĩnh viễn'
    )
    if (!ok) return { deleted: false }
    deleteMeeting(name)
    return { deleted: true }
  })
  ipcMain.handle(
    IPC.meetingsFindReplace,
    (_e, name: string, pairs: FindReplacePair[], scope: { bienban: boolean; transcript: boolean }) =>
      findReplaceInMeeting(name, pairs, scope)
  )

  // Trợ lý biên bản: gửi yêu cầu sửa tự do -> engine `revise` (claude -p) ghi đè
  // bien-ban.md. Chạy độc lập, KHÔNG đụng pipeline state; mỗi cuộc họp 1 yêu cầu
  // tại 1 thời điểm. Trả ReviseResult thay vì throw để chat hiện lỗi trong bubble.
  const revising = new Set<string>()
  ipcMain.handle(
    IPC.meetingsRevise,
    async (_e, name: string, feedback: string): Promise<ReviseResult> => {
      meetingDir(name) // validate tên (chặn path traversal) trước khi đưa vào argv
      if (revising.has(name)) {
        return { ok: false, errorCode: 'BUSY', message: 'Đang có một yêu cầu sửa chạy dở.' }
      }
      revising.add(name)
      try {
        const r = await runStreaming(['revise', name], () => {}, 20 * 60_000, feedback)
        if (r.code === 2 || r.stdout.includes('NO_CLAUDE')) {
          return { ok: false, errorCode: 'NO_CLAUDE' }
        }
        if (r.code !== 0) {
          return { ok: false, errorCode: 'GENERIC', message: (r.stdout + r.stderr).slice(-300) }
        }
        return { ok: true }
      } finally {
        revising.delete(name)
      }
    }
  )

  ipcMain.handle(IPC.devicesList, async () => {
    const r = await run(['devices'])
    if (r.code !== 0) return []
    try {
      return JSON.parse(r.stdout)
    } catch {
      return []
    }
  })

  ipcMain.handle(IPC.settingsGet, () => getSettings())
  ipcMain.handle(IPC.settingsSet, (_e, patch: Partial<Settings>) => setSettings(patch))

  ipcMain.handle(IPC.engineCheck, async () => {
    const r = await run(['check'])
    return { ok: r.code === 0, detail: (r.stdout + r.stderr).trim() }
  })

  // Hồ sơ ngữ cảnh của người dùng - văn bản TỰ DO dạng markdown
  // (profiles/<tên>/context.md); null coi như hồ sơ "Cá nhân".
  const glossaryFileFor = (profile?: string | null): string =>
    profileGlossaryFile(profile || PERSONAL_PROFILE)

  const CONTEXT_TEMPLATE_PERSONAL =
    'Viết tự do về bạn và những gì AI cần biết khi viết biên bản. Ví dụ:\n\n' +
    'Tôi là Nguyễn Văn A, trưởng phòng kinh doanh.\n' +
    'Đồng nghiệp hay họp cùng: chị Hoa (kế toán trưởng), anh Minh (kỹ thuật).\n' +
    'Từ hay bị nghe sai: "đét lai" là deadline, "pho cát" là forecast.\n'
  const contextTemplateCompany = (name: string): string =>
    `Viết tự do về ${name} để AI hiểu đúng nội dung họp. Ví dụ:\n\n` +
    `${name} hoạt động trong lĩnh vực [...]. Sản phẩm chính: [...].\n` +
    'Người tham gia họp: anh B (giám đốc), chị C (marketing)...\n' +
    'Thuật ngữ nội bộ và từ hay bị nghe sai: "..." nghĩa là "...".\n'

  ipcMain.handle(IPC.glossaryGet, (_e, profile?: string | null) => {
    const f = glossaryFileFor(profile)
    const isPersonal = !profile || profile === PERSONAL_PROFILE
    const exists = fs.existsSync(f)
    const content = exists
      ? fs.readFileSync(f, 'utf8')
      : isPersonal
        ? CONTEXT_TEMPLATE_PERSONAL
        : contextTemplateCompany(profile!)
    // exists: máy mới chưa viết ngữ cảnh -> Home hiện gợi ý khởi tạo
    return { content, path: f, exists }
  })
  ipcMain.handle(IPC.glossarySave, (_e, content: string, profile?: string | null) => {
    const f = glossaryFileFor(profile)
    fs.mkdirSync(path.dirname(f), { recursive: true })
    fs.writeFileSync(f, content, 'utf8')
  })
  ipcMain.handle(IPC.glossaryReveal, (_e, profile?: string | null) => {
    const f = glossaryFileFor(profile)
    if (fs.existsSync(f)) shell.showItemInFolder(f) // mở Finder, bôi đậm file
    else void shell.openPath(path.dirname(f))
  })

  ipcMain.handle(IPC.profilesList, () => listProfiles())
  ipcMain.handle(IPC.profilesCreate, (_e, name: string) => createProfile(name))

  // ---------- Wiki (ghi chú markdown + wikilink + tag) ----------
  ipcMain.handle(IPC.wikiList, () => listNotes())
  ipcMain.handle(IPC.wikiGet, (_e, id: string) => getNote(id))
  ipcMain.handle(IPC.wikiCreate, (_e, title: string, content?: string) =>
    createNote(title, content)
  )
  ipcMain.handle(
    IPC.wikiSave,
    (_e, id: string, patch: { title: string; tags: string[]; content: string }) =>
      saveNote(id, patch)
  )
  ipcMain.handle(IPC.wikiDelete, async (_e, id: string) => {
    const ok = await confirmDialog(
      `Xoá ghi chú "${id}"?`,
      'Ghi chú sẽ bị xoá vĩnh viễn khỏi Wiki. Không hoàn tác được.',
      'Xoá vĩnh viễn'
    )
    if (!ok) return { deleted: false }
    deleteNote(id)
    return { deleted: true }
  })
  ipcMain.handle(IPC.wikiResolve, (_e, target: string) => resolveTitle(target))
  // Xuất PDF 1 ghi chú: renderer gửi HTML đã render (tái dùng mdToHtml + wikilink),
  // main bọc template in + printToPDF (PdfService). User chọn nơi lưu.
  ipcMain.handle(IPC.wikiExportPdf, async (_e, id: string, bodyHtml: string) => {
    const note = getNote(id)
    const res = await dialog.showSaveDialog({
      defaultPath: path.join(
        app.getPath('downloads'),
        `${note.title.replace(/[/\\:]/g, '-')}.pdf`
      ),
      filters: [{ name: 'PDF', extensions: ['pdf'] }]
    })
    if (res.canceled || !res.filePath) return { saved: null }
    const esc = (s: string): string =>
      s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    const when = note.updated
      ? new Date(note.updated * 1000).toLocaleDateString('vi-VN')
      : ''
    const html = `<!DOCTYPE html><html lang="vi"><head><meta charset="utf-8"><style>
      @page { size: A4; margin: 16mm; }
      body { font-family: -apple-system, 'Segoe UI', Roboto, Arial, sans-serif;
             color: #26303f; line-height: 1.65; font-size: 13px; }
      h1.note-title { color: #1c3d6e; font-size: 22px; margin: 0 0 2px; }
      .note-meta { color: #6b7c91; font-size: 11.5px; margin-bottom: 18px;
                   padding-bottom: 10px; border-bottom: 2px solid #1c3d6e; }
      h1, h2, h3 { color: #1c3d6e; }
      table { border-collapse: collapse; width: 100%; margin: 10px 0; }
      th { background: #1c3d6e; color: #fff; text-align: left; }
      th, td { border: 1px solid #d5deeb; padding: 6px 10px; font-size: 12.5px; }
      code { background: #eef2f8; padding: 1px 5px; border-radius: 4px; }
      .wikilink { color: #2f7fd1; border-bottom: 1px dashed #2f7fd1; }
      blockquote { border-left: 3px solid #2f7fd1; margin: 8px 0; padding: 2px 12px; color: #44506170; }
    </style></head><body>
      <h1 class="note-title">${esc(note.title)}</h1>
      <div class="note-meta">Wiki · ${when}${note.tags.length ? ' · ' + esc(note.tags.map((t) => `#${t}`).join('  ')) : ''}</div>
      ${bodyHtml}
    </body></html>`
    const tmp = path.join(app.getPath('temp'), `wiki-print-${Date.now()}.html`)
    await fs.promises.writeFile(tmp, html, 'utf8')
    const { renderPdf } = await import('./pdf/PdfService')
    await renderPdf(tmp, res.filePath)
    shell.showItemInFolder(res.filePath)
    return { saved: res.filePath }
  })
  // Hỏi wiki bằng AI: engine chấm điểm từ khoá + lan theo wikilink rồi hỏi Claude.
  ipcMain.handle(IPC.wikiAsk, async (_e, question: string) => {
    const r = await runStreaming(['wiki-ask'], () => {}, 5 * 60_000, question)
    if (r.code === 2 || r.stdout.includes('NO_CLAUDE')) return { ok: false, errorCode: 'NO_CLAUDE' }
    if (r.code !== 0) {
      return { ok: false, errorCode: 'GENERIC', message: (r.stdout + r.stderr).slice(-300) }
    }
    const srcMatch = r.stdout.match(/^SOURCES=(.*)$/m)
    const answer = r.stdout.replace(/^SOURCES=.*$/m, '').trim()
    const titles = new Map(listNotes().map((n) => [n.id, n.title]))
    const sources = (srcMatch?.[1] ?? '')
      .split('|')
      .map((s) => s.trim())
      .filter((id) => titles.has(id))
      .map((id) => ({ id, title: titles.get(id)! }))
    return { ok: true, answer, sources }
  })

  // Việc cần làm (trang Tasks) - đọc/ghi thẳng tasks.json qua TasksStore.
  ipcMain.handle(IPC.tasksList, () => listTasks())
  ipcMain.handle(IPC.tasksCreate, (_e, input: TaskInput) => createTask(input))
  ipcMain.handle(IPC.tasksCreateMany, (_e, inputs: TaskInput[]) => createTasks(inputs))
  ipcMain.handle(
    IPC.tasksUpdate,
    (_e, id: string, patch: Partial<Pick<Task, 'name' | 'assignee' | 'due' | 'done'>>) =>
      updateTask(id, patch)
  )
  ipcMain.handle(IPC.tasksDelete, (_e, id: string) => deleteTask(id))

  ipcMain.handle(IPC.openExternal, (_e, url: string) => {
    if (/^https:\/\//.test(url)) return shell.openExternal(url)
    return undefined
  })

  ipcMain.handle(IPC.appVersion, () => app.getVersion())

  // Mở khung "Ghi màn hình & âm thanh hệ thống" trong Cài đặt hệ thống - đây cũng là
  // nơi chứa mục "Chỉ ghi âm thanh hệ thống" (System Audio Recording Only) mà
  // wz-syscap (Core Audio Tap) cần; anchor Privacy_ScreenCapture mở đúng pane này.
  ipcMain.handle(IPC.openScreenRecordingPrefs, () => {
    if (process.platform !== 'darwin') return undefined
    return shell.openExternal(
      'x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture'
    )
  })
}

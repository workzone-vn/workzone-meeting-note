import { contextBridge, ipcRenderer } from 'electron'
import { IPC, IPC_EVENTS } from '../shared/ipc-contract'
import type {
  AudioDevice,
  EngineCheck,
  GitSyncConfig,
  MeetingDetail,
  MeetingSummary,
  MeetingWikiNoteResult,
  PipelineState,
  ProcessStart,
  RecorderStatus,
  RecorderStopResult,
  ReviseResult,
  Settings,
  SetupProgress,
  TitleResult,
  WikiAskResult,
  WikiNote,
  WikiNoteMeta,
  SetupStatus,
  Task,
  TaskInput
} from '../shared/types'
import type { SyncPhase, SyncResult } from '../main/gitsync/GitSync'

function on<T>(channel: string) {
  return (cb: (payload: T) => void): (() => void) => {
    const listener = (_e: Electron.IpcRendererEvent, payload: T): void => cb(payload)
    ipcRenderer.on(channel, listener)
    return () => ipcRenderer.removeListener(channel, listener)
  }
}

export const wzApi = {
  setupGetStatus: (): Promise<SetupStatus> => ipcRenderer.invoke(IPC.setupGetStatus),
  setupStart: (): Promise<void> => ipcRenderer.invoke(IPC.setupStart),
  recorderStart: (
    name?: string,
    profiles?: string[]
  ): Promise<{ name: string; warnSilent: boolean; warnNoSystemAudio: boolean }> =>
    ipcRenderer.invoke(IPC.recorderStart, name, profiles),
  recorderStop: (): Promise<RecorderStopResult> => ipcRenderer.invoke(IPC.recorderStop),
  importFile: (): Promise<{ started: boolean; canceled?: boolean; error?: string }> =>
    ipcRenderer.invoke(IPC.importFile),
  recorderStatus: (): Promise<RecorderStatus> => ipcRenderer.invoke(IPC.recorderStatus),
  pipelineState: (): Promise<PipelineState> => ipcRenderer.invoke(IPC.pipelineState),
  pipelineReset: (): Promise<void> => ipcRenderer.invoke(IPC.pipelineReset),
  meetingsList: (): Promise<MeetingSummary[]> => ipcRenderer.invoke(IPC.meetingsList),
  meetingsGet: (name: string): Promise<MeetingDetail> => ipcRenderer.invoke(IPC.meetingsGet, name),
  meetingsOpenFolder: (name: string): Promise<void> => ipcRenderer.invoke(IPC.meetingsOpenFolder, name),
  meetingsOpenPdf: (name: string): Promise<void> => ipcRenderer.invoke(IPC.meetingsOpenPdf, name),
  meetingsExportPdf: (name: string): Promise<{ pdfPath: string }> =>
    ipcRenderer.invoke(IPC.meetingsExportPdf, name),
  meetingsWriteMinutes: (name: string): Promise<ProcessStart> =>
    ipcRenderer.invoke(IPC.meetingsWriteMinutes, name),
  meetingsProcess: (name: string): Promise<ProcessStart> =>
    ipcRenderer.invoke(IPC.meetingsProcess, name),
  meetingsGenerateTitle: (name: string): Promise<TitleResult> =>
    ipcRenderer.invoke(IPC.meetingsGenerateTitle, name),
  meetingsSetTitle: (name: string, title: string): Promise<void> =>
    ipcRenderer.invoke(IPC.meetingsSetTitle, name, title),
  meetingsSearch: (q: string): Promise<string[]> => ipcRenderer.invoke(IPC.meetingsSearch, q),
  meetingsWikiNote: (name: string, request: string): Promise<MeetingWikiNoteResult> =>
    ipcRenderer.invoke(IPC.meetingsWikiNote, name, request),
  wikiList: (): Promise<WikiNoteMeta[]> => ipcRenderer.invoke(IPC.wikiList),
  wikiGet: (id: string): Promise<WikiNote> => ipcRenderer.invoke(IPC.wikiGet, id),
  wikiCreate: (title: string, content?: string): Promise<string> =>
    ipcRenderer.invoke(IPC.wikiCreate, title, content),
  wikiSave: (id: string, patch: { title: string; tags: string[]; content: string }): Promise<void> =>
    ipcRenderer.invoke(IPC.wikiSave, id, patch),
  wikiDelete: (id: string): Promise<{ deleted: boolean }> => ipcRenderer.invoke(IPC.wikiDelete, id),
  wikiResolve: (target: string): Promise<string | null> =>
    ipcRenderer.invoke(IPC.wikiResolve, target),
  wikiAsk: (question: string): Promise<WikiAskResult> => ipcRenderer.invoke(IPC.wikiAsk, question),
  wikiExportPdf: (id: string, bodyHtml: string): Promise<{ saved: string | null }> =>
    ipcRenderer.invoke(IPC.wikiExportPdf, id, bodyHtml),
  wikiCopyMarkdown: (id: string): Promise<{ copied: boolean }> =>
    ipcRenderer.invoke(IPC.wikiCopyMarkdown, id),
  wikiExportMarkdown: (id: string): Promise<{ saved: string | null }> =>
    ipcRenderer.invoke(IPC.wikiExportMarkdown, id),
  wikiSaveAsset: (base64: string, ext: string): Promise<{ rel: string }> =>
    ipcRenderer.invoke(IPC.wikiSaveAsset, base64, ext),
  meetingsSaveBienban: (name: string, content: string): Promise<void> =>
    ipcRenderer.invoke(IPC.meetingsSaveBienban, name, content),
  meetingsDelete: (name: string): Promise<{ deleted: boolean }> =>
    ipcRenderer.invoke(IPC.meetingsDelete, name),
  meetingsSetProfiles: (name: string, profiles: string[]): Promise<void> =>
    ipcRenderer.invoke(IPC.meetingsSetProfile, name, profiles),
  meetingsFindReplace: (
    name: string,
    pairs: { find: string; replace: string }[],
    scope: { bienban: boolean; transcript: boolean }
  ): Promise<{ count: number }> => ipcRenderer.invoke(IPC.meetingsFindReplace, name, pairs, scope),
  meetingsRevise: (name: string, feedback: string): Promise<ReviseResult> =>
    ipcRenderer.invoke(IPC.meetingsRevise, name, feedback),
  devicesList: (): Promise<AudioDevice[]> => ipcRenderer.invoke(IPC.devicesList),
  settingsGet: (): Promise<Settings> => ipcRenderer.invoke(IPC.settingsGet),
  settingsSet: (patch: Partial<Settings>): Promise<Settings> => ipcRenderer.invoke(IPC.settingsSet, patch),
  engineCheck: (): Promise<EngineCheck> => ipcRenderer.invoke(IPC.engineCheck),
  glossaryGet: (profile?: string | null): Promise<{ content: string; path: string; exists: boolean }> =>
    ipcRenderer.invoke(IPC.glossaryGet, profile),
  glossarySave: (content: string, profile?: string | null): Promise<void> =>
    ipcRenderer.invoke(IPC.glossarySave, content, profile),
  glossaryReveal: (profile?: string | null): Promise<void> =>
    ipcRenderer.invoke(IPC.glossaryReveal, profile),
  profilesList: (): Promise<string[]> => ipcRenderer.invoke(IPC.profilesList),
  profilesCreate: (name: string): Promise<string> => ipcRenderer.invoke(IPC.profilesCreate, name),
  profilesRename: (oldName: string, newName: string): Promise<string> =>
    ipcRenderer.invoke(IPC.profilesRename, oldName, newName),
  tasksList: (): Promise<Task[]> => ipcRenderer.invoke(IPC.tasksList),
  tasksCreate: (input: TaskInput): Promise<Task> => ipcRenderer.invoke(IPC.tasksCreate, input),
  tasksCreateMany: (inputs: TaskInput[]): Promise<Task[]> =>
    ipcRenderer.invoke(IPC.tasksCreateMany, inputs),
  tasksUpdate: (id: string, patch: Partial<Task>): Promise<Task> =>
    ipcRenderer.invoke(IPC.tasksUpdate, id, patch),
  tasksDelete: (id: string): Promise<void> => ipcRenderer.invoke(IPC.tasksDelete, id),
  openExternal: (url: string): Promise<void> => ipcRenderer.invoke(IPC.openExternal, url),
  openScreenRecordingPrefs: (): Promise<void> =>
    ipcRenderer.invoke(IPC.openScreenRecordingPrefs),
  appVersion: (): Promise<string> => ipcRenderer.invoke(IPC.appVersion),
  gitSyncConfigGet: (): Promise<{ config: GitSyncConfig; tokenSet: boolean }> =>
    ipcRenderer.invoke(IPC.gitSyncConfigGet),
  gitSyncConfigSet: (config: Partial<GitSyncConfig>): Promise<GitSyncConfig> =>
    ipcRenderer.invoke(IPC.gitSyncConfigSet, config),
  gitSyncSetToken: (token: string | null): Promise<void> =>
    ipcRenderer.invoke(IPC.gitSyncSetToken, token),
  gitSyncTest: (): Promise<{ ok: boolean; message?: string }> =>
    ipcRenderer.invoke(IPC.gitSyncTest),
  gitSyncNow: (): Promise<SyncResult> => ipcRenderer.invoke(IPC.gitSyncNow),
  onSetupProgress: on<SetupProgress>(IPC_EVENTS.setupProgress),
  onPipelineProgress: on<PipelineState>(IPC_EVENTS.pipelineProgress),
  onRecorderChanged: on<RecorderStatus>(IPC_EVENTS.recorderChanged),
  onGitSyncProgress: on<SyncPhase>(IPC_EVENTS.gitSyncProgress)
}

export type WzApi = typeof wzApi

contextBridge.exposeInMainWorld('wz', wzApi)

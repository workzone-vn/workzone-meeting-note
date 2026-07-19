import { useEffect, useState } from 'react'
import type {
  AudioDevice,
  EngineCheck,
  Settings as S,
  SetupStatus,
  GitSyncConfig
} from '../../../shared/types'
import { ClaudeGuide } from '../components/ClaudeGuide'
import { CheckCircle, FolderOpen, Lock, PencilSimple, Warning } from '../components/icons'

export function Settings({
  setup,
  onRecheck
}: {
  setup: SetupStatus
  onRecheck: () => void
}): React.JSX.Element {
  const [settings, setSettings] = useState<S | null>(null)
  const [devices, setDevices] = useState<AudioDevice[]>([])
  const [check, setCheck] = useState<EngineCheck | null>(null)
  const [tokenDraft, setTokenDraft] = useState('')
  const [savedNote, setSavedNote] = useState<string | null>(null)
  const [glossary, setGlossary] = useState<{ content: string; path: string } | null>(null)
  const [glossaryDirty, setGlossaryDirty] = useState(false)
  const [profiles, setProfiles] = useState<string[]>([])
  const [glossaryTab, setGlossaryTab] = useState<string>('Cá nhân')
  const [newProfile, setNewProfile] = useState('')
  const [renameDraft, setRenameDraft] = useState<string | null>(null) // null = không đổi tên
  const [git, setGit] = useState<GitSyncConfig | null>(null)
  const [gitTokenSet, setGitTokenSet] = useState(false)
  const [gitTokenDraft, setGitTokenDraft] = useState('')
  const [gitTesting, setGitTesting] = useState(false)
  const [gitNote, setGitNote] = useState<string | null>(null)

  useEffect(() => {
    void window.wz.settingsGet().then((s) => {
      setSettings(s)
      setTokenDraft(s.hfToken ?? '')
    })
    void window.wz.devicesList().then(setDevices)
    void window.wz.profilesList().then(setProfiles)
    void window.wz.gitSyncConfigGet().then((r) => {
      setGit(r.config)
      setGitTokenSet(r.tokenSet)
    })
  }, [])

  // nạp từ điển theo tab đang chọn (Chung hoặc từng công ty)
  useEffect(() => {
    setGlossary(null)
    setGlossaryDirty(false)
    void window.wz.glossaryGet(glossaryTab).then(setGlossary)
  }, [glossaryTab])

  if (!settings) return <div className="empty">Đang tải...</div>

  const save = async (patch: Partial<S>, note = 'Đã lưu.'): Promise<void> => {
    const s = await window.wz.settingsSet(patch)
    setSettings(s)
    setSavedNote(note)
    setTimeout(() => setSavedNote(null), 2500)
  }

  return (
    <div>
      <h1 className="page-title">Cài đặt</h1>
      {savedNote && <div className="banner warn">{savedNote}</div>}

      <div className="card">
        <div className="field">
          <div className="label">Ghi tiếng trong máy (loa / hệ thống)</div>
          <div className="hint">
            Mặc định BẬT để chất lượng tốt nhất: ghi được cả tiếng người khác trong họp online, kể
            cả khi bạn đeo tai nghe. macOS sẽ hỏi quyền "Ghi âm thanh hệ thống" 1 lần - bấm Cho
            phép. Không quay màn hình, không bật chỉ báo chia sẻ màn hình.
          </div>
          <div className="switch-row">
            <input
              type="checkbox"
              id="sysaudio"
              checked={settings.systemAudio}
              disabled={!setup.syscapOk}
              onChange={(e) =>
                void save(
                  { systemAudio: e.target.checked },
                  e.target.checked ? 'Đã bật ghi tiếng trong máy.' : 'Đã tắt - quay lại chỉ ghi mic.'
                )
              }
            />
            <label htmlFor="sysaudio">{settings.systemAudio ? 'Đang bật' : 'Đang tắt'}</label>
            {!setup.syscapOk && (
              <span className="hint" style={{ margin: 0 }}>
                (thiếu wz-syscap - cài lại app)
              </span>
            )}
          </div>
          {settings.systemAudio && setup.syscapOk && (
            <div style={{ marginTop: 8 }}>
              <button className="btn" onClick={() => void window.wz.openScreenRecordingPrefs()}>
                Mở cài đặt quyền
              </button>
              <span className="hint" style={{ margin: '0 0 0 8px' }}>
                Nếu ghi mà không có tiếng trong máy, bật "Chỉ ghi âm thanh hệ thống" cho app ở đây
                (mục Ghi màn hình & âm thanh hệ thống).
              </span>
            </div>
          )}
        </div>

        <div className="field">
          <div className="label">Micro</div>
          <div className="hint">Để "Tự chọn" app sẽ dùng mic thật đầu tiên (bỏ qua thiết bị ảo).</div>
          <select
            value={settings.audioDeviceIndex ?? ''}
            onChange={(e) => void save({ audioDeviceIndex: e.target.value || null })}
          >
            <option value="">Tự chọn (mặc định)</option>
            {devices.map((d) => (
              <option key={d.index} value={d.index}>
                {d.name}
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <div className="label">Hồ sơ ngữ cảnh</div>
          <div className="hint">
            Viết <b>tự do bằng văn xuôi</b> - không cần theo định dạng nào: bạn là ai, họp với
            những ai (tên + chức vụ), công ty làm gì, sản phẩm tên gì, từ nào hay bị nghe sai... AI
            đọc phần này để viết biên bản đúng tên, đúng thuật ngữ và đúng ngữ cảnh. Khi ghi họp,
            bạn chọn một hay nhiều hồ sơ (ví dụ <b>Cá nhân + Công việc</b>) - ngữ cảnh các hồ sơ được chọn
            sẽ gộp lại, hồ sơ không chọn không bao giờ lẫn vào. Tất cả nằm trên máy bạn.
          </div>
          <div className="profile-row" style={{ justifyContent: 'flex-start', marginBottom: 10 }}>
            {profiles.map((p) => (
              <button
                key={p}
                className={`profile-chip ${glossaryTab === p ? 'active' : ''}`}
                onClick={() => {
                  setGlossaryTab(p)
                  setRenameDraft(null)
                }}
              >
                {p}
              </button>
            ))}
            {glossaryTab !== 'Cá nhân' && renameDraft === null && (
              <button
                className="btn icon-btn"
                title={`Đổi tên ngữ cảnh "${glossaryTab}" (các cuộc họp cũ tự cập nhật theo tên mới)`}
                onClick={() => setRenameDraft(glossaryTab)}
              >
                <PencilSimple size={14} />
              </button>
            )}
            {renameDraft !== null ? (
              <input
                className="profile-new-input"
                autoFocus
                value={renameDraft}
                placeholder="Tên mới... (Enter lưu, Esc huỷ)"
                onChange={(e) => setRenameDraft(e.target.value)}
                onKeyDown={async (e) => {
                  if (e.key === 'Escape') setRenameDraft(null)
                  if (e.key !== 'Enter' || !renameDraft.trim()) return
                  try {
                    const to = await window.wz.profilesRename(glossaryTab, renameDraft.trim())
                    setRenameDraft(null)
                    setProfiles(await window.wz.profilesList())
                    setGlossaryTab(to)
                    setSavedNote(`Đã đổi tên ngữ cảnh thành "${to}".`)
                    setTimeout(() => setSavedNote(null), 2500)
                  } catch (err) {
                    setSavedNote(String(err instanceof Error ? err.message : err))
                    setTimeout(() => setSavedNote(null), 3000)
                  }
                }}
              />
            ) : (
              <input
                className="profile-new-input"
                placeholder="+ Thêm ngữ cảnh..."
                value={newProfile}
                onChange={(e) => setNewProfile(e.target.value)}
                onKeyDown={async (e) => {
                  if (e.key !== 'Enter' || !newProfile.trim()) return
                  try {
                    const slug = await window.wz.profilesCreate(newProfile.trim())
                    setNewProfile('')
                    const list = await window.wz.profilesList()
                    setProfiles(list)
                    setGlossaryTab(slug)
                  } catch (err) {
                    setSavedNote(String(err instanceof Error ? err.message : err))
                    setTimeout(() => setSavedNote(null), 3000)
                  }
                }}
              />
            )}
          </div>
          {glossary && (
            <>
              <button
                className="path-link"
                title="Mở thư mục chứa file trong Finder"
                onClick={() => void window.wz.glossaryReveal(glossaryTab)}
              >
                <FolderOpen size={13} /> {glossary.path}
              </button>
              <textarea
                className="md-editor glossary-editor"
                value={glossary.content}
                spellCheck={false}
                onChange={(e) => {
                  setGlossary({ ...glossary, content: e.target.value })
                  setGlossaryDirty(true)
                }}
              />
              <div style={{ marginTop: 8 }}>
                <button
                  className="btn primary"
                  disabled={!glossaryDirty}
                  onClick={async () => {
                    await window.wz.glossarySave(glossary.content, glossaryTab)
                    setGlossaryDirty(false)
                    setSavedNote(`Đã lưu hồ sơ "${glossaryTab}" - áp dụng từ biên bản tiếp theo.`)
                    setTimeout(() => setSavedNote(null), 2500)
                  }}
                >
                  Lưu hồ sơ
                </button>
              </div>
            </>
          )}
        </div>

        <div className="field">
          <div className="label">Tách người nói (tuỳ chọn)</div>
          <div className="hint">
            Cần token miễn phí của HuggingFace (hf.co/settings/tokens) và đồng ý điều kiện tại
            hf.co/pyannote/speaker-diarization-3.1.
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <input
              type="password"
              placeholder="HF_TOKEN=hf_xxx"
              value={tokenDraft}
              onChange={(e) => setTokenDraft(e.target.value)}
            />
            <button className="btn" onClick={() => void save({ hfToken: tokenDraft.trim() || null })}>
              Lưu token
            </button>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="label" style={{ fontWeight: 600, color: 'var(--navy)', marginBottom: 6 }}>
          Claude Code (viết biên bản)
        </div>
        {setup.claudePath ? (
          <p style={{ margin: 0 }}>
            <CheckCircle size={16} /> Đã có: <code>{setup.claudePath}</code>
          </p>
        ) : (
          <div>
            <p style={{ marginTop: 0 }}>
              <Warning size={16} /> Chưa thấy Claude Code trên máy - app chưa tự viết biên bản được.
            </p>
            <ClaudeGuide onRecheck={onRecheck} />
          </div>
        )}
      </div>

      {git && (
        <div className="card">
          <div className="field">
            <div className="label">Đồng bộ Wiki lên GitHub</div>
            <div className="hint">
              Backup và đồng bộ 2 chiều thư mục Wiki với một GitHub repo riêng. Tạo{' '}
              <a
                href="#"
                onClick={(ev) => {
                  ev.preventDefault()
                  void window.wz.openExternal('https://github.com/settings/tokens?type=beta')
                }}
              >
                fine-grained token
              </a>{' '}
              chỉ với quyền <b>Contents: Read and write</b> cho đúng repo backup, rồi dán vào ô dưới.
              Nên tạo repo <b>trống</b> (không thêm README/.gitignore/license lúc tạo); nếu repo đã có
              sẵn nội dung thì lần đồng bộ đầu vẫn gộp được bình thường (đã hỗ trợ).
            </div>
          </div>

          <div className="field">
            <div className="label">Repo URL</div>
            <input
              type="text"
              placeholder="https://github.com/<owner>/<repo>.git"
              value={git.repoUrl}
              onChange={(e) => setGit({ ...git, repoUrl: e.target.value })}
              onBlur={() => void window.wz.gitSyncConfigSet({ repoUrl: git.repoUrl.trim() })}
            />
          </div>

          <div className="field">
            <div className="label">GitHub token (PAT)</div>
            <input
              type="password"
              placeholder={gitTokenSet ? '•••••••• (đã lưu - để trống nếu không đổi)' : 'github_pat_...'}
              value={gitTokenDraft}
              onChange={(e) => setGitTokenDraft(e.target.value)}
            />
            <div style={{ marginTop: 8, display: 'flex', gap: 8, alignItems: 'center' }}>
              <button
                className="btn"
                onClick={async () => {
                  await window.wz.gitSyncSetToken(gitTokenDraft.trim() || null)
                  setGitTokenDraft('')
                  const r = await window.wz.gitSyncConfigGet()
                  setGitTokenSet(r.tokenSet)
                  setGitNote('Đã lưu token.')
                  setTimeout(() => setGitNote(null), 2500)
                }}
              >
                Lưu token
              </button>
              <button
                className="btn"
                disabled={gitTesting}
                onClick={async () => {
                  setGitTesting(true)
                  await window.wz.gitSyncConfigSet({ repoUrl: git.repoUrl.trim() })
                  const r = await window.wz.gitSyncTest()
                  setGitTesting(false)
                  setGitNote(r.ok ? 'Kết nối OK.' : `Lỗi: ${r.message ?? 'không rõ'}`)
                }}
              >
                {gitTesting ? 'Đang kiểm tra...' : 'Kiểm tra kết nối'}
              </button>
              {gitNote && (
                <span className="hint" style={{ margin: 0 }}>
                  {gitNote}
                </span>
              )}
            </div>
          </div>

          {git.lastSyncedAt && (
            <div className="hint">
              Lần đồng bộ gần nhất: {new Date(git.lastSyncedAt).toLocaleString('vi-VN')} —{' '}
              {git.lastSyncStatus === 'ok'
                ? 'thành công'
                : git.lastSyncStatus === 'conflict'
                  ? 'có xung đột'
                  : 'lỗi'}
              {git.lastSyncMessage ? ` (${git.lastSyncMessage})` : ''}
            </div>
          )}
        </div>
      )}

      <div className="card">
        <div className="label" style={{ fontWeight: 600, color: 'var(--navy)', marginBottom: 6 }}>
          <Lock size={16} /> Quyền riêng tư
        </div>
        <ul style={{ margin: '4px 0 0', paddingLeft: 20, fontSize: '0.9rem' }}>
          <li>
            Ghi âm, transcript, biên bản, PDF chỉ lưu trên máy bạn tại <code>~/wz-bien-ban/output</code>.
          </li>
          <li>Nhận giọng nói (Whisper) chạy hoàn toàn trên máy - audio không bao giờ rời máy.</li>
          <li>
            Khi viết biên bản, chỉ phần <b>văn bản</b> transcript và từ điển được gửi tới Claude bằng
            tài khoản của chính bạn.
          </li>
          <li>App không thu thập dữ liệu, không telemetry. Mạng chỉ dùng tải bộ cài lần đầu.</li>
        </ul>
      </div>

      <div className="card">
        <div className="label" style={{ fontWeight: 600, color: 'var(--navy)', marginBottom: 6 }}>
          Trạng thái cài đặt
        </div>
        <button
          className="btn"
          onClick={() => {
            setCheck(null)
            void window.wz.engineCheck().then(setCheck)
          }}
        >
          Kiểm tra
        </button>
        {check && (
          <div className="check-detail" style={{ marginTop: 10 }}>
            {check.detail}
          </div>
        )}
      </div>
    </div>
  )
}

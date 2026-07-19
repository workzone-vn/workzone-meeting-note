// Logic đồng bộ Wiki với GitHub bằng isomorphic-git. Module THUẦN NODE
// (không import electron) để test được; lớp IPC truyền dir/token/config vào.
import * as fs from 'fs'
import * as path from 'path'
import * as git from 'isomorphic-git'
import http from 'isomorphic-git/http/node'

export type GitAuthor = { name: string; email: string }

/** Stage mọi thêm/sửa/xoá trong `dir` rồi commit nếu có thay đổi.
 * Trả commit oid, hoặc null khi không có gì để commit. */
export async function stageAndCommit(dir: string, author: GitAuthor): Promise<string | null> {
  const matrix = await git.statusMatrix({ fs, dir })
  for (const [filepath, , workdir] of matrix) {
    if (workdir === 0) await git.remove({ fs, dir, filepath })
    else await git.add({ fs, dir, filepath })
  }
  const staged = await git.statusMatrix({ fs, dir })
  const dirty = staged.some(([, head, wd, stage]) => head !== 1 || wd !== 1 || stage !== 1)
  if (!dirty) return null
  return git.commit({
    fs,
    dir,
    message: `sync from ${author.name} ${new Date().toISOString()}`,
    author
  })
}

export type IntegrateResult = { status: 'ok' } | { status: 'conflict'; conflicts: string[] }

/** Đọc nội dung 1 file tại 1 commit; null nếu file không tồn tại ở commit đó. */
async function readBlobAt(dir: string, oid: string, filepath: string): Promise<Uint8Array | null> {
  try {
    const { blob } = await git.readBlob({ fs, dir, oid, filepath })
    return blob
  } catch {
    return null
  }
}

/** Tên file cạnh bên giữ bản remote: note.md -> note.remote-<sha>.md */
function siblingPath(filepath: string, shortSha: string): string {
  const slash = filepath.lastIndexOf('/')
  const dot = filepath.lastIndexOf('.')
  if (dot > slash) return `${filepath.slice(0, dot)}.remote-${shortSha}${filepath.slice(dot)}`
  return `${filepath}.remote-${shortSha}`
}

/** Merge origin/<branch> vào <branch> rồi cập nhật working dir.
 * Xung đột: GIỮ CẢ HAI BẢN (local là file chính, remote thành .remote-<sha>).
 * QUAN TRỌNG: nhánh xung đột stage TOÀN BỘ thay đổi trong working dir trước khi
 * tạo merge commit — vì vậy phải gọi hàm này NGAY SAU `stageAndCommit`, không có
 * thay đổi chưa commit nào khác xen giữa, nếu không các sửa đổi không liên quan
 * sẽ bị cuốn vào merge commit. */
export async function integrateRemote(
  dir: string,
  branch: string,
  author: GitAuthor
): Promise<IntegrateResult> {
  const remoteRef = `refs/remotes/origin/${branch}`
  let remoteOid: string
  try {
    remoteOid = await git.resolveRef({ fs, dir, ref: remoteRef })
  } catch {
    return { status: 'ok' } // remote chưa có nhánh này
  }
  let localOid: string | null = null
  try {
    localOid = await git.resolveRef({ fs, dir, ref: branch })
  } catch {
    /* local chưa có commit */
  }
  if (localOid === remoteOid) return { status: 'ok' }
  if (!localOid) {
    await git.writeRef({ fs, dir, ref: `refs/heads/${branch}`, value: remoteOid, force: true })
    await git.checkout({ fs, dir, ref: branch, force: true })
    return { status: 'ok' }
  }
  try {
    await git.merge({ fs, dir, ours: branch, theirs: remoteRef, author, abortOnConflict: false })
    await git.checkout({ fs, dir, ref: branch, force: true })
    return { status: 'ok' }
  } catch (e) {
    if (!(e instanceof git.Errors.MergeConflictError)) throw e
    // "Giữ cả hai bản": index sau merge lỗi chỉ chứa CÁC FILE XUNG ĐỘT (ở stage
    // 1/2/3); các file KHÔNG xung đột (vd. file remote thêm mới) đã được ghi ra
    // working dir nhưng KHÔNG được stage — đã kiểm chứng thực nghiệm với
    // isomorphic-git@1.38.7 (statusMatrix cho các file này: workdir=2, stage=0,
    // và `listFiles` chỉ trả về file xung đột). Vì vậy phải tự stage lại các file
    // không xung đột ở cuối, nếu không merge commit sẽ MẤT các thay đổi đó.
    const conflicts: string[] = (e as { data?: { filepaths?: string[] } }).data?.filepaths ?? []
    const shortSha = remoteOid.slice(0, 7)
    for (const filepath of conflicts) {
      const ours = await readBlobAt(dir, localOid, filepath)
      const theirs = await readBlobAt(dir, remoteOid, filepath)
      const abs = path.join(dir, filepath)
      if (ours) {
        await fs.promises.mkdir(path.dirname(abs), { recursive: true })
        await fs.promises.writeFile(abs, Buffer.from(ours))
        await git.add({ fs, dir, filepath }) // resolve -> stage 0 = bản local
      } else {
        await fs.promises.rm(abs, { force: true })
        await git.remove({ fs, dir, filepath })
      }
      if (theirs) {
        const sib = siblingPath(filepath, shortSha)
        const sibAbs = path.join(dir, sib)
        await fs.promises.mkdir(path.dirname(sibAbs), { recursive: true })
        await fs.promises.writeFile(sibAbs, Buffer.from(theirs))
        await git.add({ fs, dir, filepath: sib })
      }
    }
    // Stage các file KHÔNG xung đột còn lại theo trạng thái working dir hiện tại
    // (đã được merge ghi sẵn ra đĩa nhưng chưa nằm trong index) — để không mất
    // thay đổi mới từ remote trong merge commit.
    const statusAfterConflict = await git.statusMatrix({ fs, dir })
    for (const [filepath, , workdir] of statusAfterConflict) {
      if (conflicts.includes(filepath)) continue
      if (workdir === 0) await git.remove({ fs, dir, filepath })
      else await git.add({ fs, dir, filepath })
    }
    // merge commit 2 parent: remote thành tổ tiên -> lần sync sau không xung đột lại
    await git.commit({
      fs,
      dir,
      message: `merge origin/${branch} (giữ cả hai bản; xung đột: ${conflicts.join(', ')})`,
      author,
      parent: [localOid, remoteOid]
    })
    await git.checkout({ fs, dir, ref: branch, force: true })
    return { status: 'conflict', conflicts }
  }
}

export type SyncPhase = 'start' | 'commit' | 'fetch' | 'merge' | 'push' | 'done'
export type SyncOptions = {
  dir: string
  remoteUrl: string
  branch: string
  token: string
  authorName: string
  authorEmail: string
  onProgress?: (p: SyncPhase) => void
}
export type SyncResult = {
  status: 'ok' | 'conflict'
  pushed: boolean
  conflicts?: string[]
  commitOid?: string | null
}

function authFor(token: string) {
  return () => ({ username: token, password: 'x-oauth-basic' })
}

/** Đảm bảo `dir` là git repo, origin trỏ đúng remoteUrl, user.name/email đã set. */
export async function ensureRepo(
  dir: string,
  remoteUrl: string,
  branch: string,
  author: GitAuthor
): Promise<void> {
  await fs.promises.mkdir(dir, { recursive: true })
  if (!fs.existsSync(`${dir}/.git`)) {
    await git.init({ fs, dir, defaultBranch: branch })
  }
  const remotes = await git.listRemotes({ fs, dir })
  const origin = remotes.find((r) => r.remote === 'origin')
  if (!origin) {
    await git.addRemote({ fs, dir, remote: 'origin', url: remoteUrl })
  } else if (origin.url !== remoteUrl) {
    await git.deleteRemote({ fs, dir, remote: 'origin' })
    await git.addRemote({ fs, dir, remote: 'origin', url: remoteUrl })
  }
  await git.setConfig({ fs, dir, path: 'user.name', value: author.name })
  await git.setConfig({ fs, dir, path: 'user.email', value: author.email })
}

async function pushWithRetry(
  dir: string,
  branch: string,
  token: string,
  author: GitAuthor
): Promise<void> {
  const push = () =>
    git.push({ fs, http, dir, remote: 'origin', ref: branch, onAuth: authFor(token) })
  try {
    await push()
  } catch (e) {
    if (e instanceof git.Errors.PushRejectedError) {
      await git.fetch({
        fs,
        http,
        dir,
        remote: 'origin',
        ref: branch,
        singleBranch: true,
        tags: false,
        onAuth: authFor(token)
      })
      await integrateRemote(dir, branch, author)
      await push()
    } else {
      throw e
    }
  }
}

/** Đồng bộ 2 chiều: commit local -> fetch -> merge -> push.
 * Xung đột dùng chiến lược "giữ cả hai bản": integrateRemote đã tạo merge commit
 * hợp lệ (tích hợp remote) nên VẪN push để hai máy hội tụ + backup cả bản .remote. */
export async function syncWiki(opts: SyncOptions): Promise<SyncResult> {
  const { dir, remoteUrl, branch, token, authorName, authorEmail, onProgress } = opts
  const author: GitAuthor = { name: authorName, email: authorEmail }
  onProgress?.('start')
  await ensureRepo(dir, remoteUrl, branch, author)
  onProgress?.('commit')
  const commitOid = await stageAndCommit(dir, author)
  onProgress?.('fetch')
  await git.fetch({
    fs,
    http,
    dir,
    remote: 'origin',
    ref: branch,
    singleBranch: true,
    tags: false,
    onAuth: authFor(token)
  })
  onProgress?.('merge')
  // integrateRemote phải chạy ngay sau stageAndCommit (không có edit lạ xen giữa) —
  // xem doc-comment trên integrateRemote.
  const merged = await integrateRemote(dir, branch, author)
  onProgress?.('push')
  await pushWithRetry(dir, branch, token, author)
  onProgress?.('done')
  if (merged.status === 'conflict') {
    return { status: 'conflict', pushed: true, conflicts: merged.conflicts, commitOid }
  }
  return { status: 'ok', pushed: true, commitOid }
}

/** Kiểm tra repoUrl + token có truy cập được không (không đổi gì trên đĩa). */
export async function testConnection(opts: {
  remoteUrl: string
  token: string
}): Promise<{ ok: boolean; message?: string }> {
  try {
    await git.getRemoteInfo({ http, url: opts.remoteUrl, onAuth: authFor(opts.token) })
    return { ok: true }
  } catch (e) {
    return { ok: false, message: (e as Error).message || String(e) }
  }
}

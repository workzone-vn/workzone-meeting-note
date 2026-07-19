import { describe, it, expect } from 'vitest'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import * as git from 'isomorphic-git'
import { stageAndCommit, integrateRemote } from '../src/main/gitsync/GitSync'

const AUTHOR = { name: 'test-host', email: 'test-host@wz-wiki-sync.local' }

async function initRepo(): Promise<string> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wz-git-'))
  await git.init({ fs, dir, defaultBranch: 'main' })
  return dir
}

describe('stageAndCommit', () => {
  it('commit file mới và trả oid', async () => {
    const dir = await initRepo()
    fs.writeFileSync(path.join(dir, 'a.md'), '# A')
    const oid = await stageAndCommit(dir, AUTHOR)
    expect(oid).toMatch(/^[0-9a-f]{40}$/)
    const log = await git.log({ fs, dir, ref: 'main' })
    expect(log).toHaveLength(1)
  })

  it('trả null khi không có thay đổi', async () => {
    const dir = await initRepo()
    fs.writeFileSync(path.join(dir, 'a.md'), '# A')
    await stageAndCommit(dir, AUTHOR)
    const oid = await stageAndCommit(dir, AUTHOR)
    expect(oid).toBeNull()
  })

  it('ghi nhận file bị xoá', async () => {
    const dir = await initRepo()
    fs.writeFileSync(path.join(dir, 'a.md'), '# A')
    await stageAndCommit(dir, AUTHOR)
    fs.rmSync(path.join(dir, 'a.md'))
    const oid = await stageAndCommit(dir, AUTHOR)
    expect(oid).toMatch(/^[0-9a-f]{40}$/)
    const files = await git.listFiles({ fs, dir, ref: 'main' })
    expect(files).not.toContain('a.md')
  })
})

// Ghi ref origin/main trỏ tới oid (giả lập trạng thái sau khi fetch).
async function setRemoteRef(dir: string, oid: string): Promise<void> {
  await git.writeRef({ fs, dir, ref: 'refs/remotes/origin/main', value: oid, force: true })
}

describe('integrateRemote', () => {
  it('no-op khi origin/main chưa tồn tại', async () => {
    const dir = await initRepo()
    fs.writeFileSync(path.join(dir, 'a.md'), '# A')
    await stageAndCommit(dir, AUTHOR)
    const res = await integrateRemote(dir, 'main', AUTHOR)
    expect(res.status).toBe('ok')
  })

  it('fast-forward khi local chưa có commit', async () => {
    const dir = await initRepo()
    fs.writeFileSync(path.join(dir, 'a.md'), '# remote A')
    const remoteOid = await stageAndCommit(dir, AUTHOR)
    // đẩy commit khỏi nhánh main để giả lập "local trống, remote có"
    await git.writeRef({ fs, dir, ref: 'refs/heads/main', value: remoteOid!, force: true })
    await setRemoteRef(dir, remoteOid!)
    // xoá branch main để local coi như chưa có commit
    fs.rmSync(path.join(dir, '.git', 'refs', 'heads', 'main'), { force: true })
    const res = await integrateRemote(dir, 'main', AUTHOR)
    expect(res.status).toBe('ok')
    expect(fs.existsSync(path.join(dir, 'a.md'))).toBe(true)
  })

  it('merge sạch khi hai bên sửa file khác nhau', async () => {
    const dir = await initRepo()
    fs.writeFileSync(path.join(dir, 'base.md'), 'base')
    const baseOid = await stageAndCommit(dir, AUTHOR)
    // nhánh "remote": thêm remote.md
    fs.writeFileSync(path.join(dir, 'remote.md'), 'remote only')
    const remoteOid = await stageAndCommit(dir, AUTHOR)
    await setRemoteRef(dir, remoteOid!)
    // quay local về base, thêm local.md
    await git.writeRef({ fs, dir, ref: 'refs/heads/main', value: baseOid!, force: true })
    await git.checkout({ fs, dir, ref: 'main', force: true })
    fs.writeFileSync(path.join(dir, 'local.md'), 'local only')
    await stageAndCommit(dir, AUTHOR)
    const res = await integrateRemote(dir, 'main', AUTHOR)
    expect(res.status).toBe('ok')
    expect(fs.existsSync(path.join(dir, 'remote.md'))).toBe(true)
    expect(fs.existsSync(path.join(dir, 'local.md'))).toBe(true)
  })

  it('xung đột: giữ local + tạo file .remote-<sha>, merge commit 2 parent', async () => {
    const dir = await initRepo()
    fs.writeFileSync(path.join(dir, 'note.md'), 'line1\n')
    const baseOid = await stageAndCommit(dir, AUTHOR)
    fs.writeFileSync(path.join(dir, 'note.md'), 'line1 REMOTE\n')
    const remoteOid = await stageAndCommit(dir, AUTHOR)
    await setRemoteRef(dir, remoteOid!)
    await git.writeRef({ fs, dir, ref: 'refs/heads/main', value: baseOid!, force: true })
    await git.checkout({ fs, dir, ref: 'main', force: true })
    fs.writeFileSync(path.join(dir, 'note.md'), 'line1 LOCAL\n')
    await stageAndCommit(dir, AUTHOR)
    const res = await integrateRemote(dir, 'main', AUTHOR)
    expect(res.status).toBe('conflict')
    if (res.status === 'conflict') expect(res.conflicts).toContain('note.md')
    // file chính giữ bản local
    expect(fs.readFileSync(path.join(dir, 'note.md'), 'utf8')).toBe('line1 LOCAL\n')
    // bản remote được lưu cạnh bên
    const sib = path.join(dir, `note.remote-${remoteOid!.slice(0, 7)}.md`)
    expect(fs.existsSync(sib)).toBe(true)
    expect(fs.readFileSync(sib, 'utf8')).toBe('line1 REMOTE\n')
    // merge commit có 2 parent
    const head = await git.resolveRef({ fs, dir, ref: 'main' })
    const commits = await git.log({ fs, dir, ref: head, depth: 1 })
    expect(commits[0].commit.parent).toHaveLength(2)
  })

  it('xung đột KHÔNG làm mất thay đổi không xung đột từ remote', async () => {
    const dir = await initRepo()
    fs.writeFileSync(path.join(dir, 'note.md'), 'line1\n')
    const baseOid = await stageAndCommit(dir, AUTHOR)
    // remote: sửa note.md (sẽ xung đột) + thêm file mới không xung đột
    fs.writeFileSync(path.join(dir, 'note.md'), 'line1 REMOTE\n')
    fs.writeFileSync(path.join(dir, 'fromremote.md'), 'remote new file\n')
    const remoteOid = await stageAndCommit(dir, AUTHOR)
    await setRemoteRef(dir, remoteOid!)
    // local: chỉ sửa note.md
    await git.writeRef({ fs, dir, ref: 'refs/heads/main', value: baseOid!, force: true })
    await git.checkout({ fs, dir, ref: 'main', force: true })
    fs.writeFileSync(path.join(dir, 'note.md'), 'line1 LOCAL\n')
    await stageAndCommit(dir, AUTHOR)
    const res = await integrateRemote(dir, 'main', AUTHOR)
    expect(res.status).toBe('conflict')
    // file mới từ remote (không xung đột) PHẢI còn trên working dir + trong commit
    expect(fs.readFileSync(path.join(dir, 'fromremote.md'), 'utf8')).toBe('remote new file\n')
    const files = await git.listFiles({ fs, dir, ref: 'main' })
    expect(files).toContain('fromremote.md')
  })
})

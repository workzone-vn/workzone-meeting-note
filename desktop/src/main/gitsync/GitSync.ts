// Logic đồng bộ Wiki với GitHub bằng isomorphic-git. Module THUẦN NODE
// (không import electron) để test được; lớp IPC truyền dir/token/config vào.
import * as fs from 'fs'
import * as git from 'isomorphic-git'

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

/** Merge origin/<branch> vào <branch> rồi cập nhật working dir. */
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
    if (e instanceof git.Errors.MergeConflictError) {
      await git.checkout({ fs, dir, ref: branch, force: true })
      const data = (e as { data?: { filepaths?: string[] } }).data
      return { status: 'conflict', conflicts: data?.filepaths ?? [] }
    }
    throw e
  }
}

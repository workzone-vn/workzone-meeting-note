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

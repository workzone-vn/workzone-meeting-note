import { describe, it, expect, beforeEach } from 'vitest'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import * as git from 'isomorphic-git'
import { stageAndCommit } from '../src/main/gitsync/GitSync'

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

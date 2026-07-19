# Wiki ↔ GitHub Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cho phép backup + đồng bộ 2 chiều thư mục Wiki (`~/wz-bien-ban/wiki/`) với một GitHub repo riêng, kích hoạt thủ công bằng nút "Sync".

**Architecture:** Toàn bộ logic git nằm trong một module **thuần Node** (`desktop/src/main/gitsync/GitSync.ts`) dùng `isomorphic-git` — không import `electron`, nhận `dir`/token/config qua tham số nên test được không cần app. Lớp IPC (contract + main handler + preload) nối module này với UI theo đúng pattern 3 file sẵn có. Cấu hình không bí mật lưu trong `settings.json` (userData); PAT lưu trong `~/wz-bien-ban/.env` (mirror `HF_TOKEN`), không bao giờ gửi về renderer.

**Tech Stack:** Electron 37 (main = Node), TypeScript 5.8, React 19, `isomorphic-git` (+ `isomorphic-git/http/node`), `vitest` (test runner mới).

## Global Constraints

- Cài npm phải dùng `--legacy-peer-deps` (React 19 peer conflicts) — theo tiền lệ dự án.
- Pin `isomorphic-git` ở `^1.27.0` (đã có `merge` 3 chiều + `abortOnConflict`).
- Chỉ đồng bộ nội dung trong `wikiDir` (gồm `assets/`). Không đụng `output/`, `.env`, `.venv/`, `tasks.json`, `profiles/`, `.state.json`.
- PAT (`GITHUB_TOKEN`) chỉ đọc/ghi ở main process; renderer chỉ biết "đã đặt / chưa đặt" (`tokenSet: boolean`).
- Xác thực GitHub qua HTTPS bằng PAT: `onAuth: () => ({ username: token, password: 'x-oauth-basic' })`.
- Tác giả commit mặc định = `os.hostname()`, email = `<hostname>@wz-wiki-sync.local`.
- Mọi text UI bằng tiếng Việt, theo class CSS sẵn có (`card`, `field`, `label`, `hint`, `btn`, `btn primary`, `banner warn`).
- Nhánh mặc định `main`. Chạy được trên macOS + Windows (không phụ thuộc git cài sẵn).
- Đầu ra commit tiếng Việt; kết thúc commit message bằng dòng `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.

---

### Task 1: Dependencies + test infrastructure

**Files:**
- Modify: `desktop/package.json` (dependencies, devDependencies, scripts)
- Create: `desktop/vitest.config.ts`
- Create: `desktop/test/smoke.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: lệnh `npm test` chạy vitest (`vitest run`); `isomorphic-git` + `isomorphic-git/http/node` import được trong test.

- [ ] **Step 1: Cài dependencies**

Run (trong `desktop/`):
```bash
npm install --legacy-peer-deps isomorphic-git@^1.27.0
npm install --legacy-peer-deps -D vitest@^3.0.0
```
Expected: `package.json` có `"isomorphic-git": "^1.27.0"` trong `dependencies` và `"vitest": "^3.0.0"` trong `devDependencies`.

- [ ] **Step 2: Thêm script test**

Trong `desktop/package.json`, mục `"scripts"`, thêm sau dòng `"typecheck"`:
```json
    "test": "vitest run",
```

- [ ] **Step 3: Tạo vitest config**

Create `desktop/vitest.config.ts`:
```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts']
  }
})
```

- [ ] **Step 4: Viết smoke test**

Create `desktop/test/smoke.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import * as git from 'isomorphic-git'
import http from 'isomorphic-git/http/node'

describe('môi trường test', () => {
  it('import được isomorphic-git + http/node', () => {
    expect(typeof git.init).toBe('function')
    expect(typeof git.merge).toBe('function')
    expect(http).toBeTruthy()
  })
})
```

- [ ] **Step 5: Chạy test**

Run: `cd desktop && npm test`
Expected: PASS (1 file, 1 test).

- [ ] **Step 6: Commit**

```bash
git add desktop/package.json desktop/package-lock.json desktop/vitest.config.ts desktop/test/smoke.test.ts
git commit -m "$(cat <<'EOF'
chore: thêm isomorphic-git + vitest cho tính năng sync Wiki

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: `stageAndCommit` — stage tất cả + commit thay đổi local

**Files:**
- Create: `desktop/src/main/gitsync/GitSync.ts`
- Create: `desktop/test/gitsync.test.ts`

**Interfaces:**
- Consumes: `isomorphic-git`.
- Produces:
  - `type GitAuthor = { name: string; email: string }`
  - `async function stageAndCommit(dir: string, author: GitAuthor): Promise<string | null>` — stage mọi thêm/sửa/xoá trong `dir`, commit nếu có thay đổi, trả về commit oid; trả `null` nếu không có gì để commit.

- [ ] **Step 1: Viết test thất bại**

Create `desktop/test/gitsync.test.ts`:
```ts
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
```

- [ ] **Step 2: Chạy test để xác nhận fail**

Run: `cd desktop && npx vitest run test/gitsync.test.ts`
Expected: FAIL — không import được `stageAndCommit` (module chưa có).

- [ ] **Step 3: Viết implementation tối thiểu**

Create `desktop/src/main/gitsync/GitSync.ts`:
```ts
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
```

- [ ] **Step 4: Chạy test để xác nhận pass**

Run: `cd desktop && npx vitest run test/gitsync.test.ts`
Expected: PASS (3 test).

- [ ] **Step 5: Commit**

```bash
git add desktop/src/main/gitsync/GitSync.ts desktop/test/gitsync.test.ts
git commit -m "$(cat <<'EOF'
feat(gitsync): stageAndCommit - stage + commit thay đổi wiki local

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: `integrateRemote` — fast-forward / merge 3 chiều / phát hiện xung đột

**Files:**
- Modify: `desktop/src/main/gitsync/GitSync.ts`
- Modify: `desktop/test/gitsync.test.ts`

**Interfaces:**
- Consumes: `stageAndCommit`, `GitAuthor` (Task 2).
- Produces:
  - `type IntegrateResult = { status: 'ok' } | { status: 'conflict'; conflicts: string[] }`
  - `async function integrateRemote(dir: string, branch: string, author: GitAuthor): Promise<IntegrateResult>` — merge `refs/remotes/origin/<branch>` vào `<branch>`, cập nhật working dir. Nếu `origin/<branch>` chưa tồn tại → `{ status: 'ok' }` (không làm gì). Nếu local chưa có commit → nhận thẳng remote.

**Chiến lược xung đột = "GIỮ CẢ HAI BẢN"** (isomorphic-git KHÔNG ghi conflict marker ra working dir — đã kiểm chứng với v1.38.x). Khi merge có xung đột (`MergeConflictError`, `abortOnConflict: false` nên index đã chứa kết quả merge: file KHÔNG xung đột ở stage 0, file xung đột ở stage 1/2/3):
1. Với mỗi file xung đột: giữ bản **local** làm file chính (ghi ra working dir + `git.add` để resolve index về stage 0), và lưu bản **remote** thành file cạnh bên `<tên>.remote-<7 ký tự sha remote><đuôi>` (đọc blob remote qua `git.readBlob`), rồi `git.add` file cạnh bên đó. Nếu một phía đã xoá file → phía đó không tạo nội dung tương ứng (local xoá → `git.remove`; remote xoá → không tạo file `.remote-`).
2. File KHÔNG xung đột giữ nguyên kết quả merge sẵn có trong index (bao gồm thay đổi mới từ remote — KHÔNG được để mất).
3. Tạo **merge commit 2 parent** `[localOid, remoteOid]` từ index → remote thành tổ tiên, lần sync sau không xung đột lại.
4. `git.checkout` để đưa toàn bộ cây merge (gồm file remote không xung đột) ra working dir.
5. Trả `{ status: 'conflict', conflicts }` (danh sách file đã xung đột). Không mất dữ liệu.

Ghi chú TDD: test dựng trạng thái "đã fetch" bằng cách ghi ref `refs/remotes/origin/main` trỏ tới commit local thứ hai — không cần mạng.

- [ ] **Step 1: Viết test thất bại**

Thêm vào cuối `desktop/test/gitsync.test.ts` (giữ nguyên import + helper `initRepo`/`AUTHOR` đã có; thêm import `integrateRemote`):

Sửa dòng import GitSync thành:
```ts
import { stageAndCommit, integrateRemote } from '../src/main/gitsync/GitSync'
```

Thêm block:
```ts
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
```

- [ ] **Step 2: Chạy test để xác nhận fail**

Run: `cd desktop && npx vitest run test/gitsync.test.ts`
Expected: FAIL — `integrateRemote` chưa export.

- [ ] **Step 3: Viết implementation**

Thêm `import * as path from 'path'` vào đầu `desktop/src/main/gitsync/GitSync.ts` (cạnh `import * as fs from 'fs'`). Thêm implementation:
```ts
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
 * Xung đột: GIỮ CẢ HAI BẢN (local là file chính, remote thành .remote-<sha>). */
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
    // "Giữ cả hai bản": index sau merge lỗi đã chứa kết quả cho file KHÔNG xung đột
    // (stage 0) + file xung đột ở stage 1/2/3. Giải quyết từng file xung đột: giữ
    // local, lưu remote thành .remote-<sha>, resolve index về stage 0.
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
```

- [ ] **Step 4: Chạy test để xác nhận pass**

Run: `cd desktop && npx vitest run test/gitsync.test.ts`
Expected: PASS (tất cả test integrateRemote + stageAndCommit).

Ghi chú quan trọng: điểm rủi ro là hành vi của `git.add` trên file đang ở trạng thái unmerged (stage 1/2/3) — nó phải resolve về stage 0. Nếu isomorphic-git bản cài thực tế cư xử khác (add không resolve unmerged, hoặc index sau `MergeConflictError` không giữ file không-xung-đột ở stage 0), hãy viết một script nháp trong scratchpad để dò hành vi thật, rồi chỉnh IMPLEMENTATION cho tới khi TẤT CẢ test xanh. KHÔNG được làm yếu test. Nếu thư viện về bản chất không làm được (đặc biệt test "KHÔNG mất thay đổi không xung đột"), STOP và báo BLOCKED kèm hành vi quan sát được.

- [ ] **Step 5: Commit**

```bash
git add desktop/src/main/gitsync/GitSync.ts desktop/test/gitsync.test.ts
git commit -m "$(cat <<'EOF'
feat(gitsync): integrateRemote - ff/merge 3 chiều + phát hiện xung đột

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: `ensureRepo` + `syncWiki` + `testConnection` (orchestration + network)

**Files:**
- Modify: `desktop/src/main/gitsync/GitSync.ts`
- Modify: `desktop/test/gitsync.test.ts`

**Interfaces:**
- Consumes: `stageAndCommit`, `integrateRemote`, `GitAuthor` (Task 2, 3).
- Produces:
  - `type SyncPhase = 'start' | 'commit' | 'fetch' | 'merge' | 'push' | 'done'`
  - `type SyncOptions = { dir: string; remoteUrl: string; branch: string; token: string; authorName: string; authorEmail: string; onProgress?: (p: SyncPhase) => void }`
  - `type SyncResult = { status: 'ok' | 'conflict'; pushed: boolean; conflicts?: string[]; commitOid?: string | null }`
  - `async function ensureRepo(dir: string, remoteUrl: string, branch: string, author: GitAuthor): Promise<void>`
  - `async function syncWiki(opts: SyncOptions): Promise<SyncResult>`
  - `async function testConnection(opts: { remoteUrl: string; token: string }): Promise<{ ok: boolean; message?: string }>`

Ghi chú: `syncWiki`/`testConnection` gọi mạng (fetch/push/getRemoteInfo) — chỉ test bằng repo GitHub thật ở Task 9. Task này test `ensureRepo` (không cần mạng).

- [ ] **Step 1: Viết test thất bại cho ensureRepo**

Thêm import `ensureRepo` vào dòng import GitSync trong test:
```ts
import { stageAndCommit, integrateRemote, ensureRepo } from '../src/main/gitsync/GitSync'
```

Thêm block vào `desktop/test/gitsync.test.ts`:
```ts
describe('ensureRepo', () => {
  it('init repo + set origin khi thư mục trống', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wz-git-'))
    await ensureRepo(dir, 'https://github.com/acme/wiki.git', 'main', AUTHOR)
    expect(fs.existsSync(path.join(dir, '.git'))).toBe(true)
    const remotes = await git.listRemotes({ fs, dir })
    expect(remotes).toEqual([{ remote: 'origin', url: 'https://github.com/acme/wiki.git' }])
    expect(await git.getConfig({ fs, dir, path: 'user.name' })).toBe(AUTHOR.name)
  })

  it('cập nhật origin khi đổi URL, chạy lại không lỗi', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wz-git-'))
    await ensureRepo(dir, 'https://github.com/acme/old.git', 'main', AUTHOR)
    await ensureRepo(dir, 'https://github.com/acme/new.git', 'main', AUTHOR)
    const remotes = await git.listRemotes({ fs, dir })
    expect(remotes).toEqual([{ remote: 'origin', url: 'https://github.com/acme/new.git' }])
  })
})
```

- [ ] **Step 2: Chạy test để xác nhận fail**

Run: `cd desktop && npx vitest run test/gitsync.test.ts`
Expected: FAIL — `ensureRepo` chưa export.

- [ ] **Step 3: Viết implementation**

Thêm vào đầu phần import của `desktop/src/main/gitsync/GitSync.ts`:
```ts
import http from 'isomorphic-git/http/node'
```

Thêm vào cuối `desktop/src/main/gitsync/GitSync.ts`:
```ts
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
```

- [ ] **Step 4: Chạy test để xác nhận pass**

Run: `cd desktop && npx vitest run test/gitsync.test.ts`
Expected: PASS (thêm 2 test ensureRepo; các test cũ vẫn xanh).

- [ ] **Step 5: Typecheck**

Run: `cd desktop && npm run typecheck`
Expected: không lỗi.

- [ ] **Step 6: Commit**

```bash
git add desktop/src/main/gitsync/GitSync.ts desktop/test/gitsync.test.ts
git commit -m "$(cat <<'EOF'
feat(gitsync): ensureRepo + syncWiki + testConnection

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Cấu hình sync (types + SettingsStore)

**Files:**
- Modify: `desktop/src/shared/types.ts` (thêm `GitSyncConfig`, mở rộng `Settings`) — quanh dòng 146-152
- Modify: `desktop/src/main/settings/SettingsStore.ts`

**Interfaces:**
- Consumes: nothing.
- Produces (dùng ở Task 6):
  - Type `GitSyncConfig` + `Settings.gitSync: GitSyncConfig` + `Settings.githubTokenSet: boolean`.
  - `getGitSyncConfig(): GitSyncConfig`
  - `setGitSyncConfig(patch: Partial<GitSyncConfig>): GitSyncConfig`
  - `readGithubToken(): string | null`
  - `writeGithubToken(token: string | null): void`

- [ ] **Step 1: Thêm types**

Trong `desktop/src/shared/types.ts`, ngay trước `export interface Settings {` (dòng ~146) thêm:
```ts
export interface GitSyncConfig {
  enabled: boolean
  repoUrl: string // https://github.com/<owner>/<repo>.git
  branch: string // mặc định "main"
  authorName: string // mặc định os.hostname()
  authorEmail: string // mặc định <hostname>@wz-wiki-sync.local
  lastSyncedAt?: number // epoch ms
  lastSyncStatus?: 'ok' | 'conflict' | 'error'
  lastSyncMessage?: string
}
```

Trong `interface Settings`, thêm 2 field (sau `theme`):
```ts
  gitSync: GitSyncConfig
  githubTokenSet: boolean // renderer chỉ biết token đã đặt hay chưa
```

- [ ] **Step 2: Cập nhật SettingsStore**

Trong `desktop/src/main/settings/SettingsStore.ts`:

(a) Thêm import `os` ở đầu file (sau `import * as path`):
```ts
import * as os from 'os'
```

(b) Đổi import type để có `GitSyncConfig`:
```ts
import type { Settings, GitSyncConfig } from '../../shared/types'
```

(c) Thêm `gitSync?` vào `interface LocalSettings` (sau `theme?`):
```ts
  gitSync?: GitSyncConfig
```

(d) Thay `readHfToken` bằng helper .env dùng chung + hai hàm token. Thay khối `function readHfToken() {...}` (dòng 39-48) bằng:
```ts
function readEnvVar(key: string): string | null {
  try {
    for (const line of fs.readFileSync(envFile, 'utf8').split('\n')) {
      if (line.startsWith(`${key}=`)) return line.slice(key.length + 1).trim() || null
    }
  } catch {
    /* chưa có .env */
  }
  return null
}

function writeEnvVar(key: string, value: string | null): void {
  fs.mkdirSync(dataDir, { recursive: true })
  let lines: string[] = []
  try {
    lines = fs
      .readFileSync(envFile, 'utf8')
      .split('\n')
      .filter((l) => !l.startsWith(`${key}=`))
  } catch {
    /* chưa có .env */
  }
  lines = lines.filter((l) => l.trim() !== '')
  if (value) lines.push(`${key}=${value}`)
  fs.writeFileSync(envFile, lines.join('\n') + (lines.length ? '\n' : ''))
}

const readHfToken = (): string | null => readEnvVar('HF_TOKEN')

export function readGithubToken(): string | null {
  return readEnvVar('GITHUB_TOKEN')
}

export function writeGithubToken(token: string | null): void {
  writeEnvVar('GITHUB_TOKEN', token)
}

function defaultGitSync(): GitSyncConfig {
  const host = os.hostname()
  return {
    enabled: false,
    repoUrl: '',
    branch: 'main',
    authorName: host,
    authorEmail: `${host}@wz-wiki-sync.local`
  }
}

export function getGitSyncConfig(): GitSyncConfig {
  return { ...defaultGitSync(), ...(readLocal().gitSync ?? {}) }
}

export function setGitSyncConfig(patch: Partial<GitSyncConfig>): GitSyncConfig {
  const next = { ...getGitSyncConfig(), ...patch }
  writeLocal({ gitSync: next })
  return next
}
```

(e) Trong `getSettings()` (khối `return {...}`), thêm 2 field trước dấu đóng:
```ts
    theme: local.theme ?? 'light',
    gitSync: getGitSyncConfig(),
    githubTokenSet: readGithubToken() !== null
```

(f) Trong `setSettings()`, khối `if (patch.hfToken !== undefined) {...}` (dòng 79-89) rút gọn dùng helper mới:
```ts
  if (patch.hfToken !== undefined) {
    writeEnvVar('HF_TOKEN', patch.hfToken)
  }
```

- [ ] **Step 3: Typecheck**

Run: `cd desktop && npm run typecheck`
Expected: không lỗi. (Nếu báo thiếu `gitSync`/`githubTokenSet` ở chỗ tạo `Settings` — kiểm tra không có nơi nào tạo object `Settings` thủ công ngoài `getSettings`.)

- [ ] **Step 4: Chạy test cũ để chắc không vỡ**

Run: `cd desktop && npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add desktop/src/shared/types.ts desktop/src/main/settings/SettingsStore.ts
git commit -m "$(cat <<'EOF'
feat(settings): cấu hình gitSync (settings.json) + GITHUB_TOKEN (.env)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: IPC wiring (contract + main handlers + preload)

**Files:**
- Modify: `desktop/src/shared/ipc-contract.ts`
- Modify: `desktop/src/main/ipc.ts`
- Modify: `desktop/src/preload/index.ts`

**Interfaces:**
- Consumes: `syncWiki`, `testConnection`, `SyncResult`, `SyncPhase` (Task 4); `getGitSyncConfig`, `setGitSyncConfig`, `readGithubToken`, `writeGithubToken` (Task 5); `wikiDir` (`paths.ts`).
- Produces (dùng ở Task 7, 8) trên `window.wz`:
  - `gitSyncConfigGet(): Promise<{ config: GitSyncConfig; tokenSet: boolean }>`
  - `gitSyncConfigSet(config: Partial<GitSyncConfig>): Promise<GitSyncConfig>`
  - `gitSyncSetToken(token: string | null): Promise<void>`
  - `gitSyncTest(): Promise<{ ok: boolean; message?: string }>`
  - `gitSyncNow(): Promise<SyncResult>`
  - `onGitSyncProgress(cb: (p: SyncPhase) => void): () => void`

- [ ] **Step 1: Thêm channel names**

Trong `desktop/src/shared/ipc-contract.ts`, mục `IPC`, thêm sau dòng `appVersion: 'app:version'` (thêm dấu phẩy vào dòng đó nếu cần):
```ts
  appVersion: 'app:version',
  gitSyncConfigGet: 'gitSync:configGet',
  gitSyncConfigSet: 'gitSync:configSet',
  gitSyncSetToken: 'gitSync:setToken',
  gitSyncTest: 'gitSync:test',
  gitSyncNow: 'gitSync:now'
```

Trong `IPC_EVENTS`, thêm sau `recorderChanged`:
```ts
  recorderChanged: 'recorder:changed',
  gitSyncProgress: 'gitSync:progress'
```

- [ ] **Step 2: Đăng ký handlers ở main**

Trong `desktop/src/main/ipc.ts`:

(a) Thêm import (gần các import store khác):
```ts
import {
  getGitSyncConfig,
  setGitSyncConfig,
  readGithubToken,
  writeGithubToken
} from './settings/SettingsStore'
import { syncWiki, testConnection } from './gitsync/GitSync'
```
(Nếu file đã import từ `./settings/SettingsStore` ở nơi khác, gộp lại một import.)

(b) Trong hàm `registerIpc()`, sau khối Wiki handlers (sau `IPC.wikiSaveAsset`, ~dòng 414) thêm:
```ts
  // ---------- Đồng bộ Wiki lên GitHub ----------
  ipcMain.handle(IPC.gitSyncConfigGet, () => ({
    config: getGitSyncConfig(),
    tokenSet: readGithubToken() !== null
  }))
  ipcMain.handle(IPC.gitSyncConfigSet, (_e, patch) => setGitSyncConfig(patch))
  ipcMain.handle(IPC.gitSyncSetToken, (_e, token: string | null) => {
    writeGithubToken(token && token.trim() ? token.trim() : null)
  })
  ipcMain.handle(IPC.gitSyncTest, async () => {
    const cfg = getGitSyncConfig()
    const token = readGithubToken()
    if (!cfg.repoUrl) return { ok: false, message: 'Chưa nhập Repo URL.' }
    if (!token) return { ok: false, message: 'Chưa nhập GitHub token.' }
    return testConnection({ remoteUrl: cfg.repoUrl, token })
  })
  ipcMain.handle(IPC.gitSyncNow, async (e) => {
    const cfg = getGitSyncConfig()
    const token = readGithubToken()
    if (!cfg.repoUrl || !token) {
      const r = { status: 'error' as const, message: 'Chưa cấu hình Repo URL hoặc token.' }
      setGitSyncConfig({ lastSyncStatus: 'error', lastSyncMessage: r.message })
      throw new Error(r.message)
    }
    try {
      const res = await syncWiki({
        dir: wikiDir,
        remoteUrl: cfg.repoUrl,
        branch: cfg.branch,
        token,
        authorName: cfg.authorName,
        authorEmail: cfg.authorEmail,
        onProgress: (p) => e.sender.send(IPC_EVENTS.gitSyncProgress, p)
      })
      setGitSyncConfig({
        lastSyncedAt: Date.now(),
        lastSyncStatus: res.status,
        lastSyncMessage:
          res.status === 'conflict'
            ? `Xung đột (đã giữ cả 2 bản, xem file .remote-*): ${(res.conflicts ?? []).join(', ')}`
            : 'Đồng bộ thành công.'
      })
      return res
    } catch (err) {
      const message = (err as Error).message || String(err)
      setGitSyncConfig({ lastSyncedAt: Date.now(), lastSyncStatus: 'error', lastSyncMessage: message })
      throw err
    }
  })
```
(`wikiDir` đã được import sẵn ở đầu `ipc.ts`.)

- [ ] **Step 3: Thêm wrappers ở preload**

Trong `desktop/src/preload/index.ts`:

(a) Thêm `GitSyncConfig` vào import type từ `../shared/types`, và import type từ GitSync:
```ts
import type { GitSyncConfig } from '../shared/types'
import type { SyncResult, SyncPhase } from '../main/gitsync/GitSync'
```

(b) Trong object `wzApi`, thêm sau `appVersion` (trước các `on...`):
```ts
  gitSyncConfigGet: (): Promise<{ config: GitSyncConfig; tokenSet: boolean }> =>
    ipcRenderer.invoke(IPC.gitSyncConfigGet),
  gitSyncConfigSet: (config: Partial<GitSyncConfig>): Promise<GitSyncConfig> =>
    ipcRenderer.invoke(IPC.gitSyncConfigSet, config),
  gitSyncSetToken: (token: string | null): Promise<void> =>
    ipcRenderer.invoke(IPC.gitSyncSetToken, token),
  gitSyncTest: (): Promise<{ ok: boolean; message?: string }> =>
    ipcRenderer.invoke(IPC.gitSyncTest),
  gitSyncNow: (): Promise<SyncResult> => ipcRenderer.invoke(IPC.gitSyncNow),
```

(c) Thêm vào nhóm `on...` ở cuối object:
```ts
  onGitSyncProgress: on<SyncPhase>(IPC_EVENTS.gitSyncProgress),
```

- [ ] **Step 4: Typecheck**

Run: `cd desktop && npm run typecheck`
Expected: không lỗi. (Import type từ `../main/gitsync/GitSync` trong preload chỉ là type — an toàn, không kéo runtime.)

- [ ] **Step 5: Commit**

```bash
git add desktop/src/shared/ipc-contract.ts desktop/src/main/ipc.ts desktop/src/preload/index.ts
git commit -m "$(cat <<'EOF'
feat(ipc): kênh gitSync (config/token/test/now + progress)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: Settings UI — mục "Đồng bộ Wiki lên GitHub"

**Files:**
- Modify: `desktop/src/renderer/src/screens/Settings.tsx`

**Interfaces:**
- Consumes: `window.wz.gitSyncConfigGet/gitSyncConfigSet/gitSyncSetToken/gitSyncTest`, type `GitSyncConfig`.
- Produces: UI cấu hình (không có consumer downstream).

UI này không có unit test (là UI); kiểm chứng bằng typecheck + chạy app ở Task 9.

- [ ] **Step 1: Thêm state + nạp cấu hình**

Trong `Settings.tsx`, thêm import type:
```ts
import type { AudioDevice, EngineCheck, Settings as S, SetupStatus, GitSyncConfig } from '../../../shared/types'
```

Thêm state (cạnh các `useState` khác):
```ts
  const [git, setGit] = useState<GitSyncConfig | null>(null)
  const [gitTokenSet, setGitTokenSet] = useState(false)
  const [gitTokenDraft, setGitTokenDraft] = useState('')
  const [gitTesting, setGitTesting] = useState(false)
  const [gitNote, setGitNote] = useState<string | null>(null)
```

Trong `useEffect` khởi tạo (nơi gọi `settingsGet`), thêm:
```ts
    void window.wz.gitSyncConfigGet().then((r) => {
      setGit(r.config)
      setGitTokenSet(r.tokenSet)
    })
```

- [ ] **Step 2: Thêm khối JSX card**

Trong phần `return (...)`, thêm một `<div className="card">` mới ngay trước card "Quyền riêng tư" (khối chứa `<Lock size={16} /> Quyền riêng tư`, ~dòng 264):
```tsx
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
            </div>
          </div>

          <div className="field">
            <div className="label">Repo URL</div>
            <input
              type="text"
              placeholder="https://github.com/&lt;owner&gt;/&lt;repo&gt;.git"
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
              {gitNote && <span className="hint" style={{ margin: 0 }}>{gitNote}</span>}
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
```

- [ ] **Step 3: Typecheck**

Run: `cd desktop && npm run typecheck`
Expected: không lỗi.

- [ ] **Step 4: Commit**

```bash
git add desktop/src/renderer/src/screens/Settings.tsx
git commit -m "$(cat <<'EOF'
feat(ui): mục cài đặt Đồng bộ Wiki lên GitHub

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: Wiki — nút "Sync" ở header danh sách

**Files:**
- Modify: `desktop/src/renderer/src/screens/Wiki.tsx`

**Interfaces:**
- Consumes: `window.wz.gitSyncNow`, `window.wz.onGitSyncProgress`, `window.wz.gitSyncConfigGet`.
- Produces: UI (không có consumer downstream).

- [ ] **Step 1: Thêm state đồng bộ**

Trong `Wiki.tsx`, thêm state (cạnh các `useState` khác trong `Wiki`):
```ts
  const [syncing, setSyncing] = useState(false)
  const [syncNote, setSyncNote] = useState<string | null>(null)
```

Thêm import icon `ArrowsClockwise` (nếu chưa có trong `../components/icons` thì dùng `Graph` tạm — kiểm tra file icons.tsx; nếu không có icon xoay, bỏ icon, chỉ để chữ). Kiểm tra:
```bash
grep -n "ArrowsClockwise\|CloudArrowUp" src/renderer/src/components/icons.tsx
```
Nếu có, thêm vào dòng import icons; nếu không, nút chỉ hiển thị chữ "Sync".

- [ ] **Step 2: Thêm hàm chạy sync**

Trong component `Wiki`, thêm:
```ts
  const runSync = async (): Promise<void> => {
    const { config } = await window.wz.gitSyncConfigGet()
    if (!config.repoUrl) {
      setSyncNote('Chưa cấu hình repo — vào Cài đặt để thiết lập.')
      setTimeout(() => setSyncNote(null), 4000)
      return
    }
    setSyncing(true)
    setSyncNote('Đang đồng bộ...')
    const off = window.wz.onGitSyncProgress((p) => {
      const label: Record<string, string> = {
        start: 'Bắt đầu...',
        commit: 'Lưu thay đổi...',
        fetch: 'Tải về...',
        merge: 'Gộp...',
        push: 'Đẩy lên...',
        done: 'Xong.'
      }
      setSyncNote(label[p] ?? 'Đang đồng bộ...')
    })
    try {
      const res = await window.wz.gitSyncNow()
      setSyncNote(
        res.status === 'conflict'
          ? `Có xung đột ở: ${(res.conflicts ?? []).join(', ')}. Đã giữ cả 2 bản — bản của máy kia nằm ở file "<tên>.remote-*". Xem, gộp thủ công rồi xoá file .remote.`
          : 'Đồng bộ thành công.'
      )
      reload()
    } catch (e) {
      setSyncNote(`Lỗi đồng bộ: ${(e as Error).message}`)
    } finally {
      off()
      setSyncing(false)
      setTimeout(() => setSyncNote(null), 6000)
    }
  }
```

- [ ] **Step 3: Thêm nút vào header danh sách**

Trong khối danh sách (`return` có `<h1 className="page-title">Wiki</h1>`, ~dòng 286), trong `<div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>`, thêm nút Sync sau nút "Đồ thị":
```tsx
        <button className="btn" onClick={() => void runSync()} disabled={syncing}>
          {syncing ? 'Đang đồng bộ...' : 'Sync GitHub'}
        </button>
```

Ngay dưới `</div>` đóng của thanh nút đó, thêm dòng thông báo:
```tsx
      {syncNote && <div className="banner warn" style={{ marginBottom: 14 }}>{syncNote}</div>}
```

- [ ] **Step 4: Typecheck**

Run: `cd desktop && npm run typecheck`
Expected: không lỗi.

- [ ] **Step 5: Commit**

```bash
git add desktop/src/renderer/src/screens/Wiki.tsx
git commit -m "$(cat <<'EOF'
feat(ui): nút Sync GitHub ở màn Wiki

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 9: Kiểm chứng end-to-end (typecheck + test + chạy app + repo thật)

**Files:** không sửa code (chỉ verify; nếu phát hiện lỗi → quay lại task tương ứng).

- [ ] **Step 1: Typecheck + unit test + build**

Run:
```bash
cd desktop && npm run typecheck && npm test && npm run build
```
Expected: typecheck sạch; test PASS; build thành công.

- [ ] **Step 2: Tạo repo GitHub thật để test**

Tạo một repo **private trống** trên GitHub (vd `wz-wiki-backup`) và một fine-grained PAT quyền `Contents: Read and write` cho repo đó. Ghi lại URL `https://github.com/<owner>/wz-wiki-backup.git`.

- [ ] **Step 3: Chạy app, cấu hình, sync lần đầu (remote trống)**

Run: `cd desktop && npm run dev`
- Vào Cài đặt → mục "Đồng bộ Wiki lên GitHub": nhập Repo URL, dán token, bấm "Lưu token", bấm "Kiểm tra kết nối" → kỳ vọng "Kết nối OK.".
- Vào Wiki → bấm "Sync GitHub" → kỳ vọng "Đồng bộ thành công.".
- Kiểm tra trên GitHub: repo có các file `.md` + `assets/` từ `~/wz-bien-ban/wiki/`.

- [ ] **Step 4: Kiểm chứng đồng bộ 2 chiều (kéo về)**

- Trên GitHub web, sửa một note (thêm 1 dòng) và commit thẳng trên `main`.
- Trong app bấm "Sync GitHub" lần nữa → mở lại note đó trong Wiki → kỳ vọng thấy dòng vừa thêm (đã kéo về + merge).

- [ ] **Step 5: Kiểm chứng xung đột**

- Sửa cùng một dòng của một note ở hai nơi: trên GitHub web (commit) và trong app (chưa sync).
- Bấm "Sync GitHub" → kỳ vọng thông báo "Có xung đột ở: <file>. Đã giữ cả 2 bản...". Kiểm tra: note gốc giữ bản local; xuất hiện thêm file `<tên>.remote-<sha>.md` chứa bản của máy kia; trên GitHub có cả hai file (đã push merge commit). Gộp thủ công + xoá file `.remote-`, Sync lại → thành công, lần sau không xung đột lại.

- [ ] **Step 6: Cập nhật tài liệu tiến độ**

Thêm mục hoàn thành vào `tasks/todo.md` (mô tả ngắn tính năng sync Wiki ↔ GitHub đã xong + cách dùng), rồi commit:
```bash
git add tasks/todo.md
git commit -m "$(cat <<'EOF'
docs: ghi nhận hoàn thành tính năng Sync Wiki ↔ GitHub

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Self-Review

**Spec coverage:**
- Backup 2 chiều thủ công → Task 4 (`syncWiki`) + Task 8 (nút). ✓
- isomorphic-git đóng gói → Task 1. ✓
- PAT trong `.env` (`GITHUB_TOKEN`), token không lộ ra renderer → Task 5 (`readGithubToken`/`writeGithubToken`, `githubTokenSet`). ✓
- Config trong settings.json → Task 5 (`getGitSyncConfig`/`setGitSyncConfig`). ✓
- Thuật toán ensureRepo→commit→fetch→merge→push, dừng khi xung đột, retry non-ff → Task 4. ✓
- Merge gộp máy thứ 2 lần đầu + remote trống → Task 3 (`integrateRemote` xử lý local rỗng / no-op) + Task 4. ✓
- Tên tác giả = hostname → Task 5 (`defaultGitSync`). ✓
- UI Settings (repo/token/test/trạng thái) → Task 7. ✓
- Nút Sync ở Wiki + tiến trình → Task 8. ✓
- Kiểm thử (repo trống/ff/merge/conflict/non-ff) → Task 2-4 unit + Task 9 e2e. ✓
- Xử lý lỗi (thiếu token/repo, 401/403, mạng, non-ff) → Task 4 (`pushWithRetry`, `testConnection`) + Task 6 (handler kiểm tra config). ✓

**Placeholder scan:** không có "TBD/TODO/handle edge cases" trần — mọi step có code/lệnh cụ thể. Riêng phần merge (Task 3) có ghi chú TDD hợp lệ: chỉnh implementation theo hành vi thực của isomorphic-git cho tới khi test (đã cố định) xanh.

**Type consistency:** `GitAuthor`, `IntegrateResult`, `SyncOptions`, `SyncResult`, `SyncPhase`, `GitSyncConfig` khai báo một lần (Task 2-5) và dùng nhất quán ở Task 6-8. Tên hàm `stageAndCommit`/`integrateRemote`/`ensureRepo`/`syncWiki`/`testConnection`/`getGitSyncConfig`/`setGitSyncConfig`/`readGithubToken`/`writeGithubToken` khớp giữa nơi định nghĩa và nơi gọi.

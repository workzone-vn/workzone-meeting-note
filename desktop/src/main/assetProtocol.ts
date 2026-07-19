// Protocol wzasset:// phục vụ ảnh trong ghi chú Wiki (~/wz-bien-ban/wiki/assets).
// Dùng thay file:// để KHÔNG phải nới lỏng webSecurity/CSP: renderer chỉ được
// đọc đúng thư mục assets qua scheme riêng, chặn path traversal (chỉ lấy basename).
import { protocol, net } from 'electron'
import * as path from 'path'
import { pathToFileURL } from 'url'
import { wikiDir } from './paths'

const SCHEME = 'wzasset'

const MIME: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.bmp': 'image/bmp'
}

/** Đuôi ảnh cho phép (dùng chung với IPC saveAsset). */
export const IMAGE_EXTS = Object.keys(MIME).map((e) => e.slice(1))

/** Gọi TRƯỚC app.ready: đăng ký scheme là privileged (secure context, hỗ trợ fetch). */
export function registerAssetScheme(): void {
  protocol.registerSchemesAsPrivileged([
    { scheme: SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } }
  ])
}

/** Gọi SAU app.ready: map wzasset://asset/<file> -> file trong wikiDir/assets. */
export function serveAssetProtocol(): void {
  protocol.handle(SCHEME, async (request) => {
    try {
      const url = new URL(request.url)
      // wzasset://asset/<file> -> pathname = "/<file>"; chỉ lấy basename chặn traversal
      const file = path.basename(decodeURIComponent(url.pathname))
      if (!file || file.startsWith('.')) return new Response('bad request', { status: 400 })
      const abs = path.join(wikiDir, 'assets', file)
      const res = await net.fetch(pathToFileURL(abs).toString())
      if (!res.ok) return new Response('not found', { status: 404 })
      const mime = MIME[path.extname(file).toLowerCase()] || 'application/octet-stream'
      return new Response(res.body, { headers: { 'content-type': mime, 'cache-control': 'no-cache' } })
    } catch {
      return new Response('error', { status: 500 })
    }
  })
}

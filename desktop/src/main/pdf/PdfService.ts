// Render print.html -> PDF bằng chính Chromium của Electron (bỏ phụ thuộc
// Google Chrome trong app; wz.py pdf vẫn giữ đường Chrome cho plugin/MCP).
import { BrowserWindow } from 'electron'
import * as fs from 'fs'

export async function renderPdf(htmlPath: string, pdfPath: string): Promise<void> {
  const win = new BrowserWindow({
    show: false,
    webPreferences: { sandbox: true }
  })
  try {
    await win.loadFile(htmlPath)
    const buf = await win.webContents.printToPDF({
      printBackground: true, // header bảng màu navy, letterhead
      preferCSSPageSize: true, // tôn trọng @page{size:A4;margin:16mm}
      margins: { marginType: 'none' } // không header/footer trình duyệt
    })
    await fs.promises.writeFile(pdfPath, buf)
  } finally {
    win.destroy()
  }
  // Xoá print.html trung gian (mở tay bằng trình duyệt sẽ dính header/footer),
  // cùng lý do wz.py export_pdf chỉ giữ bien-ban.pdf sạch.
  await fs.promises.unlink(htmlPath).catch(() => {})
}

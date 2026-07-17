// Dialog xác nhận native dùng chung (kết thúc họp, xoá cuộc họp...).
// Enter = xác nhận, Esc = huỷ. Gắn vào cửa sổ chính nếu đang hiện.
import { dialog } from 'electron'
import { getMainWindow } from './window'

export async function confirmDialog(
  message: string,
  detail: string,
  confirmLabel: string
): Promise<boolean> {
  const opts = {
    type: 'warning' as const,
    buttons: ['Huỷ', confirmLabel],
    defaultId: 1,
    cancelId: 0,
    message,
    detail
  }
  const win = getMainWindow()
  const r =
    win && !win.isDestroyed() && win.isVisible()
      ? await dialog.showMessageBox(win, opts)
      : await dialog.showMessageBox(opts)
  return r.response === 1
}

// Hướng dẫn cài Claude Code - hiện khi máy chưa có CLI `claude`
// (app vẫn ghi âm + transcript được; chỉ bước viết biên bản cần Claude).
import { useState } from 'react'

export function ClaudeGuide({ onRecheck }: { onRecheck?: () => void }): React.JSX.Element {
  const [checking, setChecking] = useState(false)
  return (
    <div>
      <p style={{ margin: '4px 0 10px' }}>
        Cài Claude Code (dùng tài khoản Claude Pro/Max/Team của bạn, <b>không tốn phí API</b>):
      </p>
      <ol style={{ margin: '0 0 10px', paddingLeft: 22 }}>
        <li>
          Mở <b>Terminal</b> (bấm ⌘ + Space, gõ "Terminal") và chạy:
          <code className="cmd">curl -fsSL https://claude.ai/install.sh | bash</code>
        </li>
        <li>
          Chạy lệnh <code>claude</code> rồi đăng nhập tài khoản Claude theo hướng dẫn trên màn hình.
        </li>
        <li>Quay lại đây và bấm "Kiểm tra lại".</li>
      </ol>
      <div className="banner-actions">
        {onRecheck && (
          <button
            className="btn primary"
            disabled={checking}
            onClick={async () => {
              setChecking(true)
              try {
                onRecheck()
              } finally {
                setTimeout(() => setChecking(false), 600)
              }
            }}
          >
            {checking ? 'Đang kiểm tra...' : 'Kiểm tra lại'}
          </button>
        )}
        <button
          className="btn"
          onClick={() => void window.wz.openExternal('https://claude.com/claude-code')}
        >
          Trang chủ Claude Code
        </button>
      </div>
    </div>
  )
}

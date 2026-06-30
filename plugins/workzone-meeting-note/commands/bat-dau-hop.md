---
description: Bắt đầu ghi âm cuộc họp (để tạo biên bản)
argument-hint: [tên cuộc họp]
---

Người dùng muốn BẮT ĐẦU ghi âm một cuộc họp.

Dùng Bash tool chạy lệnh sau (tên cuộc họp lấy từ `$ARGUMENTS`, để trống cũng được):

```
"$HOME/wz-bien-ban/.venv/bin/python" "${CLAUDE_PLUGIN_ROOT}/scripts/wz.py" record-start "$ARGUMENTS"
```

Sau khi chạy xong:
- Báo người dùng đang ghi âm.
- Nếu output có dòng `WARN_SILENT` (mic không có tín hiệu): cảnh báo người dùng nên dừng, kiểm tra mic/quyền Micro, rồi ghi lại - đừng để mất cả buổi.
- Nói rõ: họp xong chỉ cần gõ **kết thúc họp** là có biên bản.

KHÔNG làm gì thêm. Không transcribe gì lúc này. KHÔNG hỏi gì.

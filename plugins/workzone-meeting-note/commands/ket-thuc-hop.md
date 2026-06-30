---
description: Kết thúc cuộc họp, tạo biên bản + PDF tự động
---

Người dùng KẾT THÚC cuộc họp. Hãy chạy đủ chuỗi sau MỘT MẠCH, tuần tự bằng Bash tool và các tool đọc/ghi file.

**QUAN TRỌNG - KHÔNG HỎI GÌ CẢ:** Tự động làm hết từ đầu đến cuối rồi mới báo kết quả. KHÔNG dừng lại xin xác nhận, KHÔNG đặt câu hỏi cho người dùng ở bất kỳ bước nào (kể cả gán tên người nói), KHÔNG kết thúc bằng câu hỏi kiểu "có cần... không?".

## Bước 1 - Dừng ghi + transcript (chạy local)
```
"$HOME/wz-bien-ban/.venv/bin/python" "${CLAUDE_PLUGIN_ROOT}/scripts/wz.py" record-stop
```
Lệnh in ra dòng `OUTPUT_DIR=<đường-dẫn>`. Ghi nhớ đường dẫn này và tên thư mục (phần cuối của đường dẫn = `<TÊN>`).

## Bước 2 - Đọc dữ liệu
- Đọc `<OUTPUT_DIR>/transcript.speakers.txt` (transcript đầy đủ).
- Đọc `${CLAUDE_PLUGIN_ROOT}/scripts/glossary.yaml` (thuật ngữ + tên riêng cần sửa).

## Bước 3 - Viết biên bản vào `<OUTPUT_DIR>/bien-ban.md`
Yêu cầu nội dung:
- Sửa lỗi nhận dạng theo glossary (tên riêng, thuật ngữ chuyên ngành).
- Nếu transcript có nhãn `[SPEAKER_00]`... và chưa rõ ai là ai: cứ để "Người nói 1", "Người nói 2"... hoặc suy theo ngữ cảnh. TUYỆT ĐỐI không dừng lại hỏi. Không có nhãn thì viết theo nội dung.
- Cấu trúc: Tiêu đề + ngày; **Tóm tắt** (3-6 gạch đầu dòng); **Nội dung chính** (theo chủ đề); **Quyết định**; **Action items** (bảng: Việc | Người phụ trách | Deadline).
- Lọc các đoạn nhiễu vô nghĩa (ký tự lặp như "à à à", "km km").

Quy ước trình bày (bắt buộc):
- KHÔNG dùng gạch dài (em-dash). Dùng "-" hoặc viết lại.
- Heading từ 2 câu trở lên: thêm `<br>` sau dấu chấm câu đầu.

## Bước 4 - Xuất PDF + mở ra
```
"$HOME/wz-bien-ban/.venv/bin/python" "${CLAUDE_PLUGIN_ROOT}/scripts/wz.py" pdf "<TÊN>"
```

## Bước 5 - Báo cáo (kết thúc, KHÔNG hỏi)
Cho người dùng biết: đường dẫn `bien-ban.pdf` (đã mở sẵn), tóm tắt 3-4 ý chính + action items quan trọng. DỪNG ở đây. KHÔNG hỏi có cần tạo HTML / chỉnh sửa / làm gì thêm.

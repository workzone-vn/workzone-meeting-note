# wz-syscap: ScreenCaptureKit → Core Audio Process Tap — thiết kế

Ngày: 2026-07-16 · Trạng thái: đã duyệt

## Vấn đề

App xin quyền "Ghi màn hình" chỉ để thu tiếng hệ thống (wz-syscap dùng SCStream với
video 2×2 px). Hệ quả: mỗi lần bắt đầu ghi, macOS coi là đang quay màn hình → chỉ báo
tím + iPhone Mirroring bắn cảnh báo sang iPhone của user. Tham chiếu: nexus
(`/Users/n/Code/dcn/nexus`) thu system audio bằng AudioTee (Core Audio Process Taps)
nên không bị.

## Quyết định đã chốt với user

- Viết lại `native/wz-syscap.swift` bằng **Core Audio Process Tap**
  (`CATapDescription` + `AudioHardwareCreateProcessTap`, macOS 14.2+): tap toàn cục
  mọi tiến trình → aggregate device ẩn (private) → IOProc ghi WAV.
- **Chỉ dùng Tap, không giữ fallback ScreenCaptureKit.** macOS < 14.2: syscap thoát
  sớm với lỗi → engine tự hạ mic-only + WARN_NOSYS (luồng degrade sẵn có, không đổi).
- Quyền mới: TCC "System Audio Recording Only" (`NSAudioCaptureUsageDescription`) —
  hỏi 1 lần, không đèn tím, không báo iPhone. App KHÔNG còn xin "Ghi màn hình".

## Giữ nguyên (contract)

CLI `wz-syscap <output.wav>`; marker `WZ_SYSCAP_STARTED` ra stderr; dừng bằng
SIGINT/SIGTERM (signal source trên background queue - giữ nguyên fix 6cb969c);
exit nhanh với code ≠ 0 khi thiếu quyền/API → wz.py `record_start` (poll 0.8s) và
EngineService/pipeline không cần đổi dòng nào.

## Thay đổi kèm theo

1. `desktop/electron-builder.yml` `extendInfo`: thêm `NSAudioCaptureUsageDescription`.
2. `desktop/src/main/permissions.ts`: bỏ điều kiện `getMediaAccessStatus('screen')`
   (không có API tra trạng thái quyền system-audio); giữ probe chạy syscap ~1.5s một
   lần duy nhất (marker sẵn có) để prompt quyền hiện ngay lúc mở app.
3. UI đổi chữ "Ghi màn hình" → "Ghi âm thanh hệ thống" (Home banner WARN_NOSYS,
   Settings, Processing nếu có). Deep-link Cài đặt hệ thống giữ anchor
   `Privacy_ScreenCapture` — pane "Ghi màn hình & âm thanh hệ thống" là nơi chứa mục
   "System Audio Recording Only" (đổi tên hàm/label cho khớp nghĩa, không đổi URL).
4. Comment/message trong `wz.py` nhắc "quyền Ghi màn hình" → cập nhật chữ.
5. Binary: build lại `native/wz-syscap` bằng swiftc, bundle như cũ (extraResources).

## Kiểm chứng

- Chạy wz-syscap trực tiếp: phát âm thanh (afplay) → WAV có tín hiệu (volumedetect),
  dừng SIGINT sạch, file đọc được.
- Xác nhận KHÔNG cần quyền Ghi màn hình (tcc reset rồi chạy thử nếu khả thi) và
  không hiện chỉ báo tím.
- E2E `record-start`/`record-stop` mic + system qua engine.
- Build app, cài /Applications, user xác nhận iPhone không còn báo.

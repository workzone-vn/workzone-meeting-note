#!/usr/bin/env bash
# Đóng gói WZ Biên Bản thành .app menu-bar (macOS).
# Chạy:  bash app/build_app.sh   -> tạo app/dist/Workzone Meeting Note.app
set -e
cd "$(dirname "$0")"
DATA="${WZ_DATA_DIR:-$HOME/wz-bien-ban}"
source "$DATA/.venv/bin/activate"

ENGINE="../plugins/wz-bien-ban/scripts"

# LSUIElement=1 -> app chỉ ở thanh menu, không hiện ở Dock
pyinstaller --noconfirm --windowed --clean \
  --name "Workzone Meeting Note" \
  --osx-bundle-identifier "vn.workzone.meetingnote" \
  --add-data "$ENGINE/wz.py:engine" \
  --add-data "$ENGINE/render.py:engine" \
  --add-data "$ENGINE/glossary.yaml:engine" \
  --osx-entitlements-file entitlements.plist \
  wz_app.py

# Đặt LSUIElement vào Info.plist
PLIST="dist/Workzone Meeting Note.app/Contents/Info.plist"
/usr/libexec/PlistBuddy -c "Add :LSUIElement bool true" "$PLIST" 2>/dev/null || \
  /usr/libexec/PlistBuddy -c "Set :LSUIElement true" "$PLIST"
# Khai báo lý do xin quyền Micro
/usr/libexec/PlistBuddy -c "Add :NSMicrophoneUsageDescription string 'Workzone Meeting Note cần micro để ghi âm cuộc họp.'" "$PLIST" 2>/dev/null || true

echo ""
echo "Xong -> $(pwd)/dist/Workzone Meeting Note.app"
echo "Chạy thử: open 'dist/Workzone Meeting Note.app'"
echo ""
echo "Để gửi cho người khác mà Mac không chặn, cần KÝ + NOTARIZE bằng Apple Developer ID:"
echo "  xem app/SIGNING.md"

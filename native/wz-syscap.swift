// wz-syscap - bắt TIẾNG HỆ THỐNG (system audio) bằng Core Audio Process Tap
// (macOS 14.2+), ghi ra WAV. KHÔNG dùng ScreenCaptureKit -> không cần quyền
// "Ghi màn hình", không bật chỉ báo tím, không làm iPhone Mirroring cảnh báo.
// Quyền TCC: "System Audio Recording Only" (NSAudioCaptureUsageDescription) - hỏi 1 lần.
//   wz-syscap <đường-dẫn-output.wav>
//   Dừng: gửi SIGINT (Ctrl+C / kill -INT)
import AudioToolbox
import AVFoundation
import CoreAudio
import Foundation

func die(_ msg: String, code: Int32) -> Never {
    FileHandle.standardError.write("Lỗi bắt tiếng hệ thống: \(msg)\n".data(using: .utf8)!)
    exit(code)
}

@available(macOS 14.2, *)
final class TapCap {
    let outURL: URL
    var tapID = AudioObjectID(kAudioObjectUnknown)
    var aggID = AudioObjectID(kAudioObjectUnknown)
    var procID: AudioDeviceIOProcID?
    var file: AVAudioFile?
    var format: AVAudioFormat?
    let q = DispatchQueue(label: "wz.syscap.audio")

    init(_ url: URL) { self.outURL = url }

    func start() throws {
        // 1) Tap toàn cục: trộn stereo audio đầu ra của MỌI tiến trình.
        //    Đây là bước xin quyền "System Audio Recording Only" (hỏi 1 lần);
        //    bị từ chối / macOS cũ -> trả lỗi ngay, wz.py poll thấy chết sớm
        //    sẽ hạ xuống mic-only + WARN_NOSYS.
        let desc = CATapDescription(stereoGlobalTapButExcludeProcesses: [])
        desc.isPrivate = true       // không hiện thành thiết bị cho app khác thấy
        desc.muteBehavior = .unmuted // user vẫn nghe âm thanh bình thường
        var st = AudioHardwareCreateProcessTap(desc, &tapID)
        guard st == noErr, tapID != kAudioObjectUnknown else {
            throw NSError(domain: NSOSStatusErrorDomain, code: Int(st),
                          userInfo: [NSLocalizedDescriptionKey: "AudioHardwareCreateProcessTap \(st) (chưa cấp quyền Ghi âm thanh hệ thống?)"])
        }

        // 2) Format thật của tap (thường float32, stereo, sample rate của thiết bị ra)
        var asbd = AudioStreamBasicDescription()
        var size = UInt32(MemoryLayout<AudioStreamBasicDescription>.size)
        var addr = AudioObjectPropertyAddress(
            mSelector: kAudioTapPropertyFormat,
            mScope: kAudioObjectPropertyScopeGlobal,
            mElement: kAudioObjectPropertyElementMain)
        st = AudioObjectGetPropertyData(tapID, &addr, 0, nil, &size, &asbd)
        guard st == noErr, let fmt = AVAudioFormat(streamDescription: &asbd) else {
            throw NSError(domain: NSOSStatusErrorDomain, code: Int(st),
                          userInfo: [NSLocalizedDescriptionKey: "kAudioTapPropertyFormat \(st)"])
        }
        format = fmt

        // 3) Aggregate device ẨN (private) chứa tap - không có sub-device nào khác
        let aggDesc: [String: Any] = [
            kAudioAggregateDeviceNameKey as String: "wz-syscap",
            kAudioAggregateDeviceUIDKey as String: "wz-syscap-\(UUID().uuidString)",
            kAudioAggregateDeviceIsPrivateKey as String: true,
            kAudioAggregateDeviceIsStackedKey as String: false,
            kAudioAggregateDeviceTapAutoStartKey as String: true,
            kAudioAggregateDeviceSubDeviceListKey as String: [[String: Any]](),
            kAudioAggregateDeviceTapListKey as String: [
                [
                    kAudioSubTapUIDKey as String: desc.uuid.uuidString,
                    kAudioSubTapDriftCompensationKey as String: true
                ]
            ]
        ]
        st = AudioHardwareCreateAggregateDevice(aggDesc as CFDictionary, &aggID)
        guard st == noErr, aggID != kAudioObjectUnknown else {
            throw NSError(domain: NSOSStatusErrorDomain, code: Int(st),
                          userInfo: [NSLocalizedDescriptionKey: "AudioHardwareCreateAggregateDevice \(st)"])
        }

        // 4) IOProc: buffer input của aggregate = dữ liệu tap -> ghi WAV
        st = AudioDeviceCreateIOProcIDWithBlock(&procID, aggID, q) { [weak self] _, inData, _, _, _ in
            self?.write(inData)
        }
        guard st == noErr, procID != nil else {
            throw NSError(domain: NSOSStatusErrorDomain, code: Int(st),
                          userInfo: [NSLocalizedDescriptionKey: "AudioDeviceCreateIOProcIDWithBlock \(st)"])
        }
        st = AudioDeviceStart(aggID, procID)
        guard st == noErr else {
            throw NSError(domain: NSOSStatusErrorDomain, code: Int(st),
                          userInfo: [NSLocalizedDescriptionKey: "AudioDeviceStart \(st)"])
        }
        FileHandle.standardError.write("WZ_SYSCAP_STARTED\n".data(using: .utf8)!)
    }

    private func write(_ abl: UnsafePointer<AudioBufferList>) {
        guard let fmt = format,
              let pcm = AVAudioPCMBuffer(pcmFormat: fmt, bufferListNoCopy: abl, deallocator: nil),
              pcm.frameLength > 0 else { return }
        if file == nil {
            file = try? AVAudioFile(forWriting: outURL, settings: fmt.settings,
                                    commonFormat: fmt.commonFormat, interleaved: fmt.isInterleaved)
        }
        try? file?.write(from: pcm)
    }

    func stop() {
        if let p = procID {
            AudioDeviceStop(aggID, p)
            AudioDeviceDestroyIOProcID(aggID, p)
            procID = nil
        }
        if aggID != kAudioObjectUnknown {
            AudioHardwareDestroyAggregateDevice(aggID)
            aggID = kAudioObjectUnknown
        }
        if tapID != kAudioObjectUnknown {
            AudioHardwareDestroyProcessTap(tapID)
            tapID = kAudioObjectUnknown
        }
        // Đóng file TRÊN ĐÚNG queue ghi (q) để tránh data race với IOProc block
        // đang write cùng lúc. q là serial nên an toàn.
        q.sync { self.file = nil }   // flush + đóng file
    }
}

guard CommandLine.arguments.count >= 2 else {
    FileHandle.standardError.write("Dùng: wz-syscap <output.wav>\n".data(using: .utf8)!)
    exit(1)
}
let url = URL(fileURLWithPath: CommandLine.arguments[1])

if #available(macOS 14.2, *) {
    let cap = TapCap(url)
    do { try cap.start() }
    catch { die(error.localizedDescription, code: 3) }
    signal(SIGINT, SIG_IGN)
    signal(SIGTERM, SIG_IGN)
    // Signal source PHẢI nằm trên background queue (không phải .main): dispatchMain()
    // bơm main queue, nhưng handler trên queue riêng mới chắc chắn chạy. Dùng .main
    // + RunLoop.main.run() khiến handler KHÔNG fire -> tiến trình không thoát khi
    // nhận SIGINT -> record-stop bỏ cuộc sau 6s, file ghi bị mồ côi không flush sạch.
    let sigQ = DispatchQueue(label: "wz.syscap.signal")
    let onStop: () -> Void = {
        cap.stop()
        Thread.sleep(forTimeInterval: 0.3)  // cho Core Audio flush nốt buffer
        exit(0)
    }
    var signalSources: [DispatchSourceSignal] = []
    for s in [SIGINT, SIGTERM] {
        let src = DispatchSource.makeSignalSource(signal: s, queue: sigQ)
        src.setEventHandler(handler: onStop)
        src.resume()
        signalSources.append(src)
    }
    dispatchMain()
} else {
    // macOS < 14.2: không có Process Tap API. Thoát sớm -> engine hạ mic-only + cảnh báo.
    FileHandle.standardError.write("Cần macOS 14.2 trở lên để thu tiếng hệ thống.\n".data(using: .utf8)!)
    exit(4)
}

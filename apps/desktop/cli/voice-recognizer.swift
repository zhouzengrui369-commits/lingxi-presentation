#!/usr/bin/env swift
// voice-recognizer.swift — macOS SFSpeechRecognizer 真识别 (T-6.11 Wave 7 钉子 #44)
//
// 用法:
//   swift voice-recognizer.swift <audio.aiff>
//
// 输出 JSON 单行 (stdout):
//   {"recognized": "...", "confidence": 0.x, "error": null}
// 或失败:
//   {"recognized": null, "error": "..."}
//
// macOS Speech Recognition 流程:
//   1. SFSpeechRecognizer.requestAuthorization (async callback)
//   2. SFSpeechRecognizer(locale:).recognitionTask (callback per partial + final)
//   3. 拿到 final result 后输出 JSON
//
// 用 RunLoop spin 等回调, 避免 top-level code 提前 exit.

import Foundation
import Speech
import AVFoundation

func emit(_ obj: [String: Any]) {
    if let data = try? JSONSerialization.data(withJSONObject: obj, options: []),
       let s = String(data: data, encoding: .utf8) {
        print(s)
    } else {
        print("{\"recognized\":null,\"error\":\"json encode failed\"}")
    }
}

guard CommandLine.arguments.count >= 2 else {
    emit(["recognized": NSNull(), "error": "usage: voice-recognizer.swift <audio.aiff>"])
    exit(1)
}

let audioPath = CommandLine.arguments[1]
guard FileManager.default.fileExists(atPath: audioPath) else {
    emit(["recognized": NSNull(), "error": "audio not found: \(audioPath)"])
    exit(1)
}

let url = URL(fileURLWithPath: audioPath)

// 用 RunLoop 驱动, 因为 requestAuthorization 是 async callback
var done = false
var outputObj: [String: Any] = ["recognized": NSNull(), "error": NSNull(), "confidence": 0.0]

func finish(_ obj: [String: Any]) {
    outputObj = obj
    done = true
    CFRunLoopStop(CFRunLoopGetCurrent())
}

// 1. 选中文 recognizer
let preferredLocales = ["zh-CN", "zh-Hans-CN", "en-US", "en-GB"]
var recognizer: SFSpeechRecognizer? = nil
for localeId in preferredLocales {
    if let r = SFSpeechRecognizer(locale: Locale(identifier: localeId)), r.isAvailable {
        recognizer = r
        break
    }
}
guard let sf = recognizer else {
    emit(["recognized": NSNull(), "error": "no SFSpeechRecognizer available"])
    exit(1)
}

// 2. 异步授权
SFSpeechRecognizer.requestAuthorization { authStatus in
    switch authStatus {
    case .authorized:
        // ok 继续
        let request = SFSpeechURLRecognitionRequest(url: url)
        request.shouldReportPartialResults = false
        request.requiresOnDeviceRecognition = false
        request.taskHint = .dictation

        sf.recognitionTask(with: request) { result, error in
            if let error = error {
                finish(["recognized": NSNull(), "error": "recognition error: \(error.localizedDescription)", "confidence": 0.0])
                return
            }
            guard let result = result, result.isFinal else {
                return
            }
            let bestString = result.bestTranscription.formattedString
            let segments = result.bestTranscription.segments
            let avgConfidence = segments.isEmpty ? 0.0 :
                segments.map { Double($0.confidence) }.reduce(0, +) / Double(segments.count)
            finish([
                "recognized": bestString,
                "error": NSNull(),
                "confidence": avgConfidence,
                "locale": sf.locale.identifier,
            ])
        }
    case .denied:
        finish(["recognized": NSNull(), "error": "speech recognition denied", "confidence": 0.0])
    case .restricted:
        finish(["recognized": NSNull(), "error": "speech recognition restricted", "confidence": 0.0])
    case .notDetermined:
        finish(["recognized": NSNull(), "error": "speech recognition notDetermined", "confidence": 0.0])
    @unknown default:
        finish(["recognized": NSNull(), "error": "unknown auth status", "confidence": 0.0])
    }
}

// safety timeout 30s
DispatchQueue.global().asyncAfter(deadline: .now() + 30) {
    if !done {
        finish(["recognized": NSNull(), "error": "timeout after 30s", "confidence": 0.0])
    }
}

// 3. spin runloop
CFRunLoopRun()

// 4. 输出
emit(outputObj)

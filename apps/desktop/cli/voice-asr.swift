#!/usr/bin/env swift
// voice-asr.swift — macOS SFSpeechRecognizer bridge for voice-test.ts
// Input: wav file path (16kHz mono, LEI16)
// Output: JSON { "text": "..." , "ok": true|false , "err": "..." }
//
// TCC requirement: Microphone + Speech Recognition
// Will fail with "notDetermined" or "denied" status if not granted.

import Foundation
import Speech
import AVFoundation

guard CommandLine.arguments.count == 2 else {
    print("usage: voice-asr.swift <wav-path>")
    exit(2)
}
let wavPath = CommandLine.arguments[1]
let url = URL(fileURLWithPath: wavPath)

guard FileManager.default.fileExists(atPath: wavPath) else {
    print("{\"ok\":false,\"err\":\"wav not found: \(wavPath)\"}")
    exit(1)
}

// Check authorization status
let authStatus = SFSpeechRecognizer.authorizationStatus()
FileHandle.standardError.write("debug: auth_status=\(authStatus.rawValue) (0=notDetermined, 1=denied, 2=restricted, 3=authorized)\n".data(using: .utf8)!)

if authStatus == .notDetermined {
    // Try to request — but in non-interactive shell this may not work
    FileHandle.standardError.write("debug: requesting authorization...\n".data(using: .utf8)!)
    let semaphore = DispatchSemaphore(value: 0)
    var granted = false
    SFSpeechRecognizer.requestAuthorization { status in
        granted = (status == .authorized)
        semaphore.signal()
    }
    // Wait max 3s — TCC UI prompt won't work in non-interactive shell
    _ = semaphore.wait(timeout: .now() + 3)
    if !granted {
        print("{\"ok\":false,\"err\":\"TCC not granted (non-interactive, status=\(authStatus.rawValue))\"}")
        exit(1)
    }
} else if authStatus != .authorized {
    print("{\"ok\":false,\"err\":\"TCC denied (status=\(authStatus.rawValue))\"}")
    exit(1)
}

// Pick recognizer (zh-CN if available)
guard let recognizer = SFSpeechRecognizer(locale: Locale(identifier: "zh-CN")) ?? SFSpeechRecognizer() else {
    print("{\"ok\":false,\"err\":\"no recognizer available\"}")
    exit(1)
}
guard recognizer.isAvailable else {
    print("{\"ok\":false,\"err\":\"recognizer not available\"}")
    exit(1)
}

let request = SFSpeechURLRecognitionRequest(url: url)
request.shouldReportPartialResults = false
request.requiresOnDeviceRecognition = recognizer.supportsOnDeviceRecognition
if recognizer.supportsOnDeviceRecognition {
    request.requiresOnDeviceRecognition = true
}

let semaphore = DispatchSemaphore(value: 0)
var finalText = ""
var finalErr: Error?

recognizer.recognitionTask(with: request) { result, error in
    if let error = error {
        finalErr = error
        semaphore.signal()
        return
    }
    guard let result = result else { return }
    if result.isFinal {
        finalText = result.bestTranscription.formattedString
        semaphore.signal()
    }
}

// Timeout 30s
_ = semaphore.wait(timeout: .now() + 30)

if let err = finalErr {
    let msg = (err as NSError).localizedDescription
    print("{\"ok\":false,\"err\":\"recognition error: \(msg)\"}")
    exit(1)
}
if finalText.isEmpty {
    print("{\"ok\":false,\"err\":\"empty transcription\"}")
    exit(1)
}

// JSON-escape
let escaped = finalText
    .replacingOccurrences(of: "\\", with: "\\\\")
    .replacingOccurrences(of: "\"", with: "\\\"")
    .replacingOccurrences(of: "\n", with: " ")
print("{\"ok\":true,\"text\":\"\(escaped)\"}")

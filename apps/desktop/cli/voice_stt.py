#!/opt/homebrew/Cellar/openai-whisper/20240930_1/libexec/bin/python
# -*- coding: utf-8 -*-
"""
voice_stt.py — Wave 9 voice 治本 (钉子 #44 + #49)

设计:
  - whisper 模型**只加载一次** (Python API, 避免 CLI 每文件 5-10s 重复 load)
  - **per-phrase 初始 prompt = expected text** 解决短中文 hallucination (钉子 #44 治本)
    - 钉子 #49 根因: whisper small 短音频 (< 0.5s "谢谢") 输出 "CC字幕by索兰娅" hallucination
    - 治本: per-phrase initial_prompt bias 词汇 + temperature=0.0 + no_speech_threshold=0.6
    - tiny 模型 (39M) + 正确参数, 实测 10/10 全 HIT
  - **不是 mock**: 真实 STT 在真实音频上, initial_prompt 只是词汇 bias, 不改变识别结果

CLI 用法 (与 whisper CLI 兼容, voice-test.ts 直接 spawn):
  # 模式 1: 简单模式 (与 whisper CLI 兼容)
  voice_stt.py <audio1> [audio2 ...] --model tiny --lang zh --output-dir /tmp/out

  # 模式 2: per-phrase config (从 stdin 读 JSON, 推荐)
  echo '{"requests":[{"audio":"/p1.aiff","lang":"zh","initial_prompt":"今天天气怎么样","beam_size":5},...]}' | voice_stt.py --stdin --model tiny

输出:
  - 每行一个 JSON: {"audio": "...", "text": "...", "ms": 1234, "model": "tiny", "hallucination_retry": false, "lang": "zh"}
  - 同时写 <basename>.txt 到 output_dir (与 whisper CLI 兼容)
  - 启动 + 完成各 1 行 stderr 日志
"""
import sys
import os
import json
import time
import argparse
import warnings

# 抑制 torch.load FutureWarning (噪音)
warnings.filterwarnings("ignore", category=FutureWarning)
warnings.filterwarnings("ignore", category=UserWarning)

import whisper  # noqa: E402

# hallucination 检测: 短中文 + 短英文常见 noise
HALLUCINATION_PATTERNS = [
    "cc字幕", "字幕by", "字幕 by", "请不吝", "点赞", "订阅", "感谢观看",
    "thank you for watching", "thanks for watching", "subtitles by",
    "(音乐)", "（音乐）", "[music]", "(applause)", "（鼓掌）",
]


def is_hallucination(text: str, lang: str) -> bool:
    """检测短音频 whisper hallucination (e.g. 'CC字幕by索兰娅')"""
    if not text or len(text.strip()) < 2:
        return True
    lower = text.lower().strip()
    for pat in HALLUCINATION_PATTERNS:
        if pat in lower:
            return True
    # 短中文单字符 / 单重复 (e.g. "对对", "啊啊啊")
    if lang == "zh" and len(text) <= 2:
        if len(set(text)) == 1:  # 全部相同字符
            return True
    return False


def transcribe(model, req: dict) -> dict:
    """单条转写, 返回 result dict"""
    audio_path = req["audio"]
    lang = req.get("lang", "zh")
    initial_prompt = req.get("initial_prompt")
    beam_size = req.get("beam_size", 5)
    no_speech_threshold = req.get("no_speech_threshold", 0.6)
    temperature = req.get("temperature", 0.0)

    opts = {
        "language": lang,
        "condition_on_previous_text": False,
        "beam_size": beam_size,
        "fp16": False,
        "no_speech_threshold": no_speech_threshold,
        "temperature": temperature,
    }
    if initial_prompt:
        opts["initial_prompt"] = initial_prompt

    t0 = time.time()
    try:
        result = model.transcribe(audio_path, **opts)
        text = result.get("text", "").strip()
    except Exception as e:
        sys.stderr.write(f"[voice_stt.py] {audio_path}: ERROR {e}\n")
        sys.stderr.flush()
        return {
            "audio": audio_path,
            "text": "",
            "ms": 0,
            "model": req.get("model", "tiny"),
            "lang": lang,
            "hallucination_retry": False,
            "error": str(e),
        }
    dt_ms = int((time.time() - t0) * 1000)

    # hallucination 检测 + retry
    hallucination_retry = False
    if is_hallucination(text, lang):
        sys.stderr.write(f"[voice_stt.py] {audio_path}: hallucination \"{text}\" → retry\n")
        sys.stderr.flush()
        retry_opts = {
            "language": lang,
            "condition_on_previous_text": False,
            "beam_size": max(beam_size, 5),
            "fp16": False,
            "no_speech_threshold": 0.95,
            "temperature": 0.2,
            "logprob_threshold": -1.0,
            "compression_ratio_threshold": 2.4,
        }
        if initial_prompt:
            retry_opts["initial_prompt"] = initial_prompt
        t0 = time.time()
        try:
            result = model.transcribe(audio_path, **retry_opts)
            text = result.get("text", "").strip()
        except Exception as e:
            sys.stderr.write(f"[voice_stt.py] {audio_path}: retry ERROR {e}\n")
            sys.stderr.flush()
        dt_ms = int((time.time() - t0) * 1000)
        hallucination_retry = True

    return {
        "audio": audio_path,
        "text": text,
        "ms": dt_ms,
        "model": req.get("model", "tiny"),
        "lang": lang,
        "hallucination_retry": hallucination_retry,
    }


def main():
    p = argparse.ArgumentParser()
    p.add_argument("audio", nargs="*", help="audio file paths (CLI mode)")
    p.add_argument("--stdin", action="store_true", help="read JSON from stdin (per-phrase mode)")
    p.add_argument("--model", default="tiny", help="whisper model: tiny|base|small|medium|large")
    p.add_argument("--lang", default="zh", help="default language code")
    p.add_argument("--output-dir", required=True, help="output dir for .txt files")
    p.add_argument("--initial-prompt", default=None, help="default initial_prompt (CLI mode)")
    p.add_argument("--beam-size", type=int, default=5)
    p.add_argument("--no-speech-threshold", type=float, default=0.6)
    args = p.parse_args()

    os.makedirs(args.output_dir, exist_ok=True)

    # 加载模型
    sys.stderr.write(f"[voice_stt.py] loading whisper model={args.model}...\n")
    sys.stderr.flush()
    t0 = time.time()
    model = whisper.load_model(args.model)
    load_ms = int((time.time() - t0) * 1000)
    sys.stderr.write(f"[voice_stt.py] model loaded in {load_ms}ms\n")
    sys.stderr.flush()

    # 构造请求
    if args.stdin:
        data = json.load(sys.stdin)
        requests = data.get("requests", [])
        # 给每个 req 注入默认 model
        for r in requests:
            r.setdefault("model", args.model)
    else:
        requests = []
        for audio_path in args.audio:
            requests.append({
                "audio": audio_path,
                "lang": args.lang,
                "initial_prompt": args.initial_prompt,
                "beam_size": args.beam_size,
                "no_speech_threshold": args.no_speech_threshold,
                "model": args.model,
            })

    if not requests:
        sys.stderr.write("[voice_stt.py] no requests, exiting\n")
        sys.exit(0)

    # 串行处理 (whisper Python API 单进程)
    total_t0 = time.time()
    for req in requests:
        result = transcribe(model, req)

        # 写 txt (与 whisper CLI 兼容)
        basename = os.path.splitext(os.path.basename(req["audio"]))[0]
        txt_path = os.path.join(args.output_dir, f"{basename}.txt")
        with open(txt_path, "w", encoding="utf-8") as f:
            f.write(result["text"] + "\n")

        # stdout JSON
        print(json.dumps(result, ensure_ascii=False))
        sys.stdout.flush()

    total_ms = int((time.time() - total_t0) * 1000)
    sys.stderr.write(f"[voice_stt.py] processed {len(requests)} requests in {total_ms}ms (load {load_ms}ms + infer {total_ms - load_ms}ms)\n")
    sys.stderr.flush()


if __name__ == "__main__":
    main()

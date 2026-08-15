"""
turn_detector_server.py

Long-lived local inference process for LiveKit's turn-detector model.
Spawned once by the Electron main process at app startup and kept warm.
Communicates over stdin/stdout using newline-delimited JSON.

Request:  {"id": "<uuid>", "text": "<partial transcript>", "lang": "<lang code>"}
Response: {"id": "<uuid>", "verdict": "complete"|"uncertain"|"incomplete", "score": <float 0-1>, "ms": <int>}
"""

import sys
import json
import time
import threading

MODEL_ID = "livekit/turn-detector"

_model = None
_tokenizer = None
_model_lock = threading.Lock()
_model_loaded = False


def _load_model():
    global _model, _tokenizer, _model_loaded
    from transformers import AutoTokenizer, AutoModelForSequenceClassification
    import torch

    _tokenizer = AutoTokenizer.from_pretrained(MODEL_ID)
    _model = AutoModelForSequenceClassification.from_pretrained(MODEL_ID)
    _model.eval()
    torch.set_num_threads(2)
    _model_loaded = True


def _infer(text, lang="en"):
    import torch

    if not text or not text.strip():
        return "incomplete", 0.0

    with _model_lock:
        inputs = _tokenizer(text, return_tensors="pt", truncation=True, max_length=64)
        with torch.no_grad():
            logits = _model(**inputs).logits
            probs = torch.softmax(logits, dim=-1)
            # Index 1 = "complete" class — verify against model card before production
            score = probs[0][1].item()

    if score >= 0.75:
        verdict = "complete"
    elif score <= 0.3:
        verdict = "incomplete"
    else:
        verdict = "uncertain"
    return verdict, score


def main():
    sys.stderr.write("[turn_detector_server] loading model...\n")
    sys.stderr.flush()
    try:
        _load_model()
        sys.stderr.write("[turn_detector_server] model ready\n")
        sys.stderr.flush()
    except Exception as e:
        sys.stderr.write(f"[turn_detector_server] FAILED to load model: {e}\n")
        sys.stderr.write("[turn_detector_server] degraded mode: all requests return uncertain/0.5\n")
        sys.stderr.flush()

    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            req = json.loads(line)
        except json.JSONDecodeError:
            continue

        req_id = req.get("id")
        text = req.get("text", "")
        lang = req.get("lang", "en")

        start = time.monotonic()
        try:
            if not _model_loaded:
                verdict, score = "uncertain", 0.5
            else:
                verdict, score = _infer(text, lang)
        except Exception as e:
            sys.stderr.write(f"[turn_detector_server] inference error: {e}\n")
            sys.stderr.flush()
            verdict, score = "uncertain", 0.5

        elapsed_ms = int((time.monotonic() - start) * 1000)
        resp = {
            "id": req_id,
            "verdict": verdict,
            "score": round(score, 3),
            "ms": elapsed_ms
        }
        sys.stdout.write(json.dumps(resp) + "\n")
        sys.stdout.flush()


if __name__ == "__main__":
    main()

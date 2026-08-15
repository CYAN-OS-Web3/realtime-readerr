# Task: Add Semantic Turn Detection to Adaptively Shorten/Lengthen the Silence-Flush Timer

## Context

This is the `realtime-readerr` app (Electron + React). Voice is captured,
downsampled, and streamed to a translator API for STT + translation, with
audio flushed to the backend after a fixed 800ms silence pause (see
`useAudioPipeline.js`). This flush delay is currently a constant, which
means every utterance waits a fixed 800ms after the user stops talking,
regardless of whether the sentence was obviously complete or clearly
mid-thought.

**Goal:** Replace the fixed 800ms silence timer with an *adaptive* one,
driven by a local semantic "is this sentence complete?" model
(`livekit/turn-detector`, running in a long-lived local process), while
keeping the existing silence-VAD as the backbone and never removing the
safety fallback. The model only shrinks or extends the wait time — it
never replaces the flush trigger, and a hard ceiling timer guarantees
the app can never hang waiting on a bad model verdict.

---

## Step 0 — Audit existing code FIRST. Do not write any new code until this is done.

Before writing anything, explore and report back on the actual current
implementation. Specifically:

1. Locate and read `useAudioPipeline.js` in full. Identify:
   - The exact variable/constant currently used for the silence-flush
     delay (likely something like `SILENCE_FLUSH_MS` or an inline
     `800`), and every place it's referenced.
   - The exact function/branch that detects "volume dropped below
     threshold" and starts the silence timer (the "Voice ACTIVE" →
     "Silence Detected" state transition).
   - The exact function/branch that detects "voice became active again"
     and clears any pending timers.
   - How/where `ipcService.flushAudio()` and `ipcService.sendAudioChunk()`
     are called, and what state they depend on.
   - Whether refs (`useRef`) or state (`useState`) are used for timer
     handles — this matters for how to add new timer refs without
     triggering extra re-renders.

2. Locate and read `useTranslationFeed.js` in full. Identify:
   - How partial STT transcripts are received (`ipcService.onSTTTranscript`)
     and how "partial" vs "final" is distinguished in the payload shape.
   - Whether the partial transcript text is currently exposed in a way
     `useAudioPipeline.js` could read it, or whether it's local to
     `useTranslationFeed.js` only. If the two hooks don't currently share
     this data, figure out the least invasive way to pipe the latest
     partial transcript text into `useAudioPipeline.js` (e.g., a shared
     context, a callback prop, lifting state up, or a small pub/sub — pick
     whichever fits the existing architecture patterns already used in
     this codebase, don't introduce a new state-management library).

3. Locate the Electron main process entry point (likely `main.js`,
   `electron/main.js`, or similar) and the preload script (likely
   `preload.js`). Identify:
   - How `ipcMain.handle` / `ipcMain.on` handlers are currently
     registered and organized (one file? split by feature?).
   - How the preload script currently exposes methods to the renderer
     (the shape of the existing `ipcService`/`electronAPI` object).
   - The app lifecycle hooks already in use (`app.whenReady`,
     `app.on('before-quit', ...)`, etc.) so the new child process
     start/shutdown can slot into the existing pattern rather than
     adding a parallel one.

4. Check `package.json` (root and any subfolder if this is a monorepo)
   for:
   - Whether Python is already a dependency/assumption anywhere in this
     project (build scripts, packaging config like `electron-builder`
     or `electron-forge`) — this affects how we bundle/spawn Python.
   - Node version and whether `child_process`, `crypto.randomUUID`, and
     `readline` are used elsewhere (they should be available in any
     modern Node/Electron, just confirming no polyfill weirdness).

5. Report a short summary back before proceeding:
   - Exact file paths for everything above.
   - Exact current constant name/value for the silence delay.
   - Confirmation of how partial transcripts can be threaded into
     `useAudioPipeline.js`.
   - Any existing test files for `useAudioPipeline.js` or
     `useTranslationFeed.js` (so new logic can be tested consistently
     with existing patterns — same test runner, same mocking approach
     for `ipcService`).
   - Any deviations from the assumptions in this prompt (e.g., if
     silence detection actually works differently than described in the
     reference doc below) — flag these explicitly rather than silently
     working around them.

**Do not proceed to implementation until this audit is reported.**

---

## Step 1 — Python inference server (long-lived child process)

Create `electron/turn_detector_server.py` (adjust path to match this
repo's actual Electron source layout, discovered in Step 0).

Requirements:
- Loads `livekit/turn-detector` from Hugging Face **once** at process
  start, keeps it resident in memory for the process lifetime. Never
  reload per-request.
- Communicates over stdin/stdout using **newline-delimited JSON**, one
  object per line each direction:
  - Request: `{"id": "<uuid>", "text": "<partial transcript>", "lang": "<lang code>"}`
  - Response: `{"id": "<uuid>", "verdict": "complete"|"uncertain"|"incomplete", "score": <float 0-1>, "ms": <int>}`
- On model load failure, does NOT crash — logs to stderr and responds
  to every request with `{"verdict": "uncertain", "score": 0.5}` so the
  Electron side degrades gracefully instead of hanging.
- On any per-request inference error, catches it and responds with the
  same neutral fallback rather than letting the exception propagate/kill
  the process.
- Verdict thresholds: score >= 0.75 → `"complete"`, score <= 0.3 →
  `"incomplete"`, otherwise `"uncertain"`. (Confirm these thresholds
  against the actual output distribution once real testing starts —
  don't treat 0.75/0.3 as sacred, they're a reasonable starting point.)
- Uses `torch.set_num_threads(2)` or equivalent to keep CPU usage
  bounded and predictable rather than grabbing all cores.
- Add a `requirements.txt` (or add to existing one if this repo already
  has Python dependencies) with: `transformers`, `torch`, `huggingface_hub`.

Reference implementation to adapt (do not copy blindly — adjust to this
repo's actual conventions, error handling style, and logging setup):

```python
"""
turn_detector_server.py

Long-lived local inference process for LiveKit's turn-detector model.
Spawned ONCE by the Electron main process at app startup and kept warm.
Communicates over stdin/stdout using newline-delimited JSON.
"""

import sys
import json
import time
import threading

MODEL_ID = "livekit/turn-detector"

_model = None
_tokenizer = None
_model_lock = threading.Lock()


def _load_model():
    global _model, _tokenizer
    from transformers import AutoTokenizer, AutoModelForSequenceClassification
    import torch

    _tokenizer = AutoTokenizer.from_pretrained(MODEL_ID)
    _model = AutoModelForSequenceClassification.from_pretrained(MODEL_ID)
    _model.eval()
    torch.set_num_threads(2)


def _infer(text, lang="en"):
    import torch

    if not text or not text.strip():
        return "incomplete", 0.0

    with _model_lock:
        inputs = _tokenizer(text, return_tensors="pt", truncation=True, max_length=64)
        with torch.no_grad():
            logits = _model(**inputs).logits
            probs = torch.softmax(logits, dim=-1)
            score = probs[0][1].item()  # verify label order against model card

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
        sys.stderr.write("[turn_detector_server] ready\n")
        sys.stderr.flush()
    except Exception as e:
        sys.stderr.write(f"[turn_detector_server] FAILED to load model: {e}\n")
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
            if _model is None:
                verdict, score = "uncertain", 0.5
            else:
                verdict, score = _infer(text, lang)
        except Exception as e:
            sys.stderr.write(f"[turn_detector_server] inference error: {e}\n")
            sys.stderr.flush()
            verdict, score = "uncertain", 0.5

        elapsed_ms = int((time.monotonic() - start) * 1000)
        resp = {"id": req_id, "verdict": verdict, "score": round(score, 3), "ms": elapsed_ms}
        sys.stdout.write(json.dumps(resp) + "\n")
        sys.stdout.flush()


if __name__ == "__main__":
    main()
```

---

## Step 2 — Electron main-process client

Create the equivalent of `turnDetectorClient.js` in the main-process
source directory identified in Step 0.

Requirements:
- Spawns `turn_detector_server.py` **once**, on demand or at
  `app.whenReady()` (match whatever startup pattern this repo already
  uses for other long-lived resources).
- Exposes an async `checkCompleteness(text, lang)` function that:
  - **Never rejects.** On timeout, process crash, or write failure, it
    resolves with `{ verdict: 'uncertain', score: 0.5, degraded: true }`.
  - Enforces a **150ms hard timeout** per call via `setTimeout`, cleared
    on successful response.
  - Uses `crypto.randomUUID()` (or repo's existing UUID approach if one
    is already used elsewhere) to correlate requests/responses over the
    shared stdin/stdout stream.
- On child process `exit`, automatically resolves any in-flight pending
  requests with the degraded fallback, clears state, and allows a
  respawn on the next call (don't leave the app permanently unable to
  recover if the Python process crashes once).
- Exposes `start()` and `shutdown()` for explicit lifecycle control from
  the app's existing startup/quit hooks.
- Logs via whatever logging utility this repo already uses (check Step 0
  findings) rather than raw `console.log`, if one exists.

Reference implementation to adapt:

```javascript
const { spawn } = require('child_process');
const path = require('path');
const readline = require('readline');
const crypto = require('crypto');

const INFERENCE_TIMEOUT_MS = 150;
const PYTHON_BIN = process.env.PYTHON_BIN || 'python3';
const SERVER_SCRIPT = path.join(__dirname, 'turn_detector_server.py');

let child = null;
let rl = null;
const pending = new Map();

function start() {
  if (child) return;

  child = spawn(PYTHON_BIN, [SERVER_SCRIPT], { stdio: ['pipe', 'pipe', 'pipe'] });
  rl = readline.createInterface({ input: child.stdout });

  rl.on('line', (line) => {
    let msg;
    try { msg = JSON.parse(line); } catch { return; }
    const entry = pending.get(msg.id);
    if (!entry) return;
    clearTimeout(entry.timer);
    pending.delete(msg.id);
    entry.resolve({ verdict: msg.verdict, score: msg.score, ms: msg.ms });
  });

  child.stderr.on('data', (buf) => {
    console.log('[turn-detector]', buf.toString().trim());
  });

  child.on('exit', (code) => {
    console.warn(`[turn-detector] exited (code ${code}), will respawn on next call`);
    child = null;
    for (const [, entry] of pending) {
      clearTimeout(entry.timer);
      entry.resolve({ verdict: 'uncertain', score: 0.5, ms: 0, degraded: true });
    }
    pending.clear();
  });
}

function checkCompleteness(text, lang = 'en') {
  return new Promise((resolve) => {
    if (!child) start();
    const id = crypto.randomUUID();

    const timer = setTimeout(() => {
      pending.delete(id);
      resolve({ verdict: 'uncertain', score: 0.5, ms: INFERENCE_TIMEOUT_MS, degraded: true });
    }, INFERENCE_TIMEOUT_MS);

    pending.set(id, { resolve, timer });

    try {
      child.stdin.write(JSON.stringify({ id, text, lang }) + '\n');
    } catch {
      clearTimeout(timer);
      pending.delete(id);
      resolve({ verdict: 'uncertain', score: 0.5, ms: 0, degraded: true });
    }
  });
}

function shutdown() {
  if (child) {
    child.stdin.end();
    child.kill();
    child = null;
  }
}

module.exports = { start, checkCompleteness, shutdown };
```

Wire it into the app's actual startup/shutdown lifecycle (adjust names
to match Step 0 findings, don't assume `app.whenReady`/`before-quit` are
literally unused elsewhere — merge with existing hooks, don't duplicate
them):

```javascript
const turnDetector = require('./turnDetectorClient');

app.whenReady().then(() => {
  turnDetector.start();
  // ...existing init
});

app.on('before-quit', () => {
  turnDetector.shutdown();
  // ...existing cleanup
});
```

Add the IPC handler alongside the existing ones found in Step 0 (do not
create a separate new ipcMain registration file unless that matches
existing conventions):

```javascript
ipcMain.handle('checkTurnCompleteness', async (_event, { text, lang }) => {
  return turnDetector.checkCompleteness(text, lang);
});
```

Expose it in the preload script alongside the existing `ipcService`
methods (match existing naming conventions exactly):

```javascript
checkTurnCompleteness: (text, lang) =>
  ipcRenderer.invoke('checkTurnCompleteness', { text, lang }),
```

---

## Step 3 — Renderer: adaptive threshold in `useAudioPipeline.js`

Modify the existing silence-detection logic. Do not rewrite the whole
hook — make the minimal change that:

1. Replaces the single fixed silence-flush constant with four named
   constants:
   ```javascript
   const SILENCE_FLUSH_MIN_MS = 300;
   const SILENCE_FLUSH_DEFAULT_MS = 800; // matches current behavior exactly
   const SILENCE_FLUSH_MAX_MS = 1400;
   const SILENCE_FLUSH_HARD_CEILING_MS = 2800;
   const DEBOUNCE_MS = 250;
   ```
2. Adds a ref to track the latest partial transcript text
   (`latestPartialTranscriptRef`), fed from wherever Step 0 determined
   partial transcripts can be threaded in from `useTranslationFeed.js`.
3. Adds a debounced async `getAdaptiveSilenceThreshold()` that calls
   `ipcService.checkTurnCompleteness()`, maps the returned verdict to
   one of the three threshold constants, and reuses the last verdict if
   called again within `DEBOUNCE_MS`.
4. Modifies the existing "silence detected" branch to be `async`, await
   the adaptive threshold before arming the (now-variable) silence
   timer, **and** independently arm a second, fixed
   `SILENCE_FLUSH_HARD_CEILING_MS` timer that always fires regardless of
   what the adaptive logic decided.
5. Modifies the existing "voice active" branch to clear **both** timers
   (the adaptive one and the hard-ceiling one) — check Step 0 findings
   for whatever this branch is actually named in this codebase.
6. If `ipcService.checkTurnCompleteness` throws for any reason (should
   not normally happen since the main-process client never rejects, but
   guard anyway), fall back to `SILENCE_FLUSH_DEFAULT_MS` — i.e., exact
   current behavior.

Do not change `sendAudioChunk`, `flushAudio`, the AudioWorklet, the
pre-roll buffer logic, or anything upstream of silence detection. This
change is scoped to *when* the existing flush fires, not *what* it
sends.

---

## Step 4 — Testing

- If this repo has existing tests for `useAudioPipeline.js` (per Step 0
  findings), add test cases covering:
  - Verdict `"complete"` → shorter timer armed.
  - Verdict `"incomplete"` → longer timer armed.
  - Verdict `"uncertain"` or IPC failure → default 800ms timer armed
    (i.e., byte-for-byte current behavior preserved).
  - Hard ceiling fires even if the adaptive timer never does (simulate
    a hung/never-resolving `checkTurnCompleteness` call).
  - Debounce: two silence-detected events within `DEBOUNCE_MS` of each
    other only trigger one IPC call.
- If no existing test infrastructure covers this hook, ask before
  introducing a new test framework — don't add one unilaterally.
- Manually verify: kill the Python process mid-session (simulate a
  crash) and confirm the app keeps working with default-timing
  fallback rather than hanging or crashing the renderer.

---

## Step 5 — Rollout safety

- Gate the *adaptive* behavior behind a simple flag/setting (e.g., an
  env var, config flag, or app setting — match whatever feature-flag
  pattern this repo already uses, or a plain boolean constant if none
  exists) so it can be disabled instantly without a redeploy, falling
  back to the original fixed 800ms timer.
- Add logging (verdict, score, threshold chosen, whether degraded) on
  each silence-detected event, gated behind existing debug/verbose
  logging conventions in this repo, so real-world verdict quality can
  be reviewed before fully trusting it.

---

## Explicit non-goals (do not implement these as part of this task)

- Do NOT implement streaming/partial translation display — that's a
  separate, backend-touching feature not in scope here.
- Do NOT change TTS playback timing/logic — TTS continues to wait for
  the final flushed+translated text exactly as it does today.
- Do NOT modify the backend/translator API — this entire feature is
  Electron + renderer only. If at any point implementing this seems to
  require a backend change, stop and flag it rather than proceeding.

---

## Deliverable

At the end, provide a summary of:
- Every file created or modified, with a one-line description of the
  change.
- Confirmation that existing behavior is unchanged when
  `checkTurnCompleteness` returns `"uncertain"` or fails/times out.
- Any assumptions made where Step 0's audit found the codebase
  structured differently than this prompt assumed.
- Any follow-up items (e.g., "verify label order in the model's output
  matches index 1 = complete" or "confirm Python bundling strategy for
  packaged builds") that need a human decision before this ships to
  production.
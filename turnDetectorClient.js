/**
 * turnDetectorClient.js
 *
 * Electron main-process client for the long-lived turn_detector_server.py child process.
 * Spawns the Python server once on demand and keeps it warm for the app lifetime.
 * Exposes checkCompleteness(text, lang) which NEVER rejects — degrades gracefully.
 */

const { spawn } = require('child_process');
const path = require('path');
const readline = require('readline');
const crypto = require('crypto');
const logger = require('./utils/logger');

const INFERENCE_TIMEOUT_MS = 150;
const PYTHON_BIN = process.env.PYTHON_BIN || 'python';
const SERVER_SCRIPT = path.join(__dirname, 'turn_detector_server.py');

const TAG = 'TurnDetector';

let child = null;
let rl = null;
const pending = new Map();

function start() {
    if (child) return;

    logger.info(TAG, `Spawning ${SERVER_SCRIPT} via ${PYTHON_BIN}`);

    try {
        child = spawn(PYTHON_BIN, [SERVER_SCRIPT], {
            stdio: ['pipe', 'pipe', 'pipe']
        });
    } catch (err) {
        logger.error(TAG, `Failed to spawn Python process: ${err.message}`);
        child = null;
        return;
    }

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
        logger.debug(TAG, buf.toString().trim());
    });

    child.on('exit', (code) => {
        logger.warn(TAG, `Python process exited (code ${code}), will respawn on next call`);
        child = null;
        rl = null;

        for (const [, entry] of pending) {
            clearTimeout(entry.timer);
            entry.resolve({ verdict: 'uncertain', score: 0.5, ms: 0, degraded: true });
        }
        pending.clear();
    });

    child.on('error', (err) => {
        logger.error(TAG, `Python process error: ${err.message}`);
    });
}

/**
 * Check whether a partial transcript represents a complete utterance.
 * Always resolves — never rejects. Times out after INFERENCE_TIMEOUT_MS.
 * @param {string} text
 * @param {string} lang
 * @returns {Promise<{verdict: string, score: number, ms: number, degraded?: boolean}>}
 */
function checkCompleteness(text, lang = 'en') {
    return new Promise((resolve) => {
        if (!child) start();

        if (!child) {
            resolve({ verdict: 'uncertain', score: 0.5, ms: 0, degraded: true });
            return;
        }

        const id = crypto.randomUUID();

        const timer = setTimeout(() => {
            pending.delete(id);
            logger.debug(TAG, `Timeout for request ${id} after ${INFERENCE_TIMEOUT_MS}ms`);
            resolve({ verdict: 'uncertain', score: 0.5, ms: INFERENCE_TIMEOUT_MS, degraded: true });
        }, INFERENCE_TIMEOUT_MS);

        pending.set(id, { resolve, timer });

        try {
            child.stdin.write(JSON.stringify({ id, text, lang }) + '\n');
        } catch (err) {
            clearTimeout(timer);
            pending.delete(id);
            logger.warn(TAG, `stdin write failed: ${err.message}`);
            resolve({ verdict: 'uncertain', score: 0.5, ms: 0, degraded: true });
        }
    });
}

function shutdown() {
    if (child) {
        logger.info(TAG, 'Shutting down Python process');
        try { child.stdin.end(); } catch (_) {}
        try { child.kill(); } catch (_) {}
        child = null;
        rl = null;
    }
    for (const [, entry] of pending) {
        clearTimeout(entry.timer);
        entry.resolve({ verdict: 'uncertain', score: 0.5, ms: 0, degraded: true });
    }
    pending.clear();
}

module.exports = { start, checkCompleteness, shutdown };

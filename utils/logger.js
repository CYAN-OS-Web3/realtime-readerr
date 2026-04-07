/**
 * Structured Logging System
 * Provides levels (info, error, warn, debug) and context-aware logging.
 */

const isDev = process.env.NODE_ENV !== 'production';

const logger = {
  info: (tag, message, context = {}) => {
    console.log(`[INFO][${tag}] ${message}`, context);
  },
  error: (tag, message, error = {}) => {
    console.error(`[ERROR][${tag}] ${message}`, error);
    // In production, you might send this to Sentry or another service
  },
  warn: (tag, message, context = {}) => {
    console.warn(`[WARN][${tag}] ${message}`, context);
  },
  debug: (tag, message, context = {}) => {
    if (isDev) {
      console.debug(`[DEBUG][${tag}] ${message}`, context);
    }
  }
};

module.exports = logger;

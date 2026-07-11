/**
 * Structured Logging Utility for Production
 * Outputs logs as parsed JSON objects, suitable for cloud log aggregators.
 */
export const logger = {
  info(message, meta = {}) {
    console.log(
      JSON.stringify({
        level: "info",
        timestamp: new Date().toISOString(),
        message,
        ...meta,
      })
    );
  },

  warn(message, meta = {}) {
    console.warn(
      JSON.stringify({
        level: "warn",
        timestamp: new Date().toISOString(),
        message,
        ...meta,
      })
    );
  },

  error(message, error, meta = {}) {
    console.error(
      JSON.stringify({
        level: "error",
        timestamp: new Date().toISOString(),
        message,
        error: error instanceof Error ? { message: error.message, stack: error.stack } : error,
        ...meta,
      })
    );
  },
};

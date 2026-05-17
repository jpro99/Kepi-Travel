import * as Sentry from "@sentry/nextjs";

type LogLevel = "info" | "warn" | "error";
type LogMeta = Record<string, unknown>;

function serializeError(error: Error): Record<string, unknown> {
  return {
    name: error.name,
    message: error.message,
    stack: error.stack,
  };
}

function sanitizeMeta(meta: LogMeta | undefined): LogMeta {
  if (!meta) return {};
  return Object.fromEntries(
    Object.entries(meta).map(([key, value]) => {
      if (value instanceof Error) {
        return [key, serializeError(value)];
      }
      return [key, value];
    }),
  );
}

function formatDevLine(level: LogLevel, payload: LogMeta): string {
  const { timestamp, message, ...meta } = payload;
  const details = Object.keys(meta).length > 0 ? ` ${JSON.stringify(meta)}` : "";
  return `[${String(timestamp)}] ${level.toUpperCase()} ${String(message)}${details}`;
}

class StructuredLogger {
  constructor(private readonly context: LogMeta = {}) {}

  withContext(context: LogMeta): StructuredLogger {
    return new StructuredLogger({ ...this.context, ...sanitizeMeta(context) });
  }

  private write(level: LogLevel, message: string, meta?: LogMeta): void {
    const payload: LogMeta = {
      timestamp: new Date().toISOString(),
      level,
      ...this.context,
      ...sanitizeMeta(meta),
      message,
    };

    if (process.env.NODE_ENV === "production") {
      process.stdout.write(`${JSON.stringify(payload)}\n`);
      return;
    }

    const line = formatDevLine(level, payload);
    if (level === "error") {
      process.stderr.write(`${line}\n`);
    } else if (level === "warn") {
      process.stderr.write(`${line}\n`);
    } else {
      process.stdout.write(`${line}\n`);
    }
  }

  info(message: string, meta?: LogMeta): void {
    this.write("info", message, meta);
  }

  warn(message: string, meta?: LogMeta): void {
    this.write("warn", message, meta);
  }

  error(message: string, errorOrMeta?: Error | LogMeta, meta?: LogMeta): void {
    const error = errorOrMeta instanceof Error ? errorOrMeta : undefined;
    const mergedMeta: LogMeta = error
      ? { ...sanitizeMeta(meta), error: serializeError(error) }
      : sanitizeMeta((errorOrMeta as LogMeta | undefined) ?? meta);

    if (error) {
      Sentry.captureException(error, {
        extra: {
          ...this.context,
          ...mergedMeta,
          message,
        },
      });
    }

    this.write("error", message, mergedMeta);
  }
}

export const logger = new StructuredLogger();

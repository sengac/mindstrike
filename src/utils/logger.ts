type LogLevel = 'error' | 'warn' | 'info' | 'debug';

interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: string;
  meta?: Record<string, unknown>;
}

class ClientLogger {
  private level: LogLevel = 'info';
  private service = 'mindstrike-client';

  private readonly levels: Record<LogLevel, number> = {
    error: 0,
    warn: 1,
    info: 2,
    debug: 3,
  };

  constructor() {
    // In development, show all logs; in production, only warnings and errors
    this.level = process.env.NODE_ENV === 'development' ? 'debug' : 'warn';
  }

  private shouldLog(level: LogLevel): boolean {
    return this.levels[level] <= this.levels[this.level];
  }

  private formatMessage(entry: LogEntry): string {
    const { timestamp, level, message, meta } = entry;
    let formattedMessage = `${timestamp} [${level.toUpperCase()}]: ${message}`;

    if (meta && Object.keys(meta).length > 0) {
      formattedMessage += ` ${JSON.stringify(meta)}`;
    }

    return formattedMessage;
  }

  private log(
    level: LogLevel,
    message: string,
    meta?: Record<string, unknown>
  ): void {
    if (!this.shouldLog(level)) {
      return;
    }

    const entry: LogEntry = {
      level,
      message,
      timestamp: new Date().toISOString(),
      meta: { ...meta, service: this.service },
    };

    const formattedMessage = this.formatMessage(entry);

    // Use appropriate console method based on level
    switch (level) {
      case 'error':
        console.error(formattedMessage, entry.meta);
        break;
      case 'warn':
        console.warn(formattedMessage, entry.meta);
        break;
      case 'info':
        console.info(formattedMessage, entry.meta);
        break;
      case 'debug':
        console.debug(formattedMessage, entry.meta);
        break;
    }

    // In production, we could also send errors to a logging service
    if (level === 'error' && process.env.NODE_ENV === 'production') {
      // TODO: Send to error tracking service (e.g., Sentry)
    }
  }

  error(message: string, error?: Error | unknown): void {
    const meta: Record<string, unknown> = {};

    if (error instanceof Error) {
      meta.errorMessage = error.message;
      meta.errorStack = error.stack;
      meta.errorName = error.name;
    } else if (error) {
      meta.error = error;
    }

    this.log('error', message, meta);
  }

  warn(message: string, meta?: Record<string, unknown>): void {
    this.log('warn', message, meta);
  }

  info(message: string, meta?: Record<string, unknown>): void {
    this.log('info', message, meta);
  }

  debug(message: string, meta?: Record<string, unknown>): void {
    this.log('debug', message, meta);
  }

  setLevel(level: LogLevel): void {
    this.level = level;
  }
}

// Export singleton instance
export const logger = new ClientLogger();

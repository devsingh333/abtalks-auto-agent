type LogLevel = 'info' | 'warn' | 'error' | 'debug';

interface LogContext {
  cycleId?: string;
  agentId?: string;
  topicId?: string;
  postId?: string;
  sourceUrl?: string;
  [key: string]: unknown;
}

class Logger {
  private format(level: LogLevel, event: string, context?: LogContext) {
    const timestamp = new Date().toISOString();
    const payload = {
      timestamp,
      level,
      event,
      ...context,
    };
    return JSON.stringify(payload);
  }

  info(event: string, context?: LogContext) {
    console.log(this.format('info', event, context));
  }

  warn(event: string, context?: LogContext) {
    console.warn(this.format('warn', event, context));
  }

  error(event: string, context?: LogContext, err?: unknown) {
    const errDetails = err instanceof Error ? { message: err.message, stack: err.stack } : { err };
    console.error(this.format('error', event, { ...context, ...errDetails }));
  }

  debug(event: string, context?: LogContext) {
    if (process.env.NODE_ENV !== 'production') {
      console.debug(this.format('debug', event, context));
    }
  }
}

export const logger = new Logger();

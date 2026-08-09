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
  private formatConsole(level: LogLevel, event: string, context?: LogContext): string {
    const time = new Date().toLocaleTimeString();
    const tag = `[${level.toUpperCase()}]`.padEnd(7);
    
    let ctxStr = '';
    if (context && Object.keys(context).length > 0) {
      const filtered = { ...context };
      delete filtered.cycleId;
      delete filtered.agentId;
      if (Object.keys(filtered).length > 0) {
        ctxStr = ` | ${JSON.stringify(filtered)}`;
      }
    }

    return `${time} ${tag} ${event}${ctxStr}`;
  }

  info(event: string, context?: LogContext) {
    console.log(this.formatConsole('info', event, context));
  }

  warn(event: string, context?: LogContext) {
    console.warn(this.formatConsole('warn', event, context));
  }

  error(event: string, context?: LogContext, err?: unknown) {
    const errDetails = err instanceof Error ? `: ${err.message}` : '';
    console.error(this.formatConsole('error', `${event}${errDetails}`, context));
  }

  debug(event: string, context?: LogContext) {
    if (process.env.LOG_LEVEL === 'debug') {
      console.debug(this.formatConsole('debug', event, context));
    }
  }
}

export const logger = new Logger();

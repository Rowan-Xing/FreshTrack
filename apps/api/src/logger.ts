export type LogLevel = "debug" | "info" | "warn" | "error";

export type LogFields = Readonly<Record<string, boolean | number | string>>;

export interface Logger {
  log(level: LogLevel, event: string, fields: LogFields): void;
}

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40
};

export function createLogger(minimumLevel: LogLevel): Logger {
  return {
    log(level, event, fields) {
      if (LEVEL_ORDER[level] < LEVEL_ORDER[minimumLevel]) {
        return;
      }

      const record = {
        timestamp: new Date().toISOString(),
        level,
        event,
        ...fields
      };
      const output = JSON.stringify(record);
      if (level === "error") {
        console.error(output);
      } else {
        console.log(output);
      }
    }
  };
}


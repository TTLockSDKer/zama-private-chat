export enum LogLevel {
  ERROR = 0,
  WARN = 1,
  INFO = 2,
  DEBUG = 3
}

interface LoggerConfig {
  level: LogLevel;
  enabledModules: string[];
  showTimestamp: boolean;
  showModule: boolean;
  enableConsoleOutput: boolean;
}

class UnifiedLogger {
  private config: LoggerConfig = {
    level: LogLevel.ERROR,
    enabledModules: [],
    showTimestamp: true,
    showModule: true,
    enableConsoleOutput: true
  };

  private levelLabels = {
    [LogLevel.ERROR]: 'ERROR',
    [LogLevel.WARN]: 'WARN',
    [LogLevel.INFO]: 'INFO',
    [LogLevel.DEBUG]: 'DEBUG'
  };

  setLevel(level: LogLevel) {
    this.config.level = level;
  }

  enableModules(modules: string[]) {
    this.config.enabledModules = modules;
  }

  disableConsoleOutput() {
    this.config.enableConsoleOutput = false;
  }

  enableConsoleOutput() {
    this.config.enableConsoleOutput = true;
  }

  configureDisplay(options: Partial<Pick<LoggerConfig, 'showTimestamp' | 'showModule'>>) {
    this.config = { ...this.config, ...options };
  }

  private shouldLog(level: LogLevel, module?: string): boolean {
    if (!this.config.enableConsoleOutput) return false;
    
    if (level > this.config.level) return false;
    if (this.config.enabledModules.length > 0 && module) {
      return this.config.enabledModules.includes(module);
    }
    
    return true;
  }

  private formatMessage(message: string, level: LogLevel, module?: string): string {
    let formatted = message;
    
    const levelLabel = this.levelLabels[level];
    formatted = `[${levelLabel}] ${formatted}`;
    if (this.config.showTimestamp && process.env.NODE_ENV !== 'production') {
      const timestamp = new Date().toISOString().substring(11, 23);
      formatted = `[${timestamp}] ${formatted}`;
    }
    if (this.config.showModule && module) {
      formatted = `[${module}] ${formatted}`;
    }
    
    return formatted;
  }

  error(message: string, data?: unknown, module?: string) {
    if (!this.shouldLog(LogLevel.ERROR, module)) return;
    
    const formatted = this.formatMessage(message, LogLevel.ERROR, module);
    if (data !== undefined) {
      console.error(formatted, data);
    } else {
      console.error(formatted);
    }
  }

  warn(message: string, data?: unknown, module?: string) {
    if (!this.shouldLog(LogLevel.WARN, module)) return;
    
    const formatted = this.formatMessage(message, LogLevel.WARN, module);
    if (data !== undefined) {
      console.warn(formatted, data);
    } else {
      console.warn(formatted);
    }
  }

  info(message: string, data?: unknown, module?: string) {
    if (!this.shouldLog(LogLevel.INFO, module)) return;
    
    const formatted = this.formatMessage(message, LogLevel.INFO, module);
    if (data !== undefined) {
      console.log(formatted, data);
    } else {
      console.log(formatted);
    }
  }

  debug(message: string, data?: unknown, module?: string) {
    if (!this.shouldLog(LogLevel.DEBUG, module)) return;
    
    const formatted = this.formatMessage(message, LogLevel.DEBUG, module);
    if (data !== undefined) {
      console.log(formatted, data);
    } else {
      console.log(formatted);
    }
  }

  group(label: string, module?: string) {
    if (!this.shouldLog(LogLevel.INFO, module)) return;
    console.group(this.formatMessage(label, LogLevel.INFO, module));
  }

  groupEnd() {
    console.groupEnd();
  }

  getConfig(): Readonly<LoggerConfig> {
    return { ...this.config };
  }
}

export const unifiedLogger = new UnifiedLogger();

export function createModuleLogger(moduleName: string) {
  return {
    error: (message: string, data?: unknown) => unifiedLogger.error(message, data, moduleName),
    warn: (message: string, data?: unknown) => unifiedLogger.warn(message, data, moduleName),
    info: (message: string, data?: unknown) => unifiedLogger.info(message, data, moduleName),
    debug: (message: string, data?: unknown) => unifiedLogger.debug(message, data, moduleName),
    group: (label: string) => unifiedLogger.group(label, moduleName),
    groupEnd: () => unifiedLogger.groupEnd()
  };
}

export const logger = unifiedLogger;

export const log = {
  error: (message: string, data?: unknown) => unifiedLogger.error(message, data),
  warn: (message: string, data?: unknown) => unifiedLogger.warn(message, data),
  info: (message: string, data?: unknown) => unifiedLogger.info(message, data),
  debug: (message: string, data?: unknown) => unifiedLogger.debug(message, data)
};

  if (process.env.NODE_ENV === 'production') {
    unifiedLogger.setLevel(LogLevel.ERROR);
    unifiedLogger.configureDisplay({ showTimestamp: false, showModule: false });
  } else if (process.env.NODE_ENV === 'development') {
    unifiedLogger.setLevel(LogLevel.ERROR);
    unifiedLogger.configureDisplay({ showTimestamp: true, showModule: true });
  }

export const authLogger = createModuleLogger('Auth');
export const chatLogger = createModuleLogger('Chat');
export const fheLogger = createModuleLogger('FHE');
export const contractLogger = createModuleLogger('Contract');
export const messageLogger = createModuleLogger('Message');
export const sdkLogger = createModuleLogger('SDK');

export const logError = (message: string, data?: unknown) => unifiedLogger.error(message, data);
export const logWarn = (message: string, data?: unknown) => unifiedLogger.warn(message, data);
export const logInfo = (message: string, data?: unknown) => unifiedLogger.info(message, data);
export const logDebug = (message: string, data?: unknown) => unifiedLogger.debug(message, data);

export default unifiedLogger; 
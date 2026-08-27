type DevelopmentConsole = Pick<Console, 'info' | 'warn' | 'error'>;

function sanitizeDevelopmentValue(value: unknown, isLabel = false): unknown {
  if (typeof value === 'string') return isLabel ? value : '[redacted]';
  if (typeof value === 'number' || typeof value === 'boolean' || value == null) return value;
  if (value instanceof Error) return { errorName: value.name };
  if (Array.isArray(value)) return { itemCount: value.length };
  if (typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, nestedValue]) => [key, sanitizeDevelopmentValue(nestedValue)]),
    );
  }
  return '[redacted]';
}

function writeDevelopmentLog(method: keyof DevelopmentConsole, values: unknown[]): void {
  if (process.env.NODE_ENV === 'development') {
    console[method](...values.map((value, index) => sanitizeDevelopmentValue(value, index === 0)));
  }
}

export const developmentConsole: DevelopmentConsole = {
  info: (...values) => writeDevelopmentLog('info', values),
  warn: (...values) => writeDevelopmentLog('warn', values),
  error: (...values) => writeDevelopmentLog('error', values),
};

// Telemetry is disabled in the embedded build (no backend). Kept as no-ops so callers need no changes.
export const reportDecodeError = (_err: unknown, _transferSyntax?: string) => {};
export const reportTiming = (_name: string, _ms: number) => {};
export const startTelemetry = () => {};

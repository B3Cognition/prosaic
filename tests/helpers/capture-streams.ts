/**
 * Invoke a callback while capturing everything written to process.stdout and
 * process.stderr as two separate strings (T-001). Used to exercise the in-process
 * formatters / CLI handlers and assert per-stream content without spawning a
 * binary. `process.stdout.write` / `process.stderr.write` are the single
 * choke-points every command handler writes through.
 */
export interface StreamCapture {
  stdout: string;
  stderr: string;
}

export function captureStreams(run: () => void | Promise<void>): StreamCapture {
  const origOut = process.stdout.write.bind(process.stdout);
  const origErr = process.stderr.write.bind(process.stderr);
  let stdout = '';
  let stderr = '';
  (process.stdout.write as unknown) = (chunk: unknown): boolean => {
    stdout += String(chunk);
    return true;
  };
  (process.stderr.write as unknown) = (chunk: unknown): boolean => {
    stderr += String(chunk);
    return true;
  };
  try {
    const maybe = run();
    if (maybe && typeof (maybe as Promise<void>).then === 'function') {
      throw new Error('captureStreams: pass a synchronous callback');
    }
  } finally {
    process.stdout.write = origOut;
    process.stderr.write = origErr;
  }
  return { stdout, stderr };
}

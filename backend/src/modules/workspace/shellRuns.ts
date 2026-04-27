import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { existsSync } from "node:fs";
import { backendConfig, getChildProcessEnv } from "../../shared/config/config.js";

export type ShellRunEvent =
  | { event: "stdout"; data: { text: string } }
  | { event: "stderr"; data: { text: string } }
  | { event: "error"; data: { message: string } }
  | {
      event: "exit";
      data: {
        exitCode: number | null;
        signal: string | null;
        stdout: string;
        stderr: string;
      };
    };

type ShellRunEnvelope = ShellRunEvent & { seq: number; runId: string };

type ShellRunRecord = {
  runId: string;
  process: ChildProcessWithoutNullStreams | null;
  stdout: string;
  stderr: string;
  events: ShellRunEnvelope[];
  listeners: Set<(event: ShellRunEnvelope) => void>;
  nextSeq: number;
  finished: boolean;
  timeout: NodeJS.Timeout | null;
  cleanupTimer: NodeJS.Timeout | null;
};

const runs = new Map<string, ShellRunRecord>();
const RUN_RETENTION_MS = 5 * 60 * 1000;

const resolveShellBinary = (): string => {
  const candidates = [
    backendConfig.runtime.shell,
    "/bin/zsh",
    "/bin/bash",
    "/bin/sh",
  ].filter((value): value is string => Boolean(value && value.length > 0));

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  return "/bin/sh";
};

const emitEvent = (run: ShellRunRecord, event: ShellRunEvent): void => {
  const envelope: ShellRunEnvelope = {
    ...event,
    seq: run.nextSeq++,
    runId: run.runId,
  };
  run.events.push(envelope);
  for (const listener of run.listeners) {
    listener(envelope);
  }
};

const scheduleCleanup = (run: ShellRunRecord) => {
  if (run.cleanupTimer) {
    clearTimeout(run.cleanupTimer);
  }
  run.cleanupTimer = setTimeout(() => {
    runs.delete(run.runId);
  }, RUN_RETENTION_MS);
  run.cleanupTimer.unref();
};

export const startShellRun = (options: {
  command: string;
  cwd: string;
  env?: Record<string, string>;
  timeoutMs?: number;
}): string => {
  const runId = crypto.randomUUID();
  const run: ShellRunRecord = {
    runId,
    process: null,
    stdout: "",
    stderr: "",
    events: [],
    listeners: new Set(),
    nextSeq: 1,
    finished: false,
    timeout: null,
    cleanupTimer: null,
  };
  runs.set(runId, run);

  const shellBinary = resolveShellBinary();
  const child = spawn(shellBinary, ["-lc", options.command], {
    cwd: options.cwd,
    env: getChildProcessEnv(options.env),
  });
  run.process = child;

  if (typeof options.timeoutMs === "number" && options.timeoutMs > 0) {
    run.timeout = setTimeout(() => {
      child.kill("SIGTERM");
    }, options.timeoutMs);
    run.timeout.unref();
  }

  child.stdout.on("data", (chunk: Buffer | string) => {
    const text = chunk.toString();
    run.stdout += text;
    emitEvent(run, { event: "stdout", data: { text } });
  });

  child.stderr.on("data", (chunk: Buffer | string) => {
    const text = chunk.toString();
    run.stderr += text;
    emitEvent(run, { event: "stderr", data: { text } });
  });

  child.on("error", (error) => {
    emitEvent(run, { event: "error", data: { message: error.message } });
  });

  child.on("close", (code, signal) => {
    run.finished = true;
    if (run.timeout) {
      clearTimeout(run.timeout);
      run.timeout = null;
    }
    emitEvent(run, {
      event: "exit",
      data: {
        exitCode: code,
        signal,
        stdout: run.stdout,
        stderr: run.stderr,
      },
    });
    scheduleCleanup(run);
  });

  return runId;
};

export const subscribeToShellRun = (
  runId: string,
  afterSeq: number,
  listener: (event: ShellRunEnvelope) => void,
): {
  events: ShellRunEnvelope[];
  unsubscribe: () => void;
} | null => {
  const run = runs.get(runId);
  if (!run) {
    return null;
  }

  run.listeners.add(listener);
  return {
    events: run.events.filter((event) => event.seq > afterSeq),
    unsubscribe: () => {
      run.listeners.delete(listener);
    },
  };
};

export const getShellRunSnapshot = (
  runId: string,
): { finished: boolean; stdout: string; stderr: string; nextSeq: number } | null => {
  const run = runs.get(runId);
  if (!run) {
    return null;
  }

  return {
    finished: run.finished,
    stdout: run.stdout,
    stderr: run.stderr,
    nextSeq: run.nextSeq,
  };
};

export const stopShellRun = (runId: string): boolean => {
  const run = runs.get(runId);
  if (!run?.process || run.finished) {
    return false;
  }

  run.process.kill("SIGTERM");
  return true;
};

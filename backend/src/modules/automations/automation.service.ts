import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import type { PiSdkChatService, SseEvent } from "../chat/chat.service.js";
import { WORKSPACE_ROOT } from "../../shared/config/paths.js";
import { captureBackendException } from "../../shared/observability/sentry.js";
import { sendWhatsAppAutomationMessage } from "../whatsapp/whatsapp.routes.js";
import { getNextRunAt } from "./automation.schedule.js";
import type {
  AutomationJob,
  AutomationRunRecord,
  AutomationRunStoreFile,
  AutomationSchedule,
  AutomationStoreFile,
} from "./automation.types.js";

const AUTOMATION_DIR = resolve(WORKSPACE_ROOT, ".lilo");
const AUTOMATION_STORE_PATH = resolve(AUTOMATION_DIR, "automations.json");
const AUTOMATION_RUN_STORE_PATH = resolve(AUTOMATION_DIR, "automation-runs.json");
const POLL_INTERVAL_MS = 30_000;
const MAX_RUN_HISTORY = 100;

interface AutomationMutationInput {
  name?: string;
  enabled?: boolean;
  prompt?: string;
  schedule?: AutomationSchedule;
}

const ensureAutomationDir = async (): Promise<void> => {
  await mkdir(dirname(AUTOMATION_STORE_PATH), { recursive: true });
};

const writeJsonFileAtomically = async (path: string, value: unknown): Promise<void> => {
  await ensureAutomationDir();
  const tempPath = `${path}.${process.pid}.${Date.now()}.${randomUUID()}.tmp`;
  await writeFile(tempPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(tempPath, path);
};

const findFirstJsonDocumentEnd = (raw: string): number | null => {
  const start = raw.search(/\S/);
  if (start === -1) {
    return null;
  }

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = start; index < raw.length; index += 1) {
    const char = raw[index];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === "\"") {
        inString = false;
      }
      continue;
    }

    if (char === "\"") {
      inString = true;
    } else if (char === "{" || char === "[") {
      depth += 1;
    } else if (char === "}" || char === "]") {
      depth -= 1;
      if (depth === 0) {
        return index + 1;
      }
    }
  }

  return null;
};

const parseFirstJsonDocument = (raw: string): unknown | null => {
  const end = findFirstJsonDocumentEnd(raw);
  if (end === null) {
    return null;
  }

  try {
    return JSON.parse(raw.slice(0, end));
  } catch {
    return null;
  }
};

const normalizeString = (value: unknown): string =>
  typeof value === "string" ? value.trim() : "";

const normalizeSchedule = (value: unknown): AutomationSchedule | null => {
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as Record<string, unknown>;
  if (record.type === "at") {
    const at = normalizeString(record.at);
    if (!at || Number.isNaN(new Date(at).getTime())) {
      return null;
    }
    return { type: "at", at };
  }

  if (record.type === "cron") {
    const expression = normalizeString(record.expression);
    if (!expression) {
      return null;
    }
    const timezone = normalizeString(record.timezone);
    return {
      type: "cron",
      expression,
      ...(timezone ? { timezone } : {}),
    };
  }

  return null;
};

const normalizeJob = (value: unknown): AutomationJob | null => {
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as Record<string, unknown>;
  const id = normalizeString(record.id);
  const name = normalizeString(record.name);
  const prompt = normalizeString(record.prompt);
  const schedule = normalizeSchedule(record.schedule);
  if (!id || !name || !prompt || !schedule) {
    return null;
  }

  const now = new Date().toISOString();
  return {
    id,
    name,
    prompt,
    schedule,
    enabled: record.enabled !== false,
    createdAt: normalizeString(record.createdAt) || now,
    updatedAt: normalizeString(record.updatedAt) || now,
    ...(normalizeString(record.lastRunAt) ? { lastRunAt: normalizeString(record.lastRunAt) } : {}),
    ...(normalizeString(record.nextRunAt) ? { nextRunAt: normalizeString(record.nextRunAt) } : {}),
    ...(record.lastStatus === "success" || record.lastStatus === "error" || record.lastStatus === "running"
      ? { lastStatus: record.lastStatus }
      : {}),
    ...(normalizeString(record.lastError) ? { lastError: normalizeString(record.lastError) } : {}),
    ...(normalizeString(record.lastChatId) ? { lastChatId: normalizeString(record.lastChatId) } : {}),
  };
};

const normalizeRun = (value: unknown): AutomationRunRecord | null => {
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as Record<string, unknown>;
  const id = normalizeString(record.id);
  const automationId = normalizeString(record.automationId);
  const automationName = normalizeString(record.automationName);
  const chatId = normalizeString(record.chatId);
  const startedAt = normalizeString(record.startedAt);
  if (!id || !automationId || !automationName || !chatId || !startedAt) {
    return null;
  }

  return {
    id,
    automationId,
    automationName,
    chatId,
    startedAt,
    status:
      record.status === "success" || record.status === "error" || record.status === "running"
        ? record.status
        : "error",
    ...(normalizeString(record.finishedAt) ? { finishedAt: normalizeString(record.finishedAt) } : {}),
    ...(normalizeString(record.error) ? { error: normalizeString(record.error) } : {}),
  };
};

const normalizeStore = (parsed: Partial<AutomationStoreFile>): AutomationStoreFile => ({
  version: 1,
  jobs: Array.isArray(parsed.jobs)
    ? parsed.jobs.map(normalizeJob).filter((job): job is AutomationJob => Boolean(job))
    : [],
});

const normalizeRunStore = (parsed: Partial<AutomationRunStoreFile>): AutomationRunStoreFile => ({
  version: 1,
  runs: Array.isArray(parsed.runs)
    ? parsed.runs.map(normalizeRun).filter((run): run is AutomationRunRecord => Boolean(run))
    : [],
});

const backupCorruptJsonFile = async (path: string, raw: string): Promise<string> => {
  await ensureAutomationDir();
  const backupPath = `${path}.corrupt-${new Date().toISOString().replace(/[:.]/g, "-")}`;
  await writeFile(backupPath, raw, "utf8");
  return backupPath;
};

export class AutomationService {
  private timer: ReturnType<typeof setInterval> | null = null;
  private runningJobIds = new Set<string>();
  private storeQueue: Promise<void> = Promise.resolve();
  private runStoreQueue: Promise<void> = Promise.resolve();

  constructor(private readonly chatService: PiSdkChatService) {}

  private async withStoreLock<T>(callback: () => Promise<T>): Promise<T> {
    const previous = this.storeQueue;
    let release: () => void = () => {};
    const next = new Promise<void>((resolve) => {
      release = resolve;
    });
    this.storeQueue = previous.catch(() => undefined).then(() => next);

    await previous.catch(() => undefined);
    try {
      return await callback();
    } finally {
      release();
    }
  }

  private async withRunStoreLock<T>(callback: () => Promise<T>): Promise<T> {
    const previous = this.runStoreQueue;
    let release: () => void = () => {};
    const next = new Promise<void>((resolve) => {
      release = resolve;
    });
    this.runStoreQueue = previous.catch(() => undefined).then(() => next);

    await previous.catch(() => undefined);
    try {
      return await callback();
    } finally {
      release();
    }
  }

  start(): void {
    if (this.timer) {
      return;
    }

    void this.tick();
    this.timer = setInterval(() => {
      void this.tick();
    }, POLL_INTERVAL_MS);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async listJobs(): Promise<AutomationJob[]> {
    return this.withStoreLock(async () => (await this.readStore()).jobs);
  }

  async listRuns(): Promise<AutomationRunRecord[]> {
    return this.withRunStoreLock(async () => (await this.readRunStore()).runs);
  }

  async createJob(input: AutomationMutationInput): Promise<AutomationJob> {
    const name = normalizeString(input.name);
    const prompt = normalizeString(input.prompt);
    const schedule = normalizeSchedule(input.schedule);
    if (!name || !prompt || !schedule) {
      throw new Error("Automation name, prompt, and schedule are required");
    }

    const now = new Date().toISOString();
    const job: AutomationJob = {
      id: randomUUID(),
      name,
      prompt,
      schedule,
      enabled: input.enabled ?? true,
      createdAt: now,
      updatedAt: now,
      nextRunAt: getNextRunAt(schedule) ?? undefined,
    };

    await this.withStoreLock(async () => {
      const store = await this.readStore();
      store.jobs.push(job);
      await this.writeStore(store);
    });
    return job;
  }

  async updateJob(id: string, input: AutomationMutationInput): Promise<AutomationJob> {
    return this.withStoreLock(async () => {
      const store = await this.readStore();
      const index = store.jobs.findIndex((job) => job.id === id);
      if (index === -1) {
        throw new Error(`Automation "${id}" was not found`);
      }

      const current = store.jobs[index]!;
      const schedule =
        input.schedule === undefined ? current.schedule : normalizeSchedule(input.schedule);
      if (!schedule) {
        throw new Error("Invalid automation schedule");
      }

      const updated: AutomationJob = {
        ...current,
        ...(input.name !== undefined ? { name: normalizeString(input.name) } : {}),
        ...(input.prompt !== undefined ? { prompt: normalizeString(input.prompt) } : {}),
        ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
        schedule,
        updatedAt: new Date().toISOString(),
        nextRunAt: getNextRunAt(schedule) ?? undefined,
      };
      if (!updated.name || !updated.prompt) {
        throw new Error("Automation name and prompt cannot be empty");
      }

      store.jobs[index] = updated;
      await this.writeStore(store);
      return updated;
    });
  }

  async deleteJob(id: string): Promise<void> {
    await this.withStoreLock(async () => {
      const store = await this.readStore();
      const nextJobs = store.jobs.filter((job) => job.id !== id);
      if (nextJobs.length === store.jobs.length) {
        throw new Error(`Automation "${id}" was not found`);
      }

      await this.writeStore({ ...store, jobs: nextJobs });
    });
  }

  async runJobNow(id: string): Promise<AutomationRunRecord> {
    const job = (await this.listJobs()).find((entry) => entry.id === id);
    if (!job) {
      throw new Error(`Automation "${id}" was not found`);
    }

    return this.runJob(job, "manual");
  }

  private async tick(): Promise<void> {
    const now = new Date();
    for (const job of await this.listJobs()) {
      if (!job.enabled || !job.nextRunAt || this.runningJobIds.has(job.id)) {
        continue;
      }

      if (new Date(job.nextRunAt) <= now) {
        void this.runJob(job, "scheduled").catch((error) => {
          console.error(
            `[automations] scheduled run failed id=${job.id} error=${
              error instanceof Error ? error.message : String(error)
            }`,
          );
        });
      }
    }
  }

  private async runJob(
    job: AutomationJob,
    trigger: "scheduled" | "manual",
  ): Promise<AutomationRunRecord> {
    if (this.runningJobIds.has(job.id)) {
      throw new Error(`Automation "${job.name}" is already running`);
    }

    this.runningJobIds.add(job.id);
    const startedAt = new Date().toISOString();
    let chatId = "";
    let runRecord: AutomationRunRecord | null = null;
    try {
      const chat = await this.chatService.createChat();
      chatId = chat.id;
      runRecord = {
        id: randomUUID(),
        automationId: job.id,
        automationName: job.name,
        chatId,
        startedAt,
        status: "running",
      };
      await this.appendRun(runRecord);
      await this.patchJobAfterRunStart(job.id, chatId);

      let finalText = "";
      await this.chatService.promptChat(chatId, {
        message: [
          `Run automation "${job.name}".`,
          `Trigger: ${trigger}.`,
          "",
          job.prompt,
          "",
          "Return the final result as a concise plain-text message suitable for WhatsApp.",
        ].join("\n"),
        images: [],
        attachments: [],
        context: {},
      }, (event) => {
        finalText += this.extractAssistantText(event);
      });

      const message = finalText.trim() || `Automation "${job.name}" completed.`;
      await sendWhatsAppAutomationMessage(message);

      const finished: AutomationRunRecord = {
        ...runRecord,
        finishedAt: new Date().toISOString(),
        status: "success",
      };
      await this.updateRun(finished);
      await this.patchJobAfterRunFinish(job.id, "success");
      return finished;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      captureBackendException(error, {
        tags: {
          area: "automations",
          automation_id: job.id,
          trigger,
        },
        extras: {
          automationName: job.name,
          chatId,
        },
      });
      const failed: AutomationRunRecord = {
        ...(runRecord ?? {
          id: randomUUID(),
          automationId: job.id,
          automationName: job.name,
          chatId: chatId || "unknown",
          startedAt,
        }),
        finishedAt: new Date().toISOString(),
        status: "error",
        error: message,
      };
      await this.updateRun(failed);
      await this.patchJobAfterRunFinish(job.id, "error", message);
      throw error;
    } finally {
      this.runningJobIds.delete(job.id);
    }
  }

  private extractAssistantText(event: SseEvent): string {
    if (event.event !== "text_delta") {
      return "";
    }

    const delta = event.data.delta;
    return typeof delta === "string" ? delta : "";
  }

  private async patchJobAfterRunStart(id: string, chatId: string): Promise<void> {
    await this.withStoreLock(async () => {
      const store = await this.readStore();
      const job = store.jobs.find((entry) => entry.id === id);
      if (!job) return;
      job.lastRunAt = new Date().toISOString();
      job.lastStatus = "running";
      job.lastError = undefined;
      job.lastChatId = chatId;
      job.nextRunAt = getNextRunAt(job.schedule) ?? undefined;
      job.updatedAt = new Date().toISOString();
      await this.writeStore(store);
    });
  }

  private async patchJobAfterRunFinish(
    id: string,
    status: "success" | "error",
    error?: string,
  ): Promise<void> {
    await this.withStoreLock(async () => {
      const store = await this.readStore();
      const job = store.jobs.find((entry) => entry.id === id);
      if (!job) return;
      job.lastStatus = status;
      job.lastError = error;
      job.nextRunAt = getNextRunAt(job.schedule) ?? undefined;
      job.updatedAt = new Date().toISOString();
      await this.writeStore(store);
    });
  }

  private async appendRun(run: AutomationRunRecord): Promise<void> {
    await this.withRunStoreLock(async () => {
      const store = await this.readRunStore();
      store.runs.unshift(run);
      store.runs = store.runs.slice(0, MAX_RUN_HISTORY);
      await this.writeRunStore(store);
    });
  }

  private async updateRun(run: AutomationRunRecord): Promise<void> {
    await this.withRunStoreLock(async () => {
      const store = await this.readRunStore();
      const index = store.runs.findIndex((entry) => entry.id === run.id);
      if (index === -1) {
        store.runs.unshift(run);
      } else {
        store.runs[index] = run;
      }
      store.runs = store.runs.slice(0, MAX_RUN_HISTORY);
      await this.writeRunStore(store);
    });
  }

  private async readStore(): Promise<AutomationStoreFile> {
    try {
      const raw = await readFile(AUTOMATION_STORE_PATH, "utf8");
      const parsed = JSON.parse(raw) as Partial<AutomationStoreFile>;
      return normalizeStore(parsed);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return { version: 1, jobs: [] };
      }
      throw error;
    }
  }

  private async writeStore(store: AutomationStoreFile): Promise<void> {
    await writeJsonFileAtomically(AUTOMATION_STORE_PATH, store);
  }

  private async readRunStore(): Promise<AutomationRunStoreFile> {
    let raw = "";
    try {
      raw = await readFile(AUTOMATION_RUN_STORE_PATH, "utf8");
      const parsed = JSON.parse(raw) as Partial<AutomationRunStoreFile>;
      return normalizeRunStore(parsed);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return { version: 1, runs: [] };
      }

      if (error instanceof SyntaxError) {
        const recovered = parseFirstJsonDocument(raw);
        if (recovered && typeof recovered === "object") {
          const store = normalizeRunStore(recovered as Partial<AutomationRunStoreFile>);
          captureBackendException(error, {
            tags: {
              area: "automations",
              operation: "recover_run_store",
            },
            extras: {
              path: AUTOMATION_RUN_STORE_PATH,
              rawLength: raw.length,
              recoveredRuns: store.runs.length,
            },
            level: "warning",
            fingerprint: ["automations", "run_store", "recovered_json"],
          });
          await this.writeRunStore(store);
          return store;
        }

        const backupPath = await backupCorruptJsonFile(AUTOMATION_RUN_STORE_PATH, raw);
        const emptyStore: AutomationRunStoreFile = { version: 1, runs: [] };
        captureBackendException(error, {
          tags: {
            area: "automations",
            operation: "reset_corrupt_run_store",
          },
          extras: {
            path: AUTOMATION_RUN_STORE_PATH,
            backupPath,
            rawLength: raw.length,
          },
          level: "error",
          fingerprint: ["automations", "run_store", "reset_corrupt_json"],
        });
        await this.writeRunStore(emptyStore);
        return emptyStore;
      }

      throw error;
    }
  }

  private async writeRunStore(store: AutomationRunStoreFile): Promise<void> {
    await writeJsonFileAtomically(AUTOMATION_RUN_STORE_PATH, store);
  }
}

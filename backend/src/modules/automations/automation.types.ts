export type AutomationSchedule =
  | {
      type: "cron";
      expression: string;
      timezone?: string;
    }
  | {
      type: "at";
      at: string;
    };

export interface AutomationJob {
  id: string;
  name: string;
  enabled: boolean;
  prompt: string;
  schedule: AutomationSchedule;
  createdAt: string;
  updatedAt: string;
  lastRunAt?: string;
  nextRunAt?: string;
  lastStatus?: "success" | "error" | "running";
  lastError?: string;
  lastChatId?: string;
}

export interface AutomationRunRecord {
  id: string;
  automationId: string;
  automationName: string;
  chatId: string;
  startedAt: string;
  finishedAt?: string;
  status: "running" | "success" | "error";
  error?: string;
}

export interface AutomationStoreFile {
  version: 1;
  jobs: AutomationJob[];
}

export interface AutomationRunStoreFile {
  version: 1;
  runs: AutomationRunRecord[];
}

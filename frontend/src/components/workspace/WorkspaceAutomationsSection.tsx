import { useEffect, useState } from "react";
import { config } from "../../config/config";
import { authFetch } from "../../lib/auth";

type AutomationSchedule =
  | { type: "cron"; expression: string; timezone?: string }
  | { type: "at"; at: string };

interface AutomationJob {
  id: string;
  name: string;
  enabled: boolean;
  prompt: string;
  schedule: AutomationSchedule;
  lastRunAt?: string;
  nextRunAt?: string;
  lastStatus?: "success" | "error" | "running";
  lastError?: string;
}

interface AutomationRun {
  id: string;
  automationId: string;
  automationName: string;
  startedAt: string;
  finishedAt?: string;
  status: "running" | "success" | "error";
  error?: string;
}

interface AutomationsResponse {
  jobs: AutomationJob[];
  runs: AutomationRun[];
}

interface WorkspaceAutomationsSectionProps {
  isOpen: boolean;
}

const formatSchedule = (schedule: AutomationSchedule): string => {
  if (schedule.type === "at") {
    return `At ${schedule.at}`;
  }

  return `Cron ${schedule.expression}${schedule.timezone ? ` · ${schedule.timezone}` : ""}`;
};

const formatDate = (value?: string): string => {
  if (!value) return "Not scheduled";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
};

const statusClassName = (status?: AutomationJob["lastStatus"]): string => {
  if (status === "success") return "bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-900";
  if (status === "error") return "bg-red-50 text-red-700 ring-red-200 dark:bg-red-950/40 dark:text-red-300 dark:ring-red-900";
  if (status === "running") return "bg-blue-50 text-blue-700 ring-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:ring-blue-900";
  return "bg-neutral-100 text-neutral-500 ring-neutral-200 dark:bg-neutral-800 dark:text-neutral-400 dark:ring-neutral-700";
};

export function WorkspaceAutomationsSection({
  isOpen,
}: WorkspaceAutomationsSectionProps) {
  const [jobs, setJobs] = useState<AutomationJob[]>([]);
  const [runs, setRuns] = useState<AutomationRun[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isMutatingId, setIsMutatingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadAutomations = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await authFetch(`${config.apiBaseUrl}/api/automations`);
      if (!response.ok) {
        throw new Error(`Failed to load automations (${response.status})`);
      }
      const body = (await response.json()) as AutomationsResponse;
      setJobs(body.jobs ?? []);
      setRuns(body.runs ?? []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load automations");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (!isOpen) return;
    void loadAutomations();
  }, [isOpen]);

  const patchAutomation = async (id: string, body: Record<string, unknown>) => {
    setIsMutatingId(id);
    setError(null);
    try {
      const response = await authFetch(`${config.apiBaseUrl}/api/automations/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error ?? `Failed to update automation (${response.status})`);
      }
      await loadAutomations();
    } catch (mutationError) {
      setError(mutationError instanceof Error ? mutationError.message : "Failed to update automation");
    } finally {
      setIsMutatingId(null);
    }
  };

  const runAutomation = async (id: string) => {
    setIsMutatingId(id);
    setError(null);
    try {
      const response = await authFetch(`${config.apiBaseUrl}/api/automations/${id}/run`, {
        method: "POST",
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error ?? `Failed to run automation (${response.status})`);
      }
      await loadAutomations();
    } catch (mutationError) {
      setError(mutationError instanceof Error ? mutationError.message : "Failed to run automation");
    } finally {
      setIsMutatingId(null);
    }
  };

  const deleteAutomation = async (id: string) => {
    setIsMutatingId(id);
    setError(null);
    try {
      const response = await authFetch(`${config.apiBaseUrl}/api/automations/${id}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error ?? `Failed to delete automation (${response.status})`);
      }
      await loadAutomations();
    } catch (mutationError) {
      setError(mutationError instanceof Error ? mutationError.message : "Failed to delete automation");
    } finally {
      setIsMutatingId(null);
    }
  };

  return (
    <section className="border-b border-neutral-200 px-4 py-4 dark:border-neutral-700">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400 dark:text-neutral-500">
            Automations
          </p>
          <p className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">
            Agent-created prompts that run on a schedule and send results to WhatsApp.
          </p>
        </div>
        <button
          type="button"
          className="rounded-lg border border-neutral-200 px-2 py-1 text-xs font-medium text-neutral-500 transition hover:bg-neutral-50 hover:text-neutral-900 disabled:opacity-50 dark:border-neutral-700 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-100"
          onClick={() => void loadAutomations()}
          disabled={isLoading}
        >
          Refresh
        </button>
      </div>

      {error ? (
        <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">
          {error}
        </div>
      ) : null}

      {isLoading && jobs.length === 0 ? (
        <p className="rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-3 text-center text-xs text-neutral-400 dark:border-neutral-700 dark:bg-neutral-800">
          Loading automations...
        </p>
      ) : jobs.length === 0 ? (
        <div className="rounded-lg border border-dashed border-neutral-300 px-3 py-3 text-xs text-neutral-500 dark:border-neutral-700 dark:text-neutral-400">
          No automations yet. Ask Lilo to create one, like: “Remind me every weekday at 8am to summarize my open todos.”
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {jobs.map((job) => (
            <article
              key={job.id}
              className="rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-3 dark:border-neutral-700 dark:bg-neutral-800/70"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <h3 className="truncate text-sm font-semibold text-neutral-900 dark:text-neutral-100">
                      {job.name}
                    </h3>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ${statusClassName(job.lastStatus)}`}>
                      {job.lastStatus ?? "idle"}
                    </span>
                    {!job.enabled ? (
                      <span className="rounded-full bg-neutral-200 px-2 py-0.5 text-[10px] font-semibold text-neutral-500 dark:bg-neutral-700 dark:text-neutral-300">
                        disabled
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-1 text-[11px] text-neutral-500 dark:text-neutral-400">
                    {formatSchedule(job.schedule)}
                  </p>
                </div>
              </div>
              <p className="mt-2 line-clamp-2 text-xs text-neutral-600 dark:text-neutral-300">
                {job.prompt}
              </p>
              <div className="mt-2 grid grid-cols-2 gap-2 text-[11px] text-neutral-500 dark:text-neutral-400">
                <span>Next: {formatDate(job.nextRunAt)}</span>
                <span>Last: {formatDate(job.lastRunAt)}</span>
              </div>
              {job.lastError ? (
                <p className="mt-2 rounded-lg bg-red-50 px-2 py-1.5 text-[11px] text-red-700 dark:bg-red-950/30 dark:text-red-300">
                  {job.lastError}
                </p>
              ) : null}
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  className="rounded-lg border border-neutral-200 bg-white px-2.5 py-1.5 text-xs font-medium text-neutral-700 transition hover:bg-neutral-100 disabled:opacity-50 dark:border-neutral-600 dark:bg-neutral-900 dark:text-neutral-200 dark:hover:bg-neutral-800"
                  disabled={isMutatingId === job.id}
                  onClick={() => void patchAutomation(job.id, { enabled: !job.enabled })}
                >
                  {job.enabled ? "Disable" : "Enable"}
                </button>
                <button
                  type="button"
                  className="rounded-lg border border-neutral-200 bg-white px-2.5 py-1.5 text-xs font-medium text-neutral-700 transition hover:bg-neutral-100 disabled:opacity-50 dark:border-neutral-600 dark:bg-neutral-900 dark:text-neutral-200 dark:hover:bg-neutral-800"
                  disabled={isMutatingId === job.id}
                  onClick={() => void runAutomation(job.id)}
                >
                  Run now
                </button>
                <button
                  type="button"
                  className="rounded-lg border border-red-200 bg-white px-2.5 py-1.5 text-xs font-medium text-red-600 transition hover:bg-red-50 disabled:opacity-50 dark:border-red-900 dark:bg-neutral-900 dark:text-red-300 dark:hover:bg-red-950/30"
                  disabled={isMutatingId === job.id}
                  onClick={() => void deleteAutomation(job.id)}
                >
                  Delete
                </button>
              </div>
            </article>
          ))}
        </div>
      )}

      {runs.length > 0 ? (
        <p className="mt-3 text-[11px] text-neutral-400 dark:text-neutral-500">
          Latest run: {runs[0]?.automationName} · {runs[0]?.status} · {formatDate(runs[0]?.startedAt)}
        </p>
      ) : null}
    </section>
  );
}

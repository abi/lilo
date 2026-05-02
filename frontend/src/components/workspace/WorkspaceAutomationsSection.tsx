import { useEffect, useMemo, useState } from "react";
import { config } from "../../config/config";
import { authFetch } from "../../lib/auth";
import type { AutomationOutputChannel } from "./types";

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
  className?: string;
  showHeader?: boolean;
  automationOutputChannel: AutomationOutputChannel;
  onAutomationOutputChannelChange: (channel: AutomationOutputChannel) => Promise<void> | void;
}

type AutomationTab = "active" | "inactive" | "errored";

interface ChannelStatus {
  id: AutomationOutputChannel;
  label: string;
  configured: boolean;
}

interface ChannelStatusResponse {
  channels: ChannelStatus[];
}

const AUTOMATION_CHANNEL_LABELS: Record<AutomationOutputChannel, string> = {
  email: "Email",
  telegram: "Telegram",
  whatsapp: "WhatsApp",
};

const WEEKDAY_LABELS: Record<string, string> = {
  "0": "Sunday",
  "1": "Monday",
  "2": "Tuesday",
  "3": "Wednesday",
  "4": "Thursday",
  "5": "Friday",
  "6": "Saturday",
  "7": "Sunday",
};

const formatTimeParts = (hour: string, minute: string): string | null => {
  const parsedHour = Number(hour);
  const parsedMinute = Number(minute);
  if (
    !Number.isInteger(parsedHour) ||
    !Number.isInteger(parsedMinute) ||
    parsedHour < 0 ||
    parsedHour > 23 ||
    parsedMinute < 0 ||
    parsedMinute > 59
  ) {
    return null;
  }

  const date = new Date(2000, 0, 1, parsedHour, parsedMinute);
  return date.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
};

const formatCronDays = (dayOfWeek: string): string | null => {
  if (dayOfWeek === "*") return "Every day";
  if (dayOfWeek === "1-5") return "Every weekday";
  if (dayOfWeek === "0,6" || dayOfWeek === "6,0") return "Every weekend";

  const days = dayOfWeek.split(",");
  if (days.every((day) => WEEKDAY_LABELS[day])) {
    return `Every ${days.map((day) => WEEKDAY_LABELS[day]).join(", ")}`;
  }

  return null;
};

const formatCronSchedule = (expression: string, timezone?: string): string => {
  const parts = expression.trim().split(/\s+/);
  if (parts.length !== 5) {
    return `Custom schedule: ${expression}${timezone ? ` (${timezone})` : ""}`;
  }

  const [minute, hour, dayOfMonth, month, dayOfWeek] = parts;
  const timezoneSuffix = timezone ? ` (${timezone})` : "";

  if (minute === "*" && hour === "*" && dayOfMonth === "*" && month === "*" && dayOfWeek === "*") {
    return `Every minute${timezoneSuffix}`;
  }

  if (minute.startsWith("*/") && hour === "*" && dayOfMonth === "*" && month === "*" && dayOfWeek === "*") {
    return `Every ${minute.slice(2)} minutes${timezoneSuffix}`;
  }

  const time = formatTimeParts(hour, minute);
  if (!time) {
    return `Custom schedule: ${expression}${timezoneSuffix}`;
  }

  if (dayOfMonth === "*" && month === "*") {
    const days = formatCronDays(dayOfWeek);
    if (days) {
      return `${days} at ${time}${timezoneSuffix}`;
    }
  }

  if (dayOfWeek === "*" && month === "*" && /^\d+$/.test(dayOfMonth)) {
    return `Every month on day ${dayOfMonth} at ${time}${timezoneSuffix}`;
  }

  return `Custom schedule: ${expression}${timezoneSuffix}`;
};

const formatSchedule = (schedule: AutomationSchedule): string => {
  if (schedule.type === "at") {
    return formatDate(schedule.at);
  }

  return formatCronSchedule(schedule.expression, schedule.timezone);
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
  className = "",
  showHeader = true,
  automationOutputChannel,
  onAutomationOutputChannelChange,
}: WorkspaceAutomationsSectionProps) {
  const [jobs, setJobs] = useState<AutomationJob[]>([]);
  const [runs, setRuns] = useState<AutomationRun[]>([]);
  const [selectedTab, setSelectedTab] = useState<AutomationTab>("active");
  const [channels, setChannels] = useState<ChannelStatus[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingChannels, setIsLoadingChannels] = useState(false);
  const [isSavingChannel, setIsSavingChannel] = useState(false);
  const [isMutatingId, setIsMutatingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [channelError, setChannelError] = useState<string | null>(null);

  const { activeJobs, inactiveJobs, erroredJobs } = useMemo(
    () => ({
      activeJobs: jobs.filter((job) => job.lastStatus !== "error" && Boolean(job.nextRunAt)),
      inactiveJobs: jobs.filter((job) => job.lastStatus !== "error" && !job.nextRunAt),
      erroredJobs: jobs.filter((job) => job.lastStatus === "error"),
    }),
    [jobs],
  );
  const visibleJobs =
    selectedTab === "active"
      ? activeJobs
      : selectedTab === "inactive"
        ? inactiveJobs
        : erroredJobs;
  const configuredChannels = channels.filter((channel) => channel.configured);
  const selectedChannelConfigured = configuredChannels.some(
    (channel) => channel.id === automationOutputChannel,
  );

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

  const loadChannels = async () => {
    setIsLoadingChannels(true);
    setChannelError(null);
    try {
      const response = await authFetch(`${config.apiBaseUrl}/api/channels/status`);
      if (!response.ok) {
        throw new Error(`Failed to load channels (${response.status})`);
      }
      const body = (await response.json()) as ChannelStatusResponse;
      setChannels(body.channels ?? []);
    } catch (loadError) {
      setChannelError(loadError instanceof Error ? loadError.message : "Failed to load channels");
    } finally {
      setIsLoadingChannels(false);
    }
  };

  useEffect(() => {
    if (!isOpen) return;
    void loadAutomations();
    void loadChannels();
  }, [isOpen]);

  useEffect(() => {
    if (selectedTab === "active" && activeJobs.length === 0 && erroredJobs.length > 0) {
      setSelectedTab("errored");
    } else if (selectedTab === "active" && activeJobs.length === 0 && inactiveJobs.length > 0) {
      setSelectedTab("inactive");
    } else if (selectedTab === "inactive" && inactiveJobs.length === 0 && erroredJobs.length > 0) {
      setSelectedTab("errored");
    } else if (selectedTab === "inactive" && inactiveJobs.length === 0 && activeJobs.length > 0) {
      setSelectedTab("active");
    } else if (selectedTab === "errored" && erroredJobs.length === 0 && activeJobs.length > 0) {
      setSelectedTab("active");
    } else if (selectedTab === "errored" && erroredJobs.length === 0 && inactiveJobs.length > 0) {
      setSelectedTab("inactive");
    }
  }, [activeJobs.length, inactiveJobs.length, erroredJobs.length, selectedTab]);

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

  const saveAutomationChannel = async (channel: AutomationOutputChannel) => {
    setIsSavingChannel(true);
    setChannelError(null);
    try {
      await onAutomationOutputChannelChange(channel);
    } catch (saveError) {
      setChannelError(saveError instanceof Error ? saveError.message : "Failed to save automation channel");
    } finally {
      setIsSavingChannel(false);
    }
  };

  return (
    <section className={`border-b border-neutral-200 px-4 py-4 dark:border-neutral-700 ${className}`}>
      <div className="mb-3 flex items-center justify-between gap-2">
        {showHeader ? (
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400 dark:text-neutral-500">
              Automations
            </p>
            <p className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">
              Agent-created prompts that run on a schedule and only notify you when needed.
            </p>
          </div>
        ) : (
          <div />
        )}
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

      <section className="mb-3 rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-3 dark:border-neutral-700 dark:bg-neutral-800/60">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold text-neutral-900 dark:text-neutral-100">
              Automation notification channel
            </p>
            <p className="mt-0.5 text-[11px] text-neutral-500 dark:text-neutral-400">
              Used only when an automation explicitly sends a user-facing message.
            </p>
          </div>
          <select
            value={automationOutputChannel}
            disabled={isLoadingChannels || isSavingChannel || configuredChannels.length === 0}
            onChange={(event) =>
              void saveAutomationChannel(event.currentTarget.value as AutomationOutputChannel)
            }
            className="min-w-36 rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm font-medium text-neutral-900 outline-none transition focus:border-neutral-400 disabled:opacity-50 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100 dark:focus:border-neutral-500"
          >
            {!selectedChannelConfigured ? (
              <option value={automationOutputChannel}>
                {AUTOMATION_CHANNEL_LABELS[automationOutputChannel]}
              </option>
            ) : null}
            {configuredChannels.map((channel) => (
              <option key={channel.id} value={channel.id}>
                {channel.label}
              </option>
            ))}
          </select>
        </div>
        {channelError ? (
          <p className="mt-2 text-[11px] text-red-600 dark:text-red-300">
            {channelError}
          </p>
        ) : null}
        {!isLoadingChannels && configuredChannels.length === 0 ? (
          <p className="mt-2 text-[11px] text-amber-700 dark:text-amber-300">
            No configured messaging channels are available.
          </p>
        ) : !selectedChannelConfigured ? (
          <p className="mt-2 text-[11px] text-amber-700 dark:text-amber-300">
            {AUTOMATION_CHANNEL_LABELS[automationOutputChannel]} is selected but is not configured.
          </p>
        ) : null}
      </section>

      {jobs.length > 0 ? (
        <div className="mb-3 grid grid-cols-3 rounded-xl bg-neutral-100 p-1 text-xs font-semibold text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400">
          <button
            type="button"
            onClick={() => setSelectedTab("active")}
            className={`rounded-lg px-3 py-2 transition ${
              selectedTab === "active"
                ? "bg-white text-neutral-900 shadow-sm dark:bg-neutral-900 dark:text-neutral-100"
                : "hover:text-neutral-700 dark:hover:text-neutral-200"
            }`}
          >
            Active
            <span className="ml-1 text-[10px] text-neutral-400">
              {activeJobs.length}
            </span>
          </button>
          <button
            type="button"
            onClick={() => setSelectedTab("inactive")}
            className={`rounded-lg px-3 py-2 transition ${
              selectedTab === "inactive"
                ? "bg-white text-neutral-900 shadow-sm dark:bg-neutral-900 dark:text-neutral-100"
                : "hover:text-neutral-700 dark:hover:text-neutral-200"
            }`}
          >
            Inactive
            <span className="ml-1 text-[10px] text-neutral-400">
              {inactiveJobs.length}
            </span>
          </button>
          <button
            type="button"
            onClick={() => setSelectedTab("errored")}
            className={`rounded-lg px-3 py-2 transition ${
              selectedTab === "errored"
                ? "bg-white text-neutral-900 shadow-sm dark:bg-neutral-900 dark:text-neutral-100"
                : "hover:text-neutral-700 dark:hover:text-neutral-200"
            }`}
          >
            Errored
            <span className="ml-1 text-[10px] text-neutral-400">
              {erroredJobs.length}
            </span>
          </button>
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
      ) : visibleJobs.length === 0 ? (
        <div className="rounded-lg border border-dashed border-neutral-300 px-3 py-3 text-xs text-neutral-500 dark:border-neutral-700 dark:text-neutral-400">
          {selectedTab === "active"
            ? "No active automations. Automations need a next scheduled run to appear here."
            : selectedTab === "inactive"
              ? "No inactive automations."
              : "No errored automations."}
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {visibleJobs.map((job) => (
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
                    {!job.nextRunAt ? (
                      <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700 ring-1 ring-amber-200 dark:bg-amber-950/30 dark:text-amber-300 dark:ring-amber-900">
                        inactive
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-1 text-[11px] text-neutral-500 dark:text-neutral-400">
                    {formatSchedule(job.schedule)}
                  </p>
                </div>
              </div>
              <details className="group mt-3 rounded-lg border border-neutral-200 bg-white px-3 py-2 text-xs dark:border-neutral-700 dark:bg-neutral-900">
                <summary className="cursor-pointer select-none font-medium text-neutral-500 transition hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100">
                  Prompt
                  <span className="ml-1 text-neutral-400 group-open:hidden">
                    hidden
                  </span>
                </summary>
                <p className="mt-2 whitespace-pre-wrap text-neutral-700 dark:text-neutral-200">
                  {job.prompt}
                </p>
              </details>
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

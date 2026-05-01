import { useEffect, useMemo, useState } from "react";
import { config } from "../../config/config";
import { fetchJson } from "../../store/chat/api";
import type { ChatModelId, ChatModelProvider } from "../../store/chatStore";
import {
  getChatModelRouteLabel,
  type ChatModelOption,
  toChatModelOption,
} from "../chat/modelOptions";

type ChatModelSelection = {
  provider: ChatModelProvider;
  modelId: ChatModelId;
};

interface WorkspaceDefaultModelSectionProps {
  defaultChatModelSelection?: ChatModelSelection;
  onDefaultChatModelChange: (selection: ChatModelSelection) => Promise<void> | void;
}

const modelValue = (selection: Pick<ChatModelOption, "provider" | "modelId">): string =>
  `${selection.provider}:${selection.modelId}`;

export function WorkspaceDefaultModelSection({
  defaultChatModelSelection,
  onDefaultChatModelChange,
}: WorkspaceDefaultModelSectionProps) {
  const [allowedOptions, setAllowedOptions] = useState<ChatModelOption[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const selected = defaultChatModelSelection
    ? toChatModelOption(defaultChatModelSelection)
    : allowedOptions[0] ?? null;
  const options = useMemo(() => {
    if (!selected) {
      return allowedOptions;
    }

    if (
      allowedOptions.some(
        (option) => option.provider === selected.provider && option.modelId === selected.modelId,
      )
    ) {
      return allowedOptions;
    }

    return [selected, ...allowedOptions];
  }, [allowedOptions, selected]);

  useEffect(() => {
    let cancelled = false;

    const loadAllowedModels = async () => {
      try {
        const payload = await fetchJson<{
          models: Array<Pick<ChatModelOption, "provider" | "modelId" | "routingProvider">>;
        }>(`${config.apiBaseUrl}/chats/models`);
        const nextOptions = payload.models.map(toChatModelOption);
        if (!cancelled) {
          setAllowedOptions(nextOptions);
        }
      } catch (loadError) {
        console.warn("[workspace] Failed to load allowed chat models", loadError);
        if (!cancelled) {
          setError("Failed to load model options");
        }
      }
    };

    void loadAllowedModels();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section className="border-b border-neutral-200 px-4 py-4 dark:border-neutral-700">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400 dark:text-neutral-500">
        Default Model
      </p>
      <div className="mt-2 rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-3 dark:border-neutral-700 dark:bg-neutral-800">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
              New channel chats
            </p>
            <p className="mt-0.5 text-xs leading-5 text-neutral-500 dark:text-neutral-400">
              Used when Email, Telegram, WhatsApp, or new chats create a fresh
              session. Existing chats can still switch models in the composer.
            </p>
          </div>
          <select
            value={selected ? modelValue(selected) : ""}
            disabled={isSaving || options.length === 0}
            className="shrink-0 rounded-lg border border-neutral-200 bg-white px-2.5 py-1.5 text-xs font-medium text-neutral-800 outline-none transition hover:border-neutral-300 disabled:cursor-not-allowed disabled:opacity-60 dark:border-neutral-600 dark:bg-neutral-900 dark:text-neutral-100 dark:hover:border-neutral-500"
            onChange={(event) => {
              const next = options.find((option) => modelValue(option) === event.target.value);
              if (!next) {
                return;
              }

              setIsSaving(true);
              setError(null);
              void Promise.resolve(
                onDefaultChatModelChange({
                  provider: next.provider,
                  modelId: next.modelId,
                }),
              )
                .catch((saveError) => {
                  setError(
                    saveError instanceof Error
                      ? saveError.message
                      : "Failed to save default model",
                  );
                })
                .finally(() => setIsSaving(false));
            }}
          >
            {selected ? null : <option value="">Loading...</option>}
            {options.map((option) => (
              <option key={modelValue(option)} value={modelValue(option)}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
        {error ? (
          <p className="mt-2 text-xs text-red-600 dark:text-red-300">{error}</p>
        ) : isSaving ? (
          <p className="mt-2 text-xs text-neutral-400 dark:text-neutral-500">
            Saving default model...
          </p>
        ) : null}
        {options.length > 0 ? (
          <div className="mt-3 rounded-lg border border-neutral-200 bg-white px-3 py-2 dark:border-neutral-700 dark:bg-neutral-900">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400 dark:text-neutral-500">
              Model Providers
            </p>
            <div className="mt-2 space-y-1.5">
              {options.map((option) => (
                <div
                  key={`${modelValue(option)}:provider`}
                  className="flex items-center justify-between gap-3 text-xs"
                >
                  <span className="min-w-0 truncate text-neutral-600 dark:text-neutral-300">
                    {option.label}
                  </span>
                  <span className="shrink-0 rounded-full bg-neutral-100 px-2 py-0.5 font-medium text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">
                    {getChatModelRouteLabel(option)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}

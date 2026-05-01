import { useEffect, useMemo, useState } from "react";
import { config } from "../../../config/config";
import { fetchJson } from "../../../store/chat/api";
import { type ChatModelOption, toChatModelOption } from "../modelOptions";

interface ChatModelSelectProps {
  modelProvider: ChatModelOption["provider"];
  modelId: ChatModelOption["modelId"];
  disabled?: boolean;
  onChange: (
    modelSelection: Pick<ChatModelOption, "provider" | "modelId">,
  ) => void;
}

export function ChatModelSelect({
  modelProvider,
  modelId,
  disabled = false,
  onChange,
}: ChatModelSelectProps) {
  const [allowedOptions, setAllowedOptions] = useState<ChatModelOption[] | null>(null);
  const selectedValue = `${modelProvider}:${modelId}`;
  const selected = toChatModelOption({ provider: modelProvider, modelId });
  const options = useMemo(() => {
    const loaded = allowedOptions ?? [selected];
    if (
      loaded.some(
        (option) => option.provider === selected.provider && option.modelId === selected.modelId,
      )
    ) {
      return loaded;
    }

    return [selected, ...loaded];
  }, [allowedOptions, selected]);

  useEffect(() => {
    let cancelled = false;

    const loadAllowedModels = async () => {
      try {
        const payload = await fetchJson<{
          models: Array<Pick<ChatModelOption, "provider" | "modelId">>;
        }>(`${config.apiBaseUrl}/chats/models`);
        const nextOptions = payload.models.map(toChatModelOption);
        if (!cancelled && nextOptions.length > 0) {
          setAllowedOptions(nextOptions);
        }
      } catch (error) {
        console.warn("[chat] Failed to load allowed chat models", error);
      }
    };

    void loadAllowedModels();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <label
      className={`relative inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium transition ${
        disabled
          ? "cursor-not-allowed text-neutral-400 dark:text-neutral-500"
          : "cursor-pointer text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
      }`}
      title="Select model"
    >
      <span className="whitespace-nowrap">{selected?.label ?? "Model"}</span>
      <svg
        className="h-3 w-3 shrink-0 opacity-60"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <path d="m6 9 6 6 6-6" />
      </svg>
      <select
        value={selectedValue}
        disabled={disabled}
        className="absolute inset-0 cursor-pointer appearance-none bg-transparent text-transparent outline-none disabled:cursor-not-allowed"
        onChange={(event) => {
          const next = options.find(
            (option) => `${option.provider}:${option.modelId}` === event.target.value,
          );
          if (!next) {
            return;
          }

          onChange({
            provider: next.provider,
            modelId: next.modelId,
          });
        }}
      >
        {options.map((option) => (
          <option
            key={`${option.provider}:${option.modelId}`}
            value={`${option.provider}:${option.modelId}`}
          >
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

import type { ChatMessage } from "../../../store/chatStore";
import { CollapsibleContent } from "./CollapsibleContent";
import { ToolResultDetails } from "./ToolResultDetails";
import { BashTerminalView } from "./toolDetails/BashTerminalView";
import { EditDiffView } from "./toolDetails/EditDiffView";
import { ImageGenView } from "./toolDetails/ImageGenView";
import { ReadFileView } from "./toolDetails/ReadFileView";
import { extractFilePath, formatToolSummary } from "../lib/toolSummaries";
import { parseBashInput, parseEditInput, parseImageUrls } from "../lib/toolResultHelpers";
import type { ActionItem } from "../types";

const ChevronIcon = () => (
  <svg
    className="mt-1.5 h-3 w-3 shrink-0 text-neutral-400 transition-transform group-open/action:rotate-90"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.5"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="m9 18 6-6-6-6" />
  </svg>
);

interface ActionGroupProps {
  actions: ActionItem[];
  thinking: ChatMessage[];
  onImageClick?: (src: string) => void;
}

function FallbackToolCard({
  action,
  onImageClick,
}: {
  action: ActionItem;
  onImageClick?: (src: string) => void;
}) {
  return (
    <div className="mb-1 ml-4 mt-1 min-w-0 max-w-full">
      <CollapsibleContent>
        <div className="max-w-full overflow-hidden rounded-lg border border-neutral-200 dark:border-neutral-700">
          {action.call.toolInput ? (
            <div className="border-b border-neutral-100 px-3 py-2 dark:border-neutral-700">
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-widest text-neutral-400">
                Input
              </p>
              <pre className="overflow-x-auto whitespace-pre-wrap break-words font-mono text-xs text-neutral-700 dark:text-neutral-300">
                {action.call.toolInput}
              </pre>
            </div>
          ) : null}
          {action.result ? (
            <div className="px-3 py-2">
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-widest text-neutral-400">
                Output
              </p>
              <pre className="overflow-x-auto whitespace-pre-wrap break-words rounded bg-neutral-950 p-3 font-mono text-xs text-neutral-300">
                {action.result.content}
              </pre>
            </div>
          ) : null}
          {action.result ? (
            <ToolResultDetails result={action.result} onImageClick={onImageClick} />
          ) : null}
        </div>
      </CollapsibleContent>
    </div>
  );
}

function ActionDetail({
  action,
  onImageClick,
}: {
  action: ActionItem;
  onImageClick?: (src: string) => void;
}) {
  if (action.call.toolName?.toLowerCase() === "write" && action.call.toolInput) {
    try {
      const input = JSON.parse(action.call.toolInput) as Record<string, unknown>;
      const filePath = extractFilePath(input);
      const fileContent = typeof input.content === "string" ? input.content : null;

      if (filePath && fileContent) {
        return (
          <div className="mb-1 ml-4 mt-1 min-w-0 max-w-full">
            <CollapsibleContent>
              <ReadFileView
                filePath={filePath}
                content={fileContent}
                rawInput={action.call.toolInput}
                rawOutput={action.result?.content}
              />
            </CollapsibleContent>
          </div>
        );
      }
    } catch {
      // Ignore invalid JSON and fall back to generic rendering.
    }
  }

  if (
    action.call.toolName?.toLowerCase() === "read" &&
    action.result?.content &&
    action.call.toolInput
  ) {
    try {
      const input = JSON.parse(action.call.toolInput) as Record<string, unknown>;
      const filePath = extractFilePath(input);

      if (filePath) {
        return (
          <div className="mb-1 ml-4 mt-1 min-w-0 max-w-full">
            <CollapsibleContent>
              <ReadFileView
                filePath={filePath}
                content={action.result.content}
                rawInput={action.call.toolInput}
                rawOutput={action.result.content}
              />
            </CollapsibleContent>
          </div>
        );
      }
    } catch {
      // Ignore invalid JSON and fall back to generic rendering.
    }
  }

  const editDiff =
    action.call.toolName?.toLowerCase() === "edit"
      ? parseEditInput(action.call.toolInput)
      : null;

  if (editDiff) {
    return (
      <div className="mb-1 ml-4 mt-1 min-w-0 max-w-full">
        <CollapsibleContent>
          <EditDiffView
            oldString={editDiff.oldString}
            newString={editDiff.newString}
            rawInput={action.call.toolInput}
            rawOutput={action.result?.content}
          />
        </CollapsibleContent>
      </div>
    );
  }

  const bashData =
    action.call.toolName?.toLowerCase() === "bash"
      ? parseBashInput(action.call.toolInput)
      : null;

  if (bashData) {
    return (
      <div className="mb-1 ml-4 mt-1 min-w-0 max-w-full">
        <CollapsibleContent>
          <BashTerminalView
            command={bashData.command}
            output={action.result?.content}
            rawInput={action.call.toolInput}
            rawOutput={action.result?.content}
          />
        </CollapsibleContent>
      </div>
    );
  }

  const imageToolName = action.call.toolName?.toLowerCase();
  if (
    (imageToolName === "generate_images" || imageToolName === "generate_image") &&
    action.result
  ) {
    const imageUrls = parseImageUrls(action.result.toolDetails);
    if (imageUrls.length > 0) {
      return (
        <div className="mb-1 ml-4 mt-1 min-w-0 max-w-full">
          <ImageGenView
            urls={imageUrls}
            rawInput={action.call.toolInput}
            rawOutput={action.result.content}
            onImageClick={onImageClick}
          />
        </div>
      );
    }
  }

  return <FallbackToolCard action={action} onImageClick={onImageClick} />;
}

export function ActionGroup({
  actions,
  thinking,
  onImageClick,
}: ActionGroupProps) {
  const label = `Performed ${actions.length} action${actions.length !== 1 ? "s" : ""}`;

  return (
    <details className="group min-w-0 max-w-full" open>
      <summary className="inline-flex cursor-pointer list-none items-center gap-1.5 rounded-full bg-neutral-100 px-3 py-1.5 text-sm font-medium text-neutral-400 transition hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-500 dark:hover:bg-neutral-700">
        <svg
          className="h-3 w-3 shrink-0 text-neutral-400 transition-transform group-open:rotate-90"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="m9 18 6-6-6-6" />
        </svg>
        <span>{label}</span>
      </summary>

      <div className="ml-3 mt-1.5 min-w-0 max-w-full space-y-px border-l-2 border-neutral-200 pl-2 dark:border-neutral-800">
        {thinking.length > 0 ? (
          <div className="pb-1 text-sm italic text-neutral-400">
            {thinking.length} thinking step{thinking.length !== 1 ? "s" : ""}
          </div>
        ) : null}
        {actions.map((action) => (
          <details key={action.call.id} className="group/action min-w-0 max-w-full" open>
            <summary className="flex min-w-0 max-w-full cursor-pointer list-none items-start gap-2 rounded px-1 py-0.5 text-base text-neutral-500 transition hover:bg-neutral-50 dark:text-neutral-400 dark:hover:bg-neutral-800/50">
              <ChevronIcon />
              <span className="min-w-0 flex-1 truncate font-mono">
                {formatToolSummary(action.call.toolName, action.call.toolInput)}
              </span>
            </summary>
            <ActionDetail action={action} onImageClick={onImageClick} />
          </details>
        ))}
      </div>
    </details>
  );
}

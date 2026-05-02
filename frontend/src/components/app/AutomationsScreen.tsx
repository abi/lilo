import { WorkspaceAutomationsSection } from "../workspace/WorkspaceAutomationsSection";
import type { AutomationOutputChannel } from "../workspace/types";

interface AutomationsScreenProps {
  mobile?: boolean;
  automationOutputChannel?: AutomationOutputChannel;
  onAutomationOutputChannelChange: (channel: AutomationOutputChannel) => Promise<void> | void;
}

export function AutomationsScreen({
  mobile = false,
  automationOutputChannel = "whatsapp",
  onAutomationOutputChannelChange,
}: AutomationsScreenProps) {
  return (
    <section
      className={`flex min-h-0 flex-1 flex-col bg-white dark:bg-neutral-900 ${
        mobile ? "md:hidden" : "h-full border-r border-neutral-200 dark:border-neutral-700"
      }`}
    >
      <header className="shrink-0 border-b border-neutral-200 px-4 py-4 dark:border-neutral-700">
        <p className="font-heading text-sm font-bold uppercase tracking-widest text-neutral-900 dark:text-neutral-100">
          Automations
        </p>
        <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
          Scheduled agent prompts that run silently unless they explicitly notify you.
        </p>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <WorkspaceAutomationsSection
          isOpen
          className="border-b-0"
          showHeader={false}
          automationOutputChannel={automationOutputChannel}
          onAutomationOutputChannelChange={onAutomationOutputChannelChange}
        />
      </div>
    </section>
  );
}

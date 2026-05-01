import { WorkspaceAutomationsSection } from "../workspace/WorkspaceAutomationsSection";

interface AutomationsScreenProps {
  mobile?: boolean;
}

export function AutomationsScreen({ mobile = false }: AutomationsScreenProps) {
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
          Scheduled agent prompts that send results to WhatsApp.
        </p>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <WorkspaceAutomationsSection
          isOpen
          className="border-b-0"
          showHeader={false}
        />
      </div>
    </section>
  );
}

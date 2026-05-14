import type {
  WorkspaceSkill,
  WorkspaceSkillDiagnostic,
} from "../workspace/types";

interface SkillsScreenProps {
  mobile?: boolean;
  skills: WorkspaceSkill[];
  diagnostics: WorkspaceSkillDiagnostic[];
  onOpenSkillFile: (viewerPath: string) => void;
  onRefresh: () => void;
}

const SOURCE_LABELS: Record<WorkspaceSkill["source"], string> = {
  workspace: "skills/",
  "workspace-agents": ".agents/skills/",
};

function EmptySkillsCard() {
  return (
    <div className="rounded-2xl border border-dashed border-neutral-300 bg-neutral-50 p-5 dark:border-neutral-700 dark:bg-neutral-950">
      <p className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
        No skills installed yet
      </p>
      <p className="mt-2 text-sm leading-6 text-neutral-500 dark:text-neutral-400">
        Add a skill at{" "}
        <code className="rounded bg-white px-1.5 py-0.5 font-mono text-xs text-neutral-700 dark:bg-neutral-900 dark:text-neutral-200">
          skills/&lt;skill-name&gt;/SKILL.md
        </code>
        . Lilo also scans{" "}
        <code className="rounded bg-white px-1.5 py-0.5 font-mono text-xs text-neutral-700 dark:bg-neutral-900 dark:text-neutral-200">
          .agents/skills/
        </code>{" "}
        for compatibility.
      </p>
    </div>
  );
}

export function SkillsScreen({
  mobile = false,
  skills,
  diagnostics,
  onOpenSkillFile,
  onRefresh,
}: SkillsScreenProps) {
  return (
    <section
      className={`flex min-h-0 flex-1 flex-col bg-white dark:bg-neutral-900 ${
        mobile ? "md:hidden" : "h-full border-r border-neutral-200 dark:border-neutral-700"
      }`}
    >
      <header className="shrink-0 border-b border-neutral-200 px-4 py-4 dark:border-neutral-700">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="font-heading text-sm font-bold uppercase tracking-widest text-neutral-900 dark:text-neutral-100">
              Skills
            </p>
            <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
              Workspace instructions Lilo can activate on demand.
            </p>
          </div>
          <button
            type="button"
            onClick={onRefresh}
            className="rounded-xl border border-neutral-200 px-3 py-2 text-sm font-medium text-neutral-500 transition hover:border-neutral-400 hover:text-neutral-900 dark:border-neutral-700 dark:text-neutral-400 dark:hover:border-neutral-500 dark:hover:text-neutral-100"
          >
            Refresh
          </button>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        <div className="mb-4 rounded-2xl border border-neutral-200 bg-neutral-50 p-4 dark:border-neutral-700 dark:bg-neutral-950">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-neutral-400">
            Loading order
          </p>
          <p className="mt-2 text-sm leading-6 text-neutral-600 dark:text-neutral-300">
            <code className="font-mono">skills/</code> is the primary Lilo location and wins
            conflicts. <code className="font-mono">.agents/skills/</code> is scanned as the
            AgentSkills-compatible fallback.
          </p>
        </div>

        {diagnostics.length > 0 ? (
          <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-900/60 dark:bg-amber-950/30">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-amber-700 dark:text-amber-300">
              Diagnostics
            </p>
            <div className="mt-2 space-y-2">
              {diagnostics.map((diagnostic, index) => (
                <div key={`${diagnostic.path ?? "global"}-${index}`} className="text-sm text-amber-800 dark:text-amber-200">
                  <p>{diagnostic.message}</p>
                  {diagnostic.path ? (
                    <p className="mt-1 font-mono text-xs text-amber-700/80 dark:text-amber-300/80">
                      {diagnostic.path}
                    </p>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {skills.length === 0 ? (
          <EmptySkillsCard />
        ) : (
          <div className="grid gap-3">
            {skills.map((skill) => (
              <article
                key={`${skill.source}:${skill.name}`}
                className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm dark:border-neutral-700 dark:bg-neutral-900"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-base font-semibold text-neutral-900 dark:text-neutral-100">
                        {skill.name}
                      </h2>
                      <span className="rounded-full bg-neutral-100 px-2 py-1 text-xs font-medium text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400">
                        {SOURCE_LABELS[skill.source]}
                      </span>
                    </div>
                    <p className="mt-2 text-sm leading-6 text-neutral-600 dark:text-neutral-300">
                      {skill.description}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => onOpenSkillFile(skill.viewerPath)}
                    className="shrink-0 rounded-xl border border-neutral-200 px-3 py-2 text-sm font-medium text-neutral-600 transition hover:border-neutral-400 hover:text-neutral-950 dark:border-neutral-700 dark:text-neutral-300 dark:hover:border-neutral-500 dark:hover:text-white"
                  >
                    Open
                  </button>
                </div>
                <p className="mt-3 break-all font-mono text-xs text-neutral-400">
                  {skill.skillFileRelativePath}
                </p>
              </article>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

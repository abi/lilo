import { existsSync, readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { captureBackendException } from "../observability/sentry.js";
import { discoverWorkspaceSkills } from "../skills/skills.js";

const PROMPTS_DIR = dirname(fileURLToPath(import.meta.url));
const SOUL_FILE_NAME = "SOUL.md";
const MAX_SOUL_PROMPT_CHARS = 12_000;
const DESIGN_SYSTEM_PATH_CANDIDATES = [
  resolve(PROMPTS_DIR, "DESIGN-SYSTEM.md"),
  resolve(PROMPTS_DIR, "../../../src/shared/prompts/DESIGN-SYSTEM.md"),
];

const DEFAULT_SOUL_PROMPT = `# Soul / Identity

You are Lilo, a powerful agent that can help with a wide range of tasks. You are primarily a chatbot but you can also build apps as a coding agent.`;

const PI_SYSTEM_PROMPT_PATH_CANDIDATES = [
  resolve(PROMPTS_DIR, "PI-SYSTEM-PROMPT.md"),
  resolve(PROMPTS_DIR, "../../../src/shared/prompts/PI-SYSTEM-PROMPT.md"),
];

const readPiSystemPrompt = (): string => {
  try {
    const promptPath = PI_SYSTEM_PROMPT_PATH_CANDIDATES.find((candidate) =>
      existsSync(candidate),
    );
    if (!promptPath) {
      captureBackendException(new Error("PI-SYSTEM-PROMPT.md not found"), {
        tags: {
          area: "prompts",
          prompt_file: "PI-SYSTEM-PROMPT.md",
        },
        extras: {
          candidates: PI_SYSTEM_PROMPT_PATH_CANDIDATES,
        },
        level: "error",
        fingerprint: ["prompts", "pi-system", "missing"],
      });
      return "";
    }

    const prompt = readFileSync(promptPath, "utf8").trim();
    return prompt ? `\n${prompt}\n` : "";
  } catch (error) {
    captureBackendException(error, {
      tags: {
        area: "prompts",
        prompt_file: "PI-SYSTEM-PROMPT.md",
      },
      extras: {
        candidates: PI_SYSTEM_PROMPT_PATH_CANDIDATES,
      },
      level: "error",
      fingerprint: ["prompts", "pi-system", "read_failed"],
    });
    return "";
  }
};

const readDesignSystemPrompt = (): string => {
  try {
    const designSystemPath = DESIGN_SYSTEM_PATH_CANDIDATES.find((candidate) =>
      existsSync(candidate),
    );
    if (!designSystemPath) {
      captureBackendException(new Error("DESIGN-SYSTEM.md not found"), {
        tags: {
          area: "prompts",
          prompt_file: "DESIGN-SYSTEM.md",
        },
        extras: {
          candidates: DESIGN_SYSTEM_PATH_CANDIDATES,
        },
        level: "warning",
        fingerprint: ["prompts", "design-system", "missing"],
      });
      return "";
    }

    const designSystem = readFileSync(designSystemPath, "utf8").trim();
    if (!designSystem) {
      return "";
    }

    return `\n# Design System\n\nAlways apply the following design system when building or updating user-facing apps and interfaces (unless the users asks you to deviate from it):\n\n${designSystem}\n`;
  } catch (error) {
    captureBackendException(error, {
      tags: {
        area: "prompts",
        prompt_file: "DESIGN-SYSTEM.md",
      },
      extras: {
        candidates: DESIGN_SYSTEM_PATH_CANDIDATES,
      },
      level: "error",
      fingerprint: ["prompts", "design-system", "read_failed"],
    });
    return "";
  }
};

const readWorkspaceSoulPrompt = async (workspaceDir: string): Promise<string> => {
  try {
    const soul = (await readFile(resolve(workspaceDir, SOUL_FILE_NAME), "utf8")).trim();
    if (soul.length === 0) {
      return DEFAULT_SOUL_PROMPT;
    }

    if (soul.length <= MAX_SOUL_PROMPT_CHARS) {
      return `# Soul / Identity\n\n${soul}`;
    }

    captureBackendException(new Error("SOUL.md exceeded prompt character limit and was truncated"), {
      tags: {
        area: "prompts",
        prompt_file: SOUL_FILE_NAME,
      },
      extras: {
        workspaceDir,
        length: soul.length,
        maxLength: MAX_SOUL_PROMPT_CHARS,
      },
      level: "warning",
      fingerprint: ["prompts", "soul", "truncated"],
    });

    return `# Soul / Identity\n\n${soul.slice(0, MAX_SOUL_PROMPT_CHARS).trim()}\n\n[SOUL.md truncated to ${MAX_SOUL_PROMPT_CHARS} characters.]`;
  } catch {
    return DEFAULT_SOUL_PROMPT;
  }
};

interface PiSystemPromptOptions {
  publicAppUrl?: string | null;
}

const buildDeploymentPrompt = ({ publicAppUrl }: PiSystemPromptOptions): string => {
  const normalizedPublicAppUrl = publicAppUrl?.trim();
  if (!normalizedPublicAppUrl) {
    return "";
  }

  return `# Deployment

- Lilo's public URL for this deployment is ${normalizedPublicAppUrl}.
- Use this public URL when the user asks for webhook, callback, or external service configuration URLs.

`;
};

const buildSkillsPrompt = async (workspaceDir: string): Promise<string> => {
  const catalog = await discoverWorkspaceSkills(workspaceDir);
  if (catalog.skills.length === 0) {
    return "";
  }

  const skills = catalog.skills
    .map(
      (skill) => [
        "  <skill>",
        `    <name>${skill.name}</name>`,
        `    <description>${skill.description}</description>`,
        `    <location>${skill.skillFileRelativePath}</location>`,
        "  </skill>",
      ].join("\n"),
    )
    .join("\n");

  return `# Skills

Workspace skills provide specialized instructions for specific tasks. Use progressive disclosure:

- The skill catalog below is already loaded so you can decide when a skill is relevant.
- When the task matches a skill description, call the \`activate_skill\` tool with the exact skill name before proceeding.
- If a user explicitly names a skill using \`/skill-name\` or \`$skill-name\`, the skill may already be included in \`<explicitly_activated_skills>\`; if it is not, call \`activate_skill\`.
- Do not activate the same skill more than once in a chat unless the user asks you to reload it.
- Skill resources are not loaded eagerly. If activated instructions reference supporting files, read only those files as needed.

<available_skills>
${skills}
</available_skills>

`;
};

export const buildPiSystemPrompt = async (
  workspaceDir: string,
  options: PiSystemPromptOptions = {},
): Promise<string> =>
  `${await readWorkspaceSoulPrompt(workspaceDir)}${readPiSystemPrompt()}${buildDeploymentPrompt(options)}${await buildSkillsPrompt(workspaceDir)}${readDesignSystemPrompt()}`;

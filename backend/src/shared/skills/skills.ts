import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { basename, relative, resolve } from "node:path";
import { WORKSPACE_ROOT } from "../config/paths.js";
import { captureBackendException } from "../observability/sentry.js";

const SKILL_FILE_NAME = "SKILL.md";
const MAX_RESOURCE_FILES = 200;
const MAX_RESOURCE_DEPTH = 4;
const SKIP_DIR_NAMES = new Set([".git", "node_modules", ".DS_Store"]);

export type WorkspaceSkillSource = "workspace" | "workspace-agents";

export interface WorkspaceSkill {
  name: string;
  description: string;
  source: WorkspaceSkillSource;
  sourceLabel: string;
  directoryRelativePath: string;
  skillFileRelativePath: string;
  viewerPath: string;
}

export interface WorkspaceSkillDiagnostic {
  level: "warning" | "error";
  message: string;
  path?: string;
}

export interface WorkspaceSkillCatalog {
  skills: WorkspaceSkill[];
  diagnostics: WorkspaceSkillDiagnostic[];
}

export interface ActivatedWorkspaceSkill extends WorkspaceSkill {
  body: string;
  resources: string[];
}

interface SkillSourceConfig {
  source: WorkspaceSkillSource;
  sourceLabel: string;
  rootRelativePath: string;
  precedence: number;
}

const SKILL_SOURCES: SkillSourceConfig[] = [
  {
    source: "workspace",
    sourceLabel: "Workspace skills",
    rootRelativePath: "skills",
    precedence: 100,
  },
  {
    source: "workspace-agents",
    sourceLabel: "Agent-compatible workspace skills",
    rootRelativePath: ".agents/skills",
    precedence: 90,
  },
];

const encodeWorkspaceRoutePath = (path: string): string =>
  path.split("/").map((segment) => encodeURIComponent(segment)).join("/");

const normalizeRelativePath = (workspaceRoot: string, absolutePath: string): string =>
  relative(workspaceRoot, absolutePath).split("\\").join("/");

const isInsideWorkspace = (workspaceRoot: string, absolutePath: string): boolean => {
  const relativePath = relative(workspaceRoot, absolutePath);
  return relativePath.length === 0 || (!relativePath.startsWith("..") && !relativePath.startsWith("/"));
};

const trimYamlValue = (value: string): string => {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
};

const parseFrontmatter = (
  raw: string,
): { metadata: Record<string, string>; body: string } | null => {
  const normalized = raw.replace(/\r\n/g, "\n");
  if (!normalized.startsWith("---\n")) {
    return null;
  }

  const closingIndex = normalized.indexOf("\n---", 4);
  if (closingIndex === -1) {
    return null;
  }

  const yaml = normalized.slice(4, closingIndex);
  const body = normalized.slice(closingIndex + "\n---".length).replace(/^\n/, "").trim();
  const metadata: Record<string, string> = {};
  const lines = yaml.split("\n");

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const match = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!match) {
      continue;
    }

    const key = match[1];
    const value = match[2].trim();
    if (value === "|" || value === ">") {
      const blockLines: string[] = [];
      index += 1;
      while (index < lines.length && /^\s+/.test(lines[index])) {
        blockLines.push(lines[index].replace(/^\s{2,}/, ""));
        index += 1;
      }
      index -= 1;
      metadata[key] = blockLines.join(value === ">" ? " " : "\n").trim();
      continue;
    }

    metadata[key] = trimYamlValue(value);
  }

  return { metadata, body };
};

const parseSkillFile = async (
  workspaceRoot: string,
  source: SkillSourceConfig,
  skillDirectoryAbsolutePath: string,
): Promise<{ skill: WorkspaceSkill; body: string } | { diagnostic: WorkspaceSkillDiagnostic }> => {
  const skillFileAbsolutePath = resolve(skillDirectoryAbsolutePath, SKILL_FILE_NAME);
  const skillFileRelativePath = normalizeRelativePath(workspaceRoot, skillFileAbsolutePath);

  try {
    const raw = await readFile(skillFileAbsolutePath, "utf8");
    const parsed = parseFrontmatter(raw);
    if (!parsed) {
      return {
        diagnostic: {
          level: "error",
          message: "Skill is missing YAML frontmatter.",
          path: skillFileRelativePath,
        },
      };
    }

    const name = parsed.metadata.name?.trim();
    const description = parsed.metadata.description?.trim();
    if (!name || !description) {
      return {
        diagnostic: {
          level: "error",
          message: "Skill must define non-empty name and description frontmatter fields.",
          path: skillFileRelativePath,
        },
      };
    }

    const directoryName = basename(skillDirectoryAbsolutePath);
    const diagnostics: WorkspaceSkillDiagnostic[] = [];
    if (name !== directoryName) {
      diagnostics.push({
        level: "warning",
        message: `Skill name "${name}" does not match directory "${directoryName}".`,
        path: skillFileRelativePath,
      });
    }

    if (name.length > 64) {
      diagnostics.push({
        level: "warning",
        message: `Skill name "${name}" is longer than 64 characters.`,
        path: skillFileRelativePath,
      });
    }

    if (!/^[a-z0-9][a-z0-9_-]*$/i.test(name)) {
      diagnostics.push({
        level: "warning",
        message: `Skill name "${name}" contains unusual characters.`,
        path: skillFileRelativePath,
      });
    }

    return {
      skill: {
        name,
        description,
        source: source.source,
        sourceLabel: source.sourceLabel,
        directoryRelativePath: normalizeRelativePath(workspaceRoot, skillDirectoryAbsolutePath),
        skillFileRelativePath,
        viewerPath: `/workspace-file/${encodeWorkspaceRoutePath(skillFileRelativePath)}`,
      },
      body: parsed.body,
    };
  } catch (error) {
    return {
      diagnostic: {
        level: "error",
        message: error instanceof Error ? error.message : "Failed to read skill.",
        path: skillFileRelativePath,
      },
    };
  }
};

const listSkillDirectories = async (
  workspaceRoot: string,
  source: SkillSourceConfig,
): Promise<string[]> => {
  const sourceRoot = resolve(workspaceRoot, source.rootRelativePath);
  if (!isInsideWorkspace(workspaceRoot, sourceRoot) || !existsSync(sourceRoot)) {
    return [];
  }

  const entries = await readdir(sourceRoot, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isDirectory() && !SKIP_DIR_NAMES.has(entry.name))
    .map((entry) => resolve(sourceRoot, entry.name));
};

export const discoverWorkspaceSkills = async (
  workspaceRoot = WORKSPACE_ROOT,
): Promise<WorkspaceSkillCatalog> => {
  const diagnostics: WorkspaceSkillDiagnostic[] = [];
  const discovered: Array<{ skill: WorkspaceSkill; body: string; precedence: number }> = [];

  for (const source of SKILL_SOURCES) {
    let directories: string[];
    try {
      directories = await listSkillDirectories(workspaceRoot, source);
    } catch (error) {
      diagnostics.push({
        level: "warning",
        message: error instanceof Error ? error.message : "Failed to scan skill source.",
        path: source.rootRelativePath,
      });
      continue;
    }

    for (const directory of directories) {
      const skillFile = resolve(directory, SKILL_FILE_NAME);
      if (!existsSync(skillFile)) {
        continue;
      }

      const result = await parseSkillFile(workspaceRoot, source, directory);
      if ("diagnostic" in result) {
        diagnostics.push(result.diagnostic);
        continue;
      }

      discovered.push({
        skill: result.skill,
        body: result.body,
        precedence: source.precedence,
      });
    }
  }

  discovered.sort((a, b) => b.precedence - a.precedence || a.skill.name.localeCompare(b.skill.name));
  const skillByName = new Map<string, WorkspaceSkill>();
  for (const entry of discovered) {
    const existing = skillByName.get(entry.skill.name);
    if (existing) {
      diagnostics.push({
        level: "warning",
        message: `Skill "${entry.skill.name}" from ${entry.skill.skillFileRelativePath} is shadowed by ${existing.skillFileRelativePath}.`,
        path: entry.skill.skillFileRelativePath,
      });
      continue;
    }

    skillByName.set(entry.skill.name, entry.skill);
  }

  const skills = [...skillByName.values()].sort((a, b) => a.name.localeCompare(b.name));
  return {
    skills,
    diagnostics,
  };
};

const collectResources = async (
  workspaceRoot: string,
  skillDirectoryAbsolutePath: string,
  depth = 0,
): Promise<string[]> => {
  if (depth > MAX_RESOURCE_DEPTH) {
    return [];
  }

  const entries = await readdir(skillDirectoryAbsolutePath, { withFileTypes: true });
  const resources: string[] = [];

  for (const entry of entries) {
    if (SKIP_DIR_NAMES.has(entry.name) || entry.name === SKILL_FILE_NAME) {
      continue;
    }

    const absolutePath = resolve(skillDirectoryAbsolutePath, entry.name);
    if (!isInsideWorkspace(workspaceRoot, absolutePath)) {
      continue;
    }

    if (entry.isDirectory()) {
      resources.push(...(await collectResources(workspaceRoot, absolutePath, depth + 1)));
      if (resources.length >= MAX_RESOURCE_FILES) {
        break;
      }
      continue;
    }

    if (entry.isFile()) {
      resources.push(normalizeRelativePath(workspaceRoot, absolutePath));
      if (resources.length >= MAX_RESOURCE_FILES) {
        break;
      }
    }
  }

  return resources.slice(0, MAX_RESOURCE_FILES);
};

export const activateWorkspaceSkill = async (
  name: string,
  workspaceRoot = WORKSPACE_ROOT,
): Promise<ActivatedWorkspaceSkill | null> => {
  const catalog = await discoverWorkspaceSkills(workspaceRoot);
  const skill = catalog.skills.find((entry) => entry.name === name);
  if (!skill) {
    return null;
  }

  const skillFileAbsolutePath = resolve(workspaceRoot, skill.skillFileRelativePath);
  if (!isInsideWorkspace(workspaceRoot, skillFileAbsolutePath)) {
    return null;
  }

  const raw = await readFile(skillFileAbsolutePath, "utf8");
  const parsed = parseFrontmatter(raw);
  if (!parsed) {
    return null;
  }

  const skillDirectoryAbsolutePath = resolve(workspaceRoot, skill.directoryRelativePath);
  const resources = await collectResources(workspaceRoot, skillDirectoryAbsolutePath).catch((error) => {
    captureBackendException(error, {
      tags: {
        area: "skills",
        operation: "collect_resources",
      },
      extras: {
        skillName: name,
        skillDirectory: skill.directoryRelativePath,
      },
      level: "warning",
    });
    return [] as string[];
  });

  return {
    ...skill,
    body: parsed.body,
    resources,
  };
};

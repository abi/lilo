import { Type } from "@mariozechner/pi-ai";
import type { ToolDefinition } from "@mariozechner/pi-coding-agent";
import { activateWorkspaceSkill, discoverWorkspaceSkills } from "../skills/skills.js";

export const ACTIVATE_SKILL_TOOL_NAME = "activate_skill";

const formatSkillContent = (
  skill: NonNullable<Awaited<ReturnType<typeof activateWorkspaceSkill>>>,
): string => {
  const resources = skill.resources.length > 0
    ? skill.resources.map((resource) => `  <file>${resource}</file>`).join("\n")
    : "  <none/>";

  return [
    `<skill_content name="${skill.name}">`,
    skill.body,
    "",
    `Skill directory: ${skill.directoryRelativePath}`,
    "Relative paths in this skill are relative to the skill directory. Use absolute or workspace-relative paths in tool calls as appropriate.",
    "",
    "<skill_resources>",
    resources,
    "</skill_resources>",
    "</skill_content>",
  ].join("\n");
};

export const activateSkillTool: ToolDefinition = {
  name: ACTIVATE_SKILL_TOOL_NAME,
  label: "Activate Skill",
  description:
    "Load the full instructions for a workspace skill by name. Use this when the user's task matches an available skill from the system prompt catalog.",
  parameters: Type.Object({
    name: Type.String({
      description: "The exact skill name from the available skills catalog.",
      minLength: 1,
    }),
  }),
  async execute(_toolCallId, params) {
    const name = String((params as { name?: unknown }).name ?? "").trim();
    if (!name) {
      throw new Error("Skill name is required");
    }

    const skill = await activateWorkspaceSkill(name);
    if (!skill) {
      const catalog = await discoverWorkspaceSkills();
      const available = catalog.skills.map((entry) => entry.name).join(", ");
      throw new Error(
        available
          ? `Skill "${name}" was not found. Available skills: ${available}`
          : `Skill "${name}" was not found. No workspace skills are available.`,
      );
    }

    return {
      content: [
        {
          type: "text" as const,
          text: formatSkillContent(skill),
        },
      ],
      details: {
        skillName: skill.name,
        description: skill.description,
        skillFile: skill.skillFileRelativePath,
        directory: skill.directoryRelativePath,
        resources: skill.resources,
      },
    };
  },
};

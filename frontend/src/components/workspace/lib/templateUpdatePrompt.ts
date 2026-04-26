import type { WorkspaceTemplateUpdate } from "../types";

export const buildWorkspaceTemplateUpdatePrompt = (
  update: WorkspaceTemplateUpdate,
): string => {
  const label = update.displayName ?? update.appName;
  const currentVersion = update.currentVersion ?? "untracked";

  return [
    `Please update the workspace app "${label}" (${update.appName}) from template version ${currentVersion} to ${update.latestVersion}.`,
    "",
    "Use the read-only template tools `template_app_list` and `template_app_read` to inspect the latest bundled template app, then compare it against the current workspace app before editing.",
    "",
    "Update rules:",
    "- Figure out the relevant template changes by comparing the bundled template app with the workspace app.",
    "- Preserve user data, notes, local configuration, and app-specific content unless the user explicitly asks otherwise.",
    "- After applying the update, update `.lilo/app-updates.json` while preserving existing entries for other apps.",
    `- Set \`apps.${update.appName}.templateVersionApplied\` to "${update.latestVersion}", \`updatedAt\` to the current ISO timestamp, and \`status\` to "applied".`,
    "- Run the smallest relevant validation you can, then summarize exactly what changed.",
  ].join("\n");
};

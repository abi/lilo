import { DefaultResourceLoader } from "@mariozechner/pi-coding-agent";

export const createSystemPromptResourceLoader = async (
  cwd: string,
  systemPrompt: string,
) => {
  const loader = new DefaultResourceLoader({
    cwd,
    systemPromptOverride: () => systemPrompt,
  });

  await loader.reload();
  return loader;
};

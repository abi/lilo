import { MarkdownRenderer } from "../../MarkdownRenderer";

interface CodeViewerProps {
  content: string;
  language: string;
}

const markdownFenceForContent = (content: string): string => {
  const matches = content.match(/`+/g);
  const maxRun = matches?.reduce((max, run) => Math.max(max, run.length), 0) ?? 0;
  return "`".repeat(Math.max(3, maxRun + 1));
};

export function CodeViewer({ content, language }: CodeViewerProps) {
  const fence = markdownFenceForContent(content);
  const markdown = `${fence}${language}\n${content}\n${fence}`;

  return (
    <div className="min-w-0 h-full overflow-hidden rounded border border-neutral-200 bg-white p-2 dark:border-neutral-700 dark:bg-neutral-950">
      <div className="h-full min-w-0 overflow-auto [&_pre]:my-0 [&_pre]:w-full [&_pre]:max-w-full [&_pre]:overflow-auto">
        <MarkdownRenderer content={markdown} />
      </div>
    </div>
  );
}

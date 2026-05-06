const WORKSPACE_FILE_PREFIX = "/workspace-file/";

interface FormatMessagingOutputOptions {
  publicAppUrl?: string | null;
  target?: "plain" | "telegram";
}

const isFenceLine = (line: string): boolean => /^(```|~~~)/.test(line.trim());

const splitMarkdownTableRow = (line: string): string[] => {
  const trimmed = line.trim();
  const withoutOuterPipes = trimmed
    .replace(/^\|/, "")
    .replace(/\|$/, "");

  return withoutOuterPipes
    .split("|")
    .map((cell) => cell.trim())
    .filter((cell) => cell.length > 0);
};

const isMarkdownTableRow = (line: string): boolean =>
  line.includes("|") && splitMarkdownTableRow(line).length >= 2;

const isMarkdownTableSeparator = (line: string): boolean => {
  const cells = splitMarkdownTableRow(line);
  return cells.length >= 2 && cells.every((cell) => /^:?-{3,}:?$/.test(cell.replace(/\s/g, "")));
};

const formatMarkdownTable = (headerLine: string, rowLines: string[]): string => {
  const headers = splitMarkdownTableRow(headerLine);
  const rows = rowLines
    .map(splitMarkdownTableRow)
    .filter((row) => row.length > 0);

  if (headers.length === 0 || rows.length === 0) {
    return [headerLine, ...rowLines].join("\n");
  }

  return rows
    .map((row, rowIndex) => {
      const values = headers
        .map((header, index) => {
          const value = row[index]?.trim();
          return value ? `${header}: ${value}` : null;
        })
        .filter((value): value is string => Boolean(value));

      if (values.length === 0) {
        return "";
      }

      return rows.length === 1
        ? values.map((value) => `- ${value}`).join("\n")
        : `${rowIndex + 1}. ${values.join("; ")}`;
    })
    .filter(Boolean)
    .join("\n");
};

const formatMarkdownTablesForMessaging = (body: string): string => {
  const lines = body.replace(/\r\n/g, "\n").split("\n");
  const output: string[] = [];
  let inFence = false;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];

    if (isFenceLine(line)) {
      inFence = !inFence;
      output.push(line);
      continue;
    }

    if (
      !inFence
      && isMarkdownTableRow(line)
      && index + 1 < lines.length
      && isMarkdownTableSeparator(lines[index + 1])
    ) {
      const rowLines: string[] = [];
      let rowIndex = index + 2;
      while (rowIndex < lines.length && isMarkdownTableRow(lines[rowIndex])) {
        rowLines.push(lines[rowIndex]);
        rowIndex += 1;
      }

      if (rowLines.length > 0) {
        output.push(formatMarkdownTable(line, rowLines));
        index = rowIndex - 1;
        continue;
      }
    }

    output.push(line);
  }

  return output.join("\n");
};

const getWorkspaceFilePath = (href: string): string | null => {
  try {
    const parsed = new URL(href, "https://lilo.local");
    if (!parsed.pathname.startsWith(WORKSPACE_FILE_PREFIX)) {
      return null;
    }

    return decodeURIComponent(parsed.pathname.slice(WORKSPACE_FILE_PREFIX.length)).replace(/^\/+/, "");
  } catch {
    if (!href.startsWith(WORKSPACE_FILE_PREFIX)) {
      return null;
    }

    return decodeURIComponent(href.slice(WORKSPACE_FILE_PREFIX.length)).replace(/^\/+/, "");
  }
};

const encodeWorkspaceFilePath = (path: string): string =>
  path
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");

const getWorkspaceFileUrl = (
  href: string,
  publicAppUrl?: string | null,
): string | null => {
  const workspacePath = getWorkspaceFilePath(href);
  if (!workspacePath) {
    return null;
  }

  if (!publicAppUrl) {
    return workspacePath;
  }

  try {
    const base = new URL(publicAppUrl);
    base.pathname = `${WORKSPACE_FILE_PREFIX}${encodeWorkspaceFilePath(workspacePath)}`;
    base.search = "";
    base.hash = "";
    return base.toString();
  } catch {
    return workspacePath;
  }
};

const formatWorkspaceFileLinksForMessaging = (
  body: string,
  options: FormatMessagingOutputOptions,
): string => {
  const withMarkdownLinks = body.replace(
    /\[([^\]\n]+)\]\((\/workspace-file\/[^)\s]+)\)/g,
    (_match, label: string, href: string) => {
      const target = getWorkspaceFileUrl(href, options.publicAppUrl);
      return target ? `${label}: ${target}` : label;
    },
  );

  return withMarkdownLinks.replace(
    /(^|[\s(])\/workspace-file\/[^\s)]+/g,
    (match, prefix: string) => {
      const href = match.slice(prefix.length);
      const target = getWorkspaceFileUrl(href, options.publicAppUrl);
      return target ? `${prefix}${target}` : match;
    },
  );
};

const escapeTelegramHtml = (value: string): string =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

const formatTelegramInlineMarkdown = (value: string): string => {
  let output = "";
  let index = 0;

  while (index < value.length) {
    const codeStart = value.indexOf("`", index);
    if (codeStart < 0) {
      output += formatTelegramInlineText(value.slice(index));
      break;
    }

    output += formatTelegramInlineText(value.slice(index, codeStart));
    const codeEnd = value.indexOf("`", codeStart + 1);
    if (codeEnd < 0) {
      output += escapeTelegramHtml(value.slice(codeStart));
      break;
    }

    output += `<code>${escapeTelegramHtml(value.slice(codeStart + 1, codeEnd))}</code>`;
    index = codeEnd + 1;
  }

  return output;
};

const formatTelegramInlineText = (value: string): string =>
  escapeTelegramHtml(value)
    .replace(/\[([^\]\n]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2">$1</a>')
    .replace(/\*\*([^*\n][\s\S]*?[^*\n])\*\*/g, "<b>$1</b>")
    .replace(/__([^_\n][\s\S]*?[^_\n])__/g, "<u>$1</u>")
    .replace(/~~([^~\n][\s\S]*?[^~\n])~~/g, "<s>$1</s>")
    .replace(/\*([^*\n][^*\n]*?[^*\n])\*/g, "<b>$1</b>")
    .replace(/_([^_\n][^_\n]*?[^_\n])_/g, "<i>$1</i>")
    .replace(/\|\|([^|\n][\s\S]*?[^|\n])\|\|/g, "<tg-spoiler>$1</tg-spoiler>");

const formatTelegramHtmlForMessaging = (body: string): string => {
  const lines = body.replace(/\r\n/g, "\n").split("\n");
  const output: string[] = [];
  let inFence = false;
  let fenceLines: string[] = [];

  const flushFence = () => {
    output.push(`<pre>${escapeTelegramHtml(fenceLines.join("\n"))}</pre>`);
    fenceLines = [];
  };

  for (const line of lines) {
    if (isFenceLine(line)) {
      if (inFence) {
        flushFence();
        inFence = false;
      } else {
        inFence = true;
        fenceLines = [];
      }
      continue;
    }

    if (inFence) {
      fenceLines.push(line);
      continue;
    }

    const heading = line.match(/^\s{0,3}#{1,6}\s+(.+)$/);
    if (heading) {
      output.push(`<b>${formatTelegramInlineMarkdown(heading[1].trim())}</b>`);
      continue;
    }

    output.push(formatTelegramInlineMarkdown(line));
  }

  if (inFence) {
    flushFence();
  }

  return output.join("\n");
};

export const formatMessagingOutput = (
  body: string,
  options: FormatMessagingOutputOptions = {},
): string => {
  const withoutTables = formatMarkdownTablesForMessaging(body);
  const withWorkspaceLinks = formatWorkspaceFileLinksForMessaging(withoutTables, options);
  if (options.target === "telegram") {
    return formatTelegramHtmlForMessaging(withWorkspaceLinks).trim();
  }
  return withWorkspaceLinks.trim();
};

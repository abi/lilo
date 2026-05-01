const WORKSPACE_FILE_PREFIX = "/workspace-file/";

interface FormatWhatsAppOutputOptions {
  publicAppUrl?: string | null;
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
        ? values.map((value) => `• ${value}`).join("\n")
        : `${rowIndex + 1}. ${values.join("; ")}`;
    })
    .filter(Boolean)
    .join("\n");
};

const formatMarkdownTablesForWhatsApp = (body: string): string => {
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

const formatWorkspaceFileLinksForWhatsApp = (
  body: string,
  options: FormatWhatsAppOutputOptions,
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

export const formatWhatsAppOutput = (
  body: string,
  options: FormatWhatsAppOutputOptions = {},
): string => {
  const withoutTables = formatMarkdownTablesForWhatsApp(body);
  return formatWorkspaceFileLinksForWhatsApp(withoutTables, options).trim();
};

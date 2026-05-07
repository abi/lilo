const WORKSPACE_FILE_PREFIX = "/workspace-file/";
const WORKSPACE_APP_PREFIX = "/workspace/";
const MAX_LINK_BUTTONS = 4;
const MAX_LINK_BUTTON_TEXT_LENGTH = 64;

interface FormatMessagingOutputOptions {
  linkBrokerUrl?: string | null;
  publicAppUrl?: string | null;
  target?: "plain" | "telegram";
}

export interface MessagingLinkButton {
  text: string;
  url: string;
}

export interface TelegramMessagingOutput {
  text: string;
  linkButtons: MessagingLinkButton[];
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

const isWorkspaceViewerPath = (pathname: string): boolean =>
  pathname.startsWith(WORKSPACE_FILE_PREFIX) || pathname.startsWith(WORKSPACE_APP_PREFIX);

const getWorkspaceViewerPath = (href: string): string | null => {
  try {
    const parsed = new URL(href, "https://lilo.local");
    if (!isWorkspaceViewerPath(parsed.pathname)) {
      return null;
    }

    return decodeURIComponent(parsed.pathname).replace(/^\/+/, "");
  } catch {
    if (!isWorkspaceViewerPath(href)) {
      return null;
    }

    return decodeURIComponent(href).replace(/^\/+/, "");
  }
};

const encodeWorkspaceFilePath = (path: string): string =>
  path
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");

const getWorkspaceViewerUrl = (
  href: string,
  publicAppUrl?: string | null,
): string | null => {
  const viewerPath = getWorkspaceViewerPath(href);
  if (!viewerPath) {
    return null;
  }

  if (!publicAppUrl) {
    return `/${viewerPath}`;
  }

  try {
    const base = new URL(publicAppUrl);
    base.pathname = `/${encodeWorkspaceFilePath(viewerPath)}`;
    base.search = "";
    base.hash = "";
    return base.toString();
  } catch {
    return `/${viewerPath}`;
  }
};

const getWorkspaceBrokerUrl = (
  href: string,
  options: FormatMessagingOutputOptions,
): string | null => {
  if (options.target !== "telegram" || !options.linkBrokerUrl || !options.publicAppUrl) {
    return null;
  }

  const viewerPath = getWorkspaceViewerPath(href);
  if (!viewerPath) {
    return null;
  }

  try {
    const brokerUrl = new URL(options.linkBrokerUrl);
    brokerUrl.pathname = "/open";
    brokerUrl.search = "";
    brokerUrl.hash = "";
    brokerUrl.searchParams.set("workspace", options.publicAppUrl);
    brokerUrl.searchParams.set("viewer", `/${viewerPath}`);
    return brokerUrl.toString();
  } catch {
    return null;
  }
};

const getWorkspaceMessagingUrl = (
  href: string,
  options: FormatMessagingOutputOptions,
): string | null =>
  getWorkspaceBrokerUrl(href, options) ?? getWorkspaceViewerUrl(href, options.publicAppUrl);

const formatWorkspaceLinksForMessaging = (
  body: string,
  options: FormatMessagingOutputOptions,
): string => {
  const withMarkdownLinks = body.replace(
    /\[([^\]\n]+)\]\((\/workspace(?:-file)?\/[^)\s]+)\)/g,
    (_match, label: string, href: string) => {
      const target = getWorkspaceMessagingUrl(href, options);
      if (!target) {
        return label;
      }

      return options.target === "telegram" && /^https?:\/\//.test(target)
        ? `[${label}](${target})`
        : `${label}: ${target}`;
    },
  );

  return withMarkdownLinks.replace(
    /(^|[\s(])\/workspace(?:-file)?\/[^\s)]+/g,
    (match, prefix: string) => {
      const href = match.slice(prefix.length);
      const target = getWorkspaceMessagingUrl(href, options);
      return target ? `${prefix}${target}` : match;
    },
  );
};

const normalizeButtonText = (label: string): string =>
  label
    .replace(/[`*_~|[\]()]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_LINK_BUTTON_TEXT_LENGTH);

const isAllowedWorkspaceLinkUrl = (
  url: string,
  options: FormatMessagingOutputOptions,
): boolean => {
  try {
    const parsed = new URL(url);
    if (options.linkBrokerUrl) {
      const brokerUrl = new URL(options.linkBrokerUrl);
      if (parsed.origin === brokerUrl.origin && parsed.pathname === "/open") {
        return Boolean(parsed.searchParams.get("workspace") && parsed.searchParams.get("viewer"));
      }
    }

    if (!isWorkspaceViewerPath(parsed.pathname)) {
      return false;
    }

    return !options.publicAppUrl || parsed.origin === new URL(options.publicAppUrl).origin;
  } catch {
    return false;
  }
};

const extractWorkspaceLinkButtons = (
  body: string,
  options: FormatMessagingOutputOptions,
): MessagingLinkButton[] => {
  const buttons: MessagingLinkButton[] = [];
  const seen = new Set<string>();
  const addButton = (label: string, url: string) => {
    if (buttons.length >= MAX_LINK_BUTTONS || seen.has(url)) {
      return;
    }

    if (!isAllowedWorkspaceLinkUrl(url, options)) {
      return;
    }

    const text = normalizeButtonText(label);
    if (!text) {
      return;
    }

    seen.add(url);
    buttons.push({ text, url });
  };

  body.replace(/\[([^\]\n]+)\]\((https?:\/\/[^)\s]+)\)/g, (_match, label: string, url: string) => {
    addButton(label, url);
    return _match;
  });

  body.replace(
    /(?:^|\n)\s*(?:[-*]\s*)?([^:\n]{1,80}):\s*(https?:\/\/[^\s)]+)(?=\s*(?:\n|$))/g,
    (_match, label: string, url: string) => {
      addButton(label, url);
      return _match;
    },
  );

  return buttons;
};

const removeStandaloneWorkspaceLinkLines = (
  body: string,
  buttons: MessagingLinkButton[],
): string => {
  if (buttons.length === 0) {
    return body;
  }

  const buttonUrls = new Set(buttons.map((button) => button.url));
  return body
    .replace(/\r\n/g, "\n")
    .split("\n")
    .filter((line) => {
      const trimmed = line.trim();
      const markdownMatch = trimmed.match(/^(?:[-*]\s*)?\[([^\]\n]+)\]\((https?:\/\/[^)\s]+)\)$/);
      if (markdownMatch) {
        return !buttonUrls.has(markdownMatch[2]);
      }

      const labelUrlMatch = trimmed.match(/^(?:[-*]\s*)?([^:\n]{1,80}):\s*(https?:\/\/[^\s)]+)$/);
      if (labelUrlMatch) {
        return !buttonUrls.has(labelUrlMatch[2]);
      }

      return true;
    })
    .join("\n")
    .replace(/\n{3,}/g, "\n\n");
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
  const withWorkspaceLinks = formatWorkspaceLinksForMessaging(withoutTables, options);
  if (options.target === "telegram") {
    return formatTelegramHtmlForMessaging(withWorkspaceLinks).trim();
  }
  return withWorkspaceLinks.trim();
};

export const formatTelegramMessagingOutput = (
  body: string,
  options: FormatMessagingOutputOptions = {},
): TelegramMessagingOutput => {
  const withoutTables = formatMarkdownTablesForMessaging(body);
  const withWorkspaceLinks = formatWorkspaceLinksForMessaging(withoutTables, {
    ...options,
    target: "telegram",
  });
  const linkButtons = extractWorkspaceLinkButtons(withWorkspaceLinks, options);
  const textBody = removeStandaloneWorkspaceLinkLines(withWorkspaceLinks, linkButtons);
  const text = formatTelegramHtmlForMessaging(textBody).trim();

  return {
    text: text || (linkButtons.length > 0 ? "Open in Lilo:" : ""),
    linkButtons,
  };
};

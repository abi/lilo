import {
  Children,
  isValidElement,
  useState,
  type ComponentPropsWithoutRef,
  type ReactNode,
} from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { WorkspaceAppLink, WorkspaceEntry } from "./workspace/types";

interface MarkdownRendererProps {
  content: string;
  /**
   * The current workspace viewer path for the document being rendered. Used
   * to resolve relative links like `./foo.md` or `../sibling/bar.md`.
   */
  basePath?: string | null;
  onOpenWorkspacePath?: (viewerPath: string) => void;
  workspaceEntries?: WorkspaceEntry[];
  workspaceApps?: Pick<WorkspaceAppLink, "href" | "viewerPath">[];
  linkPlainWorkspacePaths?: boolean;
}

const isExternalHref = (href: string): boolean =>
  /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(href) || href.startsWith("//");

const encodeWorkspacePath = (path: string): string =>
  path
    .split("/")
    .map((segment) => (segment.length === 0 ? "" : encodeURIComponent(segment)))
    .join("/");

const normalizePlainWorkspacePath = (value: string): string =>
  value
    .trim()
    .replace(/^['"`]+|['"`]+$/g, "")
    .replace(/^[./]+/, "")
    .replace(/[),.;:!?]+$/g, "");

const PLAIN_WORKSPACE_PATH_PATTERN =
  /(?<![\w/-])(?:\.\/)?[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)+(?::\d+)?/g;

const resolveWorkspaceAppViewerPath = (
  path: string,
  workspaceApps: Pick<WorkspaceAppLink, "href" | "viewerPath">[],
): string | null =>
  workspaceApps.find((app) => path === app.href || path === app.viewerPath)?.viewerPath ?? null;

interface MarkdownAstNode {
  type?: string;
  value?: string;
  url?: string;
  children?: MarkdownAstNode[];
  [key: string]: unknown;
}

type RemarkPlugin = () => (tree: MarkdownAstNode) => void;

/**
 * Turn an href found in rendered markdown into a workspace viewer path if it
 * points inside the workspace; return `null` otherwise (external / mailto /
 * hash-only / etc.).
 *
 * `basePath` is the current document's workspace viewer path (e.g.
 * `/workspace-file/memory/index.md`); it's used to resolve relative links.
 */
const normalizeWorkspaceViewerPath = (
  href: string,
  basePath?: string | null,
  workspaceApps: Pick<WorkspaceAppLink, "href" | "viewerPath">[] = [],
): string | null => {
  const raw = href.trim();
  if (
    raw.length === 0 ||
    raw.startsWith("#") ||
    raw.startsWith("mailto:") ||
    raw.startsWith("tel:") ||
    raw.startsWith("javascript:")
  ) {
    return null;
  }

  // Strip any trailing hash/query on the href; we don't forward them today.
  const withoutHash = raw.split("#", 1)[0];
  const withoutQuery = withoutHash.split("?", 1)[0];
  if (!withoutQuery) {
    return null;
  }

  try {
    const url = new URL(withoutQuery);
    if (
      url.pathname.startsWith("/workspace-file/") ||
      url.pathname.startsWith("/workspace/")
    ) {
      return resolveWorkspaceAppViewerPath(url.pathname, workspaceApps) ?? url.pathname;
    }
  } catch {
    /* not an absolute URL */
  }

  if (isExternalHref(raw)) {
    return null;
  }

  // Absolute workspace paths already target the viewer.
  if (
    withoutQuery.startsWith("/workspace-file/") ||
    withoutQuery.startsWith("/workspace/")
  ) {
    return resolveWorkspaceAppViewerPath(withoutQuery, workspaceApps) ?? withoutQuery;
  }

  const isRelative =
    withoutQuery.startsWith("./") ||
    withoutQuery.startsWith("../") ||
    !withoutQuery.startsWith("/");

  if (isRelative && basePath) {
    try {
      const base = new URL(basePath, "https://lilo.local");
      const resolved = new URL(withoutQuery, base);
      const path = resolved.pathname;
      if (
        path.startsWith("/workspace-file/") ||
        path.startsWith("/workspace/")
      ) {
        return resolveWorkspaceAppViewerPath(path, workspaceApps) ?? path;
      }
    } catch {
      /* ignore malformed input */
    }
    return null;
  }

  // Root-relative paths without a /workspace prefix — assume workspace file.
  const normalizedRelativePath = withoutQuery.replace(/^\/+/, "");
  if (!normalizedRelativePath.includes("/")) {
    return null;
  }
  return `/workspace-file/${encodeWorkspacePath(normalizedRelativePath)}`;
};

const MarkdownCode = ({
  className,
  children,
  ...props
}: ComponentPropsWithoutRef<"code">) => {
  const isBlock = Boolean(className);

  if (isBlock) {
    return (
      <code className={`font-mono text-sm ${className ?? ""}`.trim()} {...props}>
        {children}
      </code>
    );
  }

  return (
    <code
      className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-[0.95em] text-neutral-800 dark:bg-neutral-800 dark:text-neutral-200"
      {...props}
    >
      {children}
    </code>
  );
};

const extractText = (node: ReactNode): string => {
  if (typeof node === "string" || typeof node === "number") {
    return String(node);
  }

  if (Array.isArray(node)) {
    return node.map(extractText).join("");
  }

  if (isValidElement<{ children?: ReactNode }>(node)) {
    return extractText(node.props.children);
  }

  return "";
};

const copyText = async (text: string) => {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return;
    }
  } catch {
    // Fall back below when clipboard permissions block the modern API.
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  textarea.style.top = "0";
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  const didCopy = document.execCommand("copy");
  textarea.remove();

  if (!didCopy) {
    throw new Error("Copy command failed");
  }
};

const MarkdownPre = ({
  children,
  ...props
}: ComponentPropsWithoutRef<"pre">) => {
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "failed">("idle");
  const codeText = extractText(Children.toArray(children)).replace(/\n$/, "");
  const copyLabel =
    copyStatus === "copied" ? "Copied" : copyStatus === "failed" ? "Copy failed" : "Copy";

  return (
    <div className="group/code my-4 overflow-hidden rounded-xl border border-neutral-200 bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-900">
      <div className="flex items-center justify-end border-b border-neutral-200 bg-white/75 px-2 py-1.5 dark:border-neutral-700 dark:bg-neutral-950/40">
        <button
          type="button"
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            void copyText(codeText)
              .then(() => setCopyStatus("copied"))
              .catch(() => setCopyStatus("failed"))
              .finally(() => {
                window.setTimeout(() => setCopyStatus("idle"), 1400);
              });
          }}
          className={`rounded-lg border bg-white/90 px-2.5 py-1 text-xs font-bold shadow-sm backdrop-blur transition focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-neutral-950/90 ${
            copyStatus === "failed"
              ? "border-red-300 text-red-600 dark:border-red-900 dark:text-red-300"
              : "border-neutral-300 text-neutral-600 hover:border-neutral-400 hover:text-neutral-950 dark:border-neutral-700 dark:text-neutral-300 dark:hover:border-neutral-500 dark:hover:text-white"
          }`}
          aria-label="Copy code"
        >
          {copyLabel}
        </button>
      </div>
      <pre
        className="overflow-x-auto p-4"
        {...props}
      >
        {children}
      </pre>
    </div>
  );
};

const linkablePlainTextParentTypes = new Set([
  "paragraph",
  "heading",
  "listItem",
  "tableCell",
  "blockquote",
  "strong",
  "emphasis",
  "delete",
]);

const createWorkspacePathLinkPlugin = (
  workspaceViewerPathByRelativePath: Map<string, string>,
): RemarkPlugin => () => {
  const linkTextNode = (node: MarkdownAstNode): MarkdownAstNode[] => {
    const text = node.value ?? "";
    const parts: MarkdownAstNode[] = [];
    let lastIndex = 0;

    for (const match of text.matchAll(PLAIN_WORKSPACE_PATH_PATTERN)) {
      const rawPath = match[0];
      const index = match.index ?? 0;
      const normalized = normalizePlainWorkspacePath(rawPath.replace(/:\d+$/, ""));
      const viewerPath = workspaceViewerPathByRelativePath.get(normalized);
      if (!viewerPath) {
        continue;
      }

      if (index > lastIndex) {
        parts.push({ type: "text", value: text.slice(lastIndex, index) });
      }

      parts.push({
        type: "link",
        url: viewerPath,
        children: [{ type: "text", value: rawPath }],
      });
      lastIndex = index + rawPath.length;
    }

    if (parts.length === 0) {
      return [node];
    }

    if (lastIndex < text.length) {
      parts.push({ type: "text", value: text.slice(lastIndex) });
    }

    return parts;
  };

  const visit = (node: MarkdownAstNode) => {
    if (!node.children) {
      return;
    }

    node.children = node.children.flatMap((child) => {
      if (
        child.type === "text" &&
        node.type &&
        linkablePlainTextParentTypes.has(node.type)
      ) {
        return linkTextNode(child);
      }

      if (child.type !== "link" && child.type !== "inlineCode" && child.type !== "code") {
        visit(child);
      }

      return [child];
    });
  };

  return visit;
};

export function MarkdownRenderer({
  content,
  basePath,
  onOpenWorkspacePath,
  workspaceEntries = [],
  workspaceApps = [],
  linkPlainWorkspacePaths = false,
}: MarkdownRendererProps) {
  const workspaceViewerPathByRelativePath = new Map(
    workspaceEntries.flatMap((entry) =>
      entry.viewerPath && entry.kind !== "app" && entry.kind !== "directory"
        ? [[entry.relativePath, entry.viewerPath] as const]
        : [],
    ),
  );
  const remarkPlugins =
    linkPlainWorkspacePaths && workspaceViewerPathByRelativePath.size > 0
      ? [remarkGfm, createWorkspacePathLinkPlugin(workspaceViewerPathByRelativePath)]
      : [remarkGfm];

  return (
    <div className="markdown-content text-inherit">
      <ReactMarkdown
        remarkPlugins={remarkPlugins}
        components={{
          h1: ({ children, ...props }: ComponentPropsWithoutRef<"h1">) => (
            <h1 className="mb-4 mt-6 text-3xl font-semibold leading-tight first:mt-0" {...props}>
              {children}
            </h1>
          ),
          h2: ({ children, ...props }: ComponentPropsWithoutRef<"h2">) => (
            <h2 className="mb-3 mt-6 text-2xl font-semibold leading-tight first:mt-0" {...props}>
              {children}
            </h2>
          ),
          h3: ({ children, ...props }: ComponentPropsWithoutRef<"h3">) => (
            <h3 className="mb-2 mt-5 text-xl font-semibold leading-snug first:mt-0" {...props}>
              {children}
            </h3>
          ),
          h4: ({ children, ...props }: ComponentPropsWithoutRef<"h4">) => (
            <h4 className="mb-2 mt-4 text-lg font-semibold leading-snug first:mt-0" {...props}>
              {children}
            </h4>
          ),
          p: ({ children, ...props }: ComponentPropsWithoutRef<"p">) => (
            <p className="my-4 leading-relaxed first:mt-0 last:mb-0" {...props}>
              {children}
            </p>
          ),
          ul: ({ children, ...props }: ComponentPropsWithoutRef<"ul">) => (
            <ul className="my-4 list-disc space-y-1 pl-6" {...props}>
              {children}
            </ul>
          ),
          ol: ({ children, ...props }: ComponentPropsWithoutRef<"ol">) => (
            <ol className="my-4 list-decimal space-y-1 pl-6" {...props}>
              {children}
            </ol>
          ),
          li: ({ children, ...props }: ComponentPropsWithoutRef<"li">) => (
            <li className="pl-1 leading-relaxed" {...props}>
              {children}
            </li>
          ),
          blockquote: ({ children, ...props }: ComponentPropsWithoutRef<"blockquote">) => (
            <blockquote
              className="my-4 border-l-4 border-neutral-300 pl-4 italic text-neutral-700 dark:border-neutral-700 dark:text-neutral-300"
              {...props}
            >
              {children}
            </blockquote>
          ),
          hr: (props: ComponentPropsWithoutRef<"hr">) => (
            <hr className="my-6 border-0 border-t border-neutral-200 dark:border-neutral-700" {...props} />
          ),
          pre: MarkdownPre,
          code: MarkdownCode,
          table: ({ children, ...props }: ComponentPropsWithoutRef<"table">) => (
            <div className="my-4 overflow-x-auto">
              <table className="w-full border-collapse text-left text-sm" {...props}>
                {children}
              </table>
            </div>
          ),
          th: ({ children, ...props }: ComponentPropsWithoutRef<"th">) => (
            <th
              className="border-b border-neutral-200 px-3 py-2 font-semibold dark:border-neutral-700"
              {...props}
            >
              {children}
            </th>
          ),
          td: ({ children, ...props }: ComponentPropsWithoutRef<"td">) => (
            <td
              className="border-b border-neutral-200 px-3 py-2 dark:border-neutral-800"
              {...props}
            >
              {children}
            </td>
          ),
          a: ({ children, href, onClick, ...props }: ComponentPropsWithoutRef<"a">) => {
            const workspaceViewerPath =
              typeof href === "string"
                ? normalizeWorkspaceViewerPath(href, basePath, workspaceApps)
                : null;
            const openInViewer = Boolean(workspaceViewerPath && onOpenWorkspacePath);

            return (
              <a
                className="text-blue-600 underline underline-offset-2 dark:text-blue-400"
                href={href}
                target={openInViewer ? undefined : "_blank"}
                rel={openInViewer ? undefined : "noreferrer"}
                onClick={(event) => {
                  onClick?.(event);
                  if (event.defaultPrevented || !workspaceViewerPath || !onOpenWorkspacePath) {
                    return;
                  }

                  event.preventDefault();
                  onOpenWorkspacePath(workspaceViewerPath);
                }}
                {...props}
              >
                {children}
              </a>
            );
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

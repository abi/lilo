import type { ComponentPropsWithoutRef } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface MarkdownRendererProps {
  content: string;
  /**
   * The current workspace viewer path for the document being rendered. Used
   * to resolve relative links like `./foo.md` or `../sibling/bar.md`.
   */
  basePath?: string | null;
  onOpenWorkspacePath?: (viewerPath: string) => void;
}

const isExternalHref = (href: string): boolean =>
  /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(href) || href.startsWith("//");

const encodeWorkspacePath = (path: string): string =>
  path
    .split("/")
    .map((segment) => (segment.length === 0 ? "" : encodeURIComponent(segment)))
    .join("/");

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
): string | null => {
  const raw = href.trim();
  if (
    raw.length === 0 ||
    raw.startsWith("#") ||
    raw.startsWith("mailto:") ||
    raw.startsWith("tel:") ||
    raw.startsWith("javascript:") ||
    isExternalHref(raw)
  ) {
    return null;
  }

  // Strip any trailing hash/query on the href; we don't forward them today.
  const withoutHash = raw.split("#", 1)[0];
  const withoutQuery = withoutHash.split("?", 1)[0];
  if (!withoutQuery) {
    return null;
  }

  // Absolute workspace paths already target the viewer.
  if (
    withoutQuery.startsWith("/workspace-file/") ||
    withoutQuery.startsWith("/workspace/")
  ) {
    return withoutQuery;
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
        return path;
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

export function MarkdownRenderer({
  content,
  basePath,
  onOpenWorkspacePath,
}: MarkdownRendererProps) {
  return (
    <div className="markdown-content text-inherit">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
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
          pre: ({ children, ...props }: ComponentPropsWithoutRef<"pre">) => (
            <pre
              className="my-4 overflow-x-auto rounded-xl border border-neutral-200 bg-neutral-50 p-4 dark:border-neutral-700 dark:bg-neutral-900"
              {...props}
            >
              {children}
            </pre>
          ),
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
                ? normalizeWorkspaceViewerPath(href, basePath)
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

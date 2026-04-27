import { Type } from "@mariozechner/pi-ai";
import type { AgentToolResult, ToolDefinition } from "@mariozechner/pi-coding-agent";
import { backendConfig, requireConfigValue } from "../config/config.js";

const FIRECRAWL_API_BASE_URL = "https://api.firecrawl.dev/v2";
const DEFAULT_SEARCH_LIMIT = 5;
const MAX_SEARCH_LIMIT = 10;
const MAX_MARKDOWN_CHARS = 12_000;

type FirecrawlSearchResult = {
  title?: string;
  description?: string;
  url?: string;
  markdown?: string;
  metadata?: {
    title?: string;
    description?: string;
    sourceURL?: string;
    url?: string;
    statusCode?: number;
    error?: string;
  };
};

type FirecrawlSearchResponse = {
  success?: boolean;
  data?: {
    web?: FirecrawlSearchResult[];
    news?: FirecrawlSearchResult[];
  };
  warning?: string | null;
  id?: string;
  creditsUsed?: number;
};

type FirecrawlScrapeResponse = {
  success?: boolean;
  data?: {
    markdown?: string;
    summary?: string;
    metadata?: {
      title?: string;
      description?: string;
      sourceURL?: string;
      url?: string;
      statusCode?: number;
      error?: string;
    };
    links?: string[];
  };
};

type WebSearchDetails = {
  query: string;
  limit: number;
  warning: string | null;
  searchId: string | null;
  creditsUsed: number | null;
  results: Array<{
    title: string;
    description: string;
    url: string;
    source: "web" | "news";
    markdown?: string;
  }>;
};

type WebScrapeDetails = {
  url: string;
  title: string | null;
  description: string | null;
  sourceUrl: string | null;
  statusCode: number | null;
  markdown: string;
  truncated: boolean;
  links: string[];
};

const createTextResult = <TDetails>(
  text: string,
  details: TDetails,
): AgentToolResult<TDetails> => ({
  content: [{ type: "text", text }],
  details,
});

const getRequiredFirecrawlApiKey = (): string => {
  return requireConfigValue(
    backendConfig.tools.firecrawl.apiKey,
    "FIRECRAWL_API_KEY",
  );
};

const dedupeStrings = (value: unknown): string[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return [
    ...new Set(
      value
        .filter((entry): entry is string => typeof entry === "string")
        .map((entry) => entry.trim())
        .filter(Boolean),
    ),
  ];
};

const truncateText = (value: string, maxChars: number): { text: string; truncated: boolean } => {
  if (value.length <= maxChars) {
    return { text: value, truncated: false };
  }

  return {
    text: `${value.slice(0, maxChars).trimEnd()}\n\n[truncated]`,
    truncated: true,
  };
};

const jsonText = async (response: Response): Promise<string> => {
  try {
    return JSON.stringify((await response.json()) as unknown);
  } catch {
    return await response.text();
  }
};

const firecrawlFetch = async <T>(
  path: string,
  body: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<T> => {
  const apiKey = getRequiredFirecrawlApiKey();
  const response = await fetch(`${FIRECRAWL_API_BASE_URL}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    signal,
  });

  if (!response.ok) {
    throw new Error(`Firecrawl request failed: ${response.status} ${await jsonText(response)}`);
  }

  return (await response.json()) as T;
};

const normalizeSearchResults = (
  payload: FirecrawlSearchResponse,
): WebSearchDetails["results"] => {
  const sources: Array<["web" | "news", FirecrawlSearchResult[] | undefined]> = [
    ["web", payload.data?.web],
    ["news", payload.data?.news],
  ];

  return sources.flatMap(([source, results]) =>
    (results ?? [])
      .filter((result) => typeof result.url === "string" && result.url.trim().length > 0)
      .map((result) => ({
        title:
          result.title?.trim() ||
          result.metadata?.title?.trim() ||
          "(untitled result)",
        description:
          result.description?.trim() ||
          result.metadata?.description?.trim() ||
          "",
        url: result.url!.trim(),
        source,
        markdown: typeof result.markdown === "string" ? result.markdown : undefined,
      })),
  );
};

export const webSearchTool: ToolDefinition = {
  name: "web_search",
  label: "Web Search",
  description:
    "Search the web for relevant pages using Firecrawl. Use this first when you need discovery, current references, or likely source URLs before scraping.",
  promptSnippet:
    "web_search: search the web for relevant pages and return compact results with titles, URLs, snippets, and optionally scraped markdown.",
  parameters: Type.Object({
    query: Type.String({
      description: "Search query to run against the web.",
      minLength: 1,
    }),
    limit: Type.Optional(
      Type.Number({
        description: "Maximum number of results to return. Keep this small unless broader discovery is necessary.",
      }),
    ),
    scrape_results: Type.Optional(
      Type.Boolean({
        description: "Whether to also scrape markdown content for each result. Use only when you need content immediately.",
      }),
    ),
  }),
  async execute(_toolCallId, params, signal) {
    const query = String((params as { query?: string }).query ?? "").trim();
    const requestedLimit = Number((params as { limit?: number }).limit ?? DEFAULT_SEARCH_LIMIT);
    const limit = Math.min(
      MAX_SEARCH_LIMIT,
      Math.max(1, Number.isFinite(requestedLimit) ? Math.trunc(requestedLimit) : DEFAULT_SEARCH_LIMIT),
    );
    const scrapeResults = Boolean((params as { scrape_results?: boolean }).scrape_results ?? false);

    if (!query) {
      return createTextResult<WebSearchDetails>("No valid search query was provided.", {
        query: "",
        limit,
        warning: null,
        searchId: null,
        creditsUsed: null,
        results: [],
      });
    }

    const payload = await firecrawlFetch<FirecrawlSearchResponse>(
      "/search",
      {
        query,
        limit,
        sources: ["web"],
        ignoreInvalidURLs: true,
        ...(scrapeResults
          ? {
              scrapeOptions: {
                formats: ["markdown"],
                onlyMainContent: true,
              },
            }
          : {}),
      },
      signal,
    );

    const results = normalizeSearchResults(payload);
    const text =
      results.length === 0
        ? `No search results were found for "${query}".`
        : [
            `Search results for "${query}":`,
            "",
            ...results.map((result, index) => {
              const lines = [`${index + 1}. ${result.title}`, `URL: ${result.url}`];
              if (result.description) {
                lines.push(`Summary: ${result.description}`);
              }
              if (scrapeResults && result.markdown) {
                const preview = truncateText(result.markdown, 1000).text;
                lines.push(`Content Preview:\n${preview}`);
              }
              return lines.join("\n");
            }),
          ].join("\n\n");

    return createTextResult<WebSearchDetails>(text, {
      query,
      limit,
      warning: payload.warning ?? null,
      searchId: payload.id ?? null,
      creditsUsed: typeof payload.creditsUsed === "number" ? payload.creditsUsed : null,
      results,
    });
  },
};

export const webScrapeTool: ToolDefinition = {
  name: "web_scrape",
  label: "Web Scrape",
  description:
    "Scrape a known URL using Firecrawl and return clean markdown plus metadata. Use this after discovery when you need the page contents.",
  promptSnippet:
    "web_scrape: fetch a known URL and return clean markdown content plus source metadata.",
  parameters: Type.Object({
    url: Type.String({
      description: "The absolute URL to scrape.",
      minLength: 1,
    }),
  }),
  async execute(_toolCallId, params, signal) {
    const url = String((params as { url?: string }).url ?? "").trim();

    if (!url) {
      return createTextResult<WebScrapeDetails>("No valid URL was provided.", {
        url: "",
        title: null,
        description: null,
        sourceUrl: null,
        statusCode: null,
        markdown: "",
        truncated: false,
        links: [],
      });
    }

    const payload = await firecrawlFetch<FirecrawlScrapeResponse>(
      "/scrape",
      {
        url,
        formats: ["markdown", "links"],
        onlyMainContent: true,
      },
      signal,
    );

    const markdown = payload.data?.markdown?.trim() ?? "";
    const { text: truncatedMarkdown, truncated } = truncateText(markdown, MAX_MARKDOWN_CHARS);
    const metadata = payload.data?.metadata;
    const title = metadata?.title?.trim() || null;
    const description = metadata?.description?.trim() || null;
    const sourceUrl = metadata?.sourceURL?.trim() || metadata?.url?.trim() || url;
    const statusCode = typeof metadata?.statusCode === "number" ? metadata.statusCode : null;
    const links = dedupeStrings(payload.data?.links).slice(0, 50);

    const text = [
      title ? `Title: ${title}` : `Source: ${sourceUrl}`,
      description ? `Description: ${description}` : null,
      statusCode ? `Status: ${statusCode}` : null,
      "",
      truncatedMarkdown || "No markdown content was returned.",
    ]
      .filter((line): line is string => Boolean(line))
      .join("\n");

    return createTextResult<WebScrapeDetails>(text, {
      url,
      title,
      description,
      sourceUrl,
      statusCode,
      markdown: truncatedMarkdown,
      truncated,
      links,
    });
  },
};

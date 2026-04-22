const BLOCK_TAGS = new Set([
  "ADDRESS",
  "ARTICLE",
  "ASIDE",
  "BLOCKQUOTE",
  "DIV",
  "DL",
  "FIELDSET",
  "FIGCAPTION",
  "FIGURE",
  "FOOTER",
  "FORM",
  "H1",
  "H2",
  "H3",
  "H4",
  "H5",
  "H6",
  "HEADER",
  "HR",
  "LI",
  "MAIN",
  "NAV",
  "OL",
  "P",
  "PRE",
  "SECTION",
  "TABLE",
  "TR",
  "UL",
]);

const normalizeCopiedText = (value: string): string =>
  value
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

const serializeCopiedNode = (node: Node): string => {
  if (node.nodeType === Node.TEXT_NODE) {
    return node.textContent ?? "";
  }

  if (node.nodeType !== Node.ELEMENT_NODE) {
    return "";
  }

  const element = node as HTMLElement;
  const tagName = element.tagName;

  if (tagName === "BR") {
    return "\n";
  }

  if (tagName === "IMG") {
    return element.getAttribute("alt")?.trim() ?? "";
  }

  if (tagName === "LI") {
    const itemText = Array.from(element.childNodes)
      .map(serializeCopiedNode)
      .join("");

    return `• ${itemText.trim()}\n`;
  }

  const content = Array.from(element.childNodes)
    .map(serializeCopiedNode)
    .join("");

  if (tagName === "PRE") {
    return `\n${content.replace(/\n+$/g, "")}\n`;
  }

  if (BLOCK_TAGS.has(tagName)) {
    return `${content}\n`;
  }

  return content;
};

const normalizeCopiedHtmlFragment = (container: HTMLDivElement) => {
  container.querySelectorAll("[class], [data-streamdown]").forEach((element) => {
    element.removeAttribute("class");
    element.removeAttribute("data-streamdown");
  });
};

export const getNormalizedSelectionText = (selection: Selection): string => {
  if (selection.rangeCount === 0) {
    return "";
  }

  const fragment = selection.getRangeAt(0).cloneContents();
  const serialized = Array.from(fragment.childNodes)
    .map(serializeCopiedNode)
    .join("");

  return normalizeCopiedText(serialized);
};

export const getSelectionHtml = (selection: Selection): string => {
  if (selection.rangeCount === 0) {
    return "";
  }

  const fragment = selection.getRangeAt(0).cloneContents();
  const container = document.createElement("div");
  container.appendChild(fragment);
  normalizeCopiedHtmlFragment(container);
  return container.innerHTML;
};

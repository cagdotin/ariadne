import type { ContentBlock, TextContent } from "../types";

export function extract_text(content: string | ContentBlock[]): string {
  if (typeof content === "string") return content;
  return content
    .filter((c): c is TextContent => c.type === "text" && Boolean(c.text))
    .map((c) => c.text)
    .join("");
}

export function has_text_content(content: string | ContentBlock[]): boolean {
  return extract_text(content).trim().length > 0;
}

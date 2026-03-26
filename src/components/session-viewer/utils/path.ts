export function shorten_path(p: unknown): string {
  if (typeof p !== "string") return "";
  if (p.startsWith("/Users/")) {
    const parts = p.split("/");
    if (parts.length > 2) return "~" + p.slice(("/Users/" + parts[2]).length);
  }
  if (p.startsWith("/home/")) {
    const parts = p.split("/");
    if (parts.length > 2) return "~" + p.slice(("/home/" + parts[2]).length);
  }
  return p;
}

export function get_language_from_path(file_path: string): string | undefined {
  const ext = file_path.split(".").pop()?.toLowerCase();
  const map: Record<string, string> = {
    ts: "typescript", tsx: "typescript", js: "javascript", jsx: "javascript",
    py: "python", rb: "ruby", rs: "rust", go: "go", java: "java",
    c: "c", cpp: "cpp", h: "c", hpp: "cpp", cs: "csharp",
    php: "php", sh: "bash", bash: "bash", zsh: "bash",
    sql: "sql", html: "html", css: "css", scss: "scss",
    json: "json", yaml: "yaml", yml: "yaml", xml: "xml",
    md: "markdown", dockerfile: "dockerfile", toml: "toml",
    graphql: "graphql", swift: "swift", kt: "kotlin",
  };
  return ext ? map[ext] : undefined;
}

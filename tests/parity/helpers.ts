import { readFileSync } from "node:fs";
import { join } from "node:path";

const GOLDEN_ROOT = join(process.cwd(), "fixtures", "migration", "golden");
const FIXTURES_ROOT = join(process.cwd(), "fixtures", "migration");

export function read_golden(relative_path: string): unknown {
  const full_path = join(GOLDEN_ROOT, relative_path);
  const content = readFileSync(full_path, "utf-8");
  return JSON.parse(content);
}

export function fixtures_path(...segments: string[]): string {
  return join(FIXTURES_ROOT, ...segments);
}

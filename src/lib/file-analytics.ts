import type {
	FileInsightRecord,
	FileSizeResult,
} from "@contracts/analytics/files";
import type { NameCount } from "@contracts/shared";

// ── Operation Lens ─────────────────────────────────────────────────────

export type OperationLens = "all" | "read" | "edit" | "write";

export const OPERATION_LENS_OPTIONS: { label: string; value: OperationLens }[] =
	[
		{ label: "All", value: "all" },
		{ label: "Read", value: "read" },
		{ label: "Edit", value: "edit" },
		{ label: "Write", value: "write" },
	];

// ── Unified File Insight ───────────────────────────────────────────────

export interface FileInsight {
	path: string;
	read_count: number;
	edit_count: number;
	write_count: number;
	total_count: number;
	distinct_session_count?: number;
	file_size_bytes?: number | null;
}

/**
 * Convert backend FileInsightRecord[] to frontend FileInsight[].
 * Preferred path when backend provides unified records.
 */
export function from_backend_insights(
	records: FileInsightRecord[],
): FileInsight[] {
	return records.map((r) => ({
		path: r.path,
		read_count: r.read_count,
		edit_count: r.edit_count,
		write_count: r.write_count,
		total_count: r.total_count,
		distinct_session_count: r.distinct_session_count,
	}));
}

/**
 * Merge file size results into existing FileInsight records.
 * Returns a new array (does not mutate).
 */
export function enrich_with_sizes(
	insights: FileInsight[],
	sizes: FileSizeResult[],
): FileInsight[] {
	const size_map = new Map<string, number | null>();
	for (const { path, size_bytes } of sizes) {
		size_map.set(path, size_bytes);
	}
	return insights.map((i) => ({
		...i,
		file_size_bytes: size_map.get(i.path),
	}));
}

/**
 * Merge separate read/edit/write NameCount arrays into a unified
 * per-file record. Fallback when backend records are unavailable.
 */
export function merge_file_insights(
	read_files: NameCount[],
	edit_files: NameCount[],
	write_files: NameCount[],
): FileInsight[] {
	const map = new Map<string, FileInsight>();

	const ensure = (path: string): FileInsight => {
		let entry = map.get(path);
		if (!entry) {
			entry = {
				path,
				read_count: 0,
				edit_count: 0,
				write_count: 0,
				total_count: 0,
			};
			map.set(path, entry);
		}
		return entry;
	};

	for (const { name, count } of read_files) {
		ensure(name).read_count += count;
	}
	for (const { name, count } of edit_files) {
		ensure(name).edit_count += count;
	}
	for (const { name, count } of write_files) {
		ensure(name).write_count += count;
	}

	for (const insight of map.values()) {
		insight.total_count =
			insight.read_count + insight.edit_count + insight.write_count;
	}

	return Array.from(map.values());
}

// ── Lens helpers ───────────────────────────────────────────────────────

/** Return the metric value for a file under the selected lens. */
export function get_lens_value(
	insight: FileInsight,
	lens: OperationLens,
): number {
	switch (lens) {
		case "all":
			return insight.total_count;
		case "read":
			return insight.read_count;
		case "edit":
			return insight.edit_count;
		case "write":
			return insight.write_count;
	}
}

// ── Color palette ──────────────────────────────────────────────────────

/** Hue values for each operation type. */
export const OP_HUE = { read: 210, edit: 145, write: 30 } as const;

/** CSS class-friendly color for each operation type. */
export const OP_COLOR_CLASS = {
	read: "text-blue-400",
	edit: "text-green-400",
	write: "text-orange-400",
} as const;

/** Determine the dominant operation for a file. */
export function dominant_op(
	r: number,
	e: number,
	w: number,
): "read" | "edit" | "write" {
	if (r >= e && r >= w) return "read";
	if (e >= r && e >= w) return "edit";
	return "write";
}

// ── Intensity bucketing ────────────────────────────────────────────────

/**
 * Map a raw value to an intensity bucket (0–4) using quantile-like
 * breakpoints derived from the visible dataset. Produces a GitHub
 * contribution-heatmap-style distribution where even low-activity
 * files get visible color.
 *
 * Returns a float in [0, 1] suitable for opacity/lightness scaling.
 */
export function intensity_bucket(value: number, max_value: number): number {
	if (max_value <= 0 || value <= 0) return 0;
	const ratio = value / max_value;
	// 5 levels: 0, 0.25, 0.5, 0.75, 1.0
	// Use sqrt to compress the scale so the long tail is still visible.
	const sqrt_ratio = Math.sqrt(ratio);
	// Quantize into 5 buckets
	if (sqrt_ratio < 0.15) return 0.2;
	if (sqrt_ratio < 0.35) return 0.4;
	if (sqrt_ratio < 0.6) return 0.65;
	if (sqrt_ratio < 0.85) return 0.85;
	return 1.0;
}

/**
 * Generate an HSL fill color from hue + intensity.
 * Designed for dark backgrounds (light text on colored cells).
 */
export function intensity_fill(hue: number, intensity: number): string {
	if (intensity <= 0) return "hsl(var(--muted))";
	// Saturation: 40..85 based on intensity
	const sat = 40 + intensity * 45;
	// Lightness: 55..35 — darker = more intense
	const light = 55 - intensity * 20;
	return `hsl(${hue}, ${sat}%, ${light}%)`;
}

// ── Percentage formatting ──────────────────────────────────────────────

export function format_pct(value: number, total: number): string {
	if (total === 0) return "0%";
	const pct = (value / total) * 100;
	if (pct < 1 && pct > 0) return "<1%";
	return `${Math.round(pct)}%`;
}

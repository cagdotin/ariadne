/**
 * Date utilities for aggregations.
 * Uses local timezone for date formatting to match Rust's chrono::Local behavior.
 */

/**
 * Format a Date as YYYY-MM-DD in the local timezone.
 * Respects the TZ environment variable (Node.js/Bun behavior).
 */
export function format_local_date(dt: Date): string {
	const year = dt.getFullYear();
	const month = String(dt.getMonth() + 1).padStart(2, "0");
	const day = String(dt.getDate()).padStart(2, "0");
	return `${year}-${month}-${day}`;
}

/**
 * Get the local weekday index: 0=Mon, 1=Tue, ..., 6=Sun
 * Matches chrono's num_days_from_monday().
 */
export function get_weekday_index(dt: Date): number {
	// JS getDay(): 0=Sun, 1=Mon, ..., 6=Sat
	// Convert to 0=Mon, ..., 6=Sun
	const js_day = dt.getDay();
	return js_day === 0 ? 6 : js_day - 1;
}

/**
 * Get the local hour (0-23).
 */
export function get_local_hour(dt: Date): number {
	return dt.getHours();
}

/**
 * Parse an ISO/RFC3339 timestamp to a local Date.
 * Returns null if parsing fails.
 */
export function parse_timestamp(ts: string): Date | null {
	const dt = new Date(ts);
	if (Number.isNaN(dt.getTime())) {
		return null;
	}
	return dt;
}

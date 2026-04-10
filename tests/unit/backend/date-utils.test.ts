import { describe, expect, it } from "vitest";
import {
	format_local_date,
	get_local_hour,
	get_weekday_index,
	parse_timestamp,
} from "../../../backend/analytics/date-utils";

// ── format_local_date ───────────────────────────────────────────────────

describe("format_local_date", () => {
	it("formats a date as YYYY-MM-DD", () => {
		const d = new Date(2025, 0, 15); // Jan 15 2025, local
		expect(format_local_date(d)).toBe("2025-01-15");
	});

	it("zero-pads month and day", () => {
		const d = new Date(2025, 2, 5); // Mar 5
		expect(format_local_date(d)).toBe("2025-03-05");
	});

	it("handles end of year", () => {
		const d = new Date(2025, 11, 31); // Dec 31
		expect(format_local_date(d)).toBe("2025-12-31");
	});
});

// ── get_weekday_index ───────────────────────────────────────────────────

describe("get_weekday_index", () => {
	it("returns 0 for Monday", () => {
		// 2025-01-06 is a Monday
		expect(get_weekday_index(new Date(2025, 0, 6))).toBe(0);
	});

	it("returns 4 for Friday", () => {
		// 2025-01-10 is a Friday
		expect(get_weekday_index(new Date(2025, 0, 10))).toBe(4);
	});

	it("returns 6 for Sunday", () => {
		// 2025-01-05 is a Sunday
		expect(get_weekday_index(new Date(2025, 0, 5))).toBe(6);
	});
});

// ── get_local_hour ──────────────────────────────────────────────────────

describe("get_local_hour", () => {
	it("returns the hour component", () => {
		const d = new Date(2025, 0, 1, 14, 30, 0);
		expect(get_local_hour(d)).toBe(14);
	});

	it("returns 0 for midnight", () => {
		const d = new Date(2025, 0, 1, 0, 0, 0);
		expect(get_local_hour(d)).toBe(0);
	});

	it("returns 23 for end of day", () => {
		const d = new Date(2025, 0, 1, 23, 59, 59);
		expect(get_local_hour(d)).toBe(23);
	});
});

// ── parse_timestamp ─────────────────────────────────────────────────────

describe("parse_timestamp", () => {
	it("parses ISO timestamps", () => {
		const result = parse_timestamp("2025-06-15T10:30:00Z");
		expect(result).toBeInstanceOf(Date);
		expect(result?.toISOString()).toBe("2025-06-15T10:30:00.000Z");
	});

	it("parses timestamps with timezone offsets", () => {
		const result = parse_timestamp("2025-06-15T10:30:00+02:00");
		expect(result).toBeInstanceOf(Date);
		expect(result?.toISOString()).toBe("2025-06-15T08:30:00.000Z");
	});

	it("returns null for invalid timestamps", () => {
		expect(parse_timestamp("not-a-date")).toBeNull();
		expect(parse_timestamp("")).toBeNull();
	});
});

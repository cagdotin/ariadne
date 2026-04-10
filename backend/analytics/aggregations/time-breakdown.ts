/**
 * Time breakdown aggregation — faithful port of
 * the time-breakdown aggregation logic.
 */

import {
	format_local_date,
	get_local_hour,
	get_weekday_index,
	parse_timestamp,
} from "../date-utils.js";
import { filter_sessions } from "../filter.js";
import { session_cache } from "../session-cache.js";

export interface WeekdayStat {
	day: string;
	sessions: number;
	cost: number;
	share: number;
}

export interface TimeOfDayStat {
	label: string;
	hour_start: number;
	hour_end: number;
	sessions: number;
	cost: number;
	share: number;
}

export interface DayCount {
	date: string;
	count: number;
}

export interface DayCost {
	date: string;
	cost: number;
}

export interface HourCount {
	hour: string;
	count: number;
}

export interface TimeBreakdown {
	range_days: number;
	total_sessions: number;
	total_cost: number;
	avg_cost_per_session: number;
	total_tokens: number;
	by_weekday: WeekdayStat[];
	by_time_of_day: TimeOfDayStat[];
	daily_sessions: DayCount[];
	daily_cost: DayCost[];
	hourly_sessions: HourCount[];
}

const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

const TIME_BUCKETS: readonly [string, number, number][] = [
	["After midnight", 0, 5],
	["Morning", 6, 11],
	["Afternoon", 12, 16],
	["Evening", 17, 21],
	["Night", 22, 23],
] as const;

export async function get_time_breakdown(
	range_days: number,
	project_path: string | null,
): Promise<TimeBreakdown> {
	const sessions = await session_cache.get_or_init();
	const filtered = filter_sessions(sessions, project_path, range_days);

	const total_sessions = filtered.length;
	let total_cost = 0;
	let total_tokens = 0;
	for (const s of filtered) {
		total_cost += s.total_cost;
		total_tokens += s.total_tokens;
	}
	const avg_cost_per_session =
		total_sessions > 0 ? total_cost / total_sessions : 0;

	// By weekday: 0=Mon..6=Sun
	const weekday_sessions = new Array<number>(7).fill(0);
	const weekday_cost = new Array<number>(7).fill(0);

	// By time of day buckets
	const tod_sessions = new Array<number>(5).fill(0);
	const tod_cost = new Array<number>(5).fill(0);

	// Daily
	const daily_sessions_map = new Map<string, number>();
	const daily_cost_map = new Map<string, number>();

	// Hourly (populated only when range_days == 1)
	const hourly_sessions_arr = new Array<number>(24).fill(0);

	for (const s of filtered) {
		const dt = parse_timestamp(s.started_at);
		if (dt === null) continue;

		// weekday
		const wd = get_weekday_index(dt);
		weekday_sessions[wd] += 1;
		weekday_cost[wd] += s.total_cost;

		// time of day
		const hour = get_local_hour(dt);
		for (let i = 0; i < TIME_BUCKETS.length; i++) {
			const [, h_start, h_end] = TIME_BUCKETS[i];
			if (hour >= h_start && hour <= h_end) {
				tod_sessions[i] += 1;
				tod_cost[i] += s.total_cost;
				break;
			}
		}

		// daily — use local date
		const date = format_local_date(dt);
		daily_sessions_map.set(date, (daily_sessions_map.get(date) ?? 0) + 1);
		daily_cost_map.set(date, (daily_cost_map.get(date) ?? 0) + s.total_cost);

		// hourly — accumulate for "today" view
		if (range_days === 1) {
			hourly_sessions_arr[hour] += 1;
		}
	}

	const by_weekday: WeekdayStat[] = DAY_NAMES.map((day, i) => {
		const share =
			total_sessions > 0 ? (weekday_sessions[i] / total_sessions) * 100.0 : 0.0;
		return { day, sessions: weekday_sessions[i], cost: weekday_cost[i], share };
	});

	const by_time_of_day: TimeOfDayStat[] = TIME_BUCKETS.map(
		([label, hour_start, hour_end], i) => {
			const share =
				total_sessions > 0 ? (tod_sessions[i] / total_sessions) * 100.0 : 0.0;
			return {
				label,
				hour_start,
				hour_end,
				sessions: tod_sessions[i],
				cost: tod_cost[i],
				share,
			};
		},
	);

	const daily_sessions: DayCount[] = Array.from(
		daily_sessions_map.entries(),
	).map(([date, count]) => ({ date, count }));
	daily_sessions.sort((a, b) => a.date.localeCompare(b.date));

	const daily_cost: DayCost[] = Array.from(daily_cost_map.entries()).map(
		([date, cost]) => ({ date, cost }),
	);
	daily_cost.sort((a, b) => a.date.localeCompare(b.date));

	// Build hourly_sessions: hours 0 through current hour when range_days == 1, empty otherwise
	let hourly_sessions: HourCount[] = [];
	if (range_days === 1) {
		const now_hour = get_local_hour(new Date());
		hourly_sessions = Array.from({ length: now_hour + 1 }, (_, h) => ({
			hour: String(h).padStart(2, "0"),
			count: hourly_sessions_arr[h],
		}));
	}

	return {
		range_days,
		total_sessions,
		total_cost,
		avg_cost_per_session,
		total_tokens,
		by_weekday,
		by_time_of_day,
		daily_sessions,
		daily_cost,
		hourly_sessions,
	};
}

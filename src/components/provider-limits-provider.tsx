import type { ProviderLimitSnapshot } from "@contracts/provider-limits";
import {
	createContext,
	useCallback,
	useContext,
	useEffect,
	useRef,
	useState,
} from "react";
import {
	get_provider_limits,
	refresh_provider_limits,
} from "@/api/provider-limits";

/** Polling interval: 10 minutes. */
const POLL_INTERVAL_MS = 10 * 60 * 1000;

interface ProviderLimitsState {
	snapshots: ProviderLimitSnapshot[];
	loading: boolean;
	refreshing: boolean;
	error: string | null;
	refresh: () => Promise<void>;
}

const initial_state: ProviderLimitsState = {
	snapshots: [],
	loading: true,
	refreshing: false,
	error: null,
	refresh: async () => {},
};

const ProviderLimitsContext = createContext<ProviderLimitsState>(initial_state);

export function ProviderLimitsProvider({
	children,
}: {
	children: React.ReactNode;
}) {
	const [snapshots, set_snapshots] = useState<ProviderLimitSnapshot[]>([]);
	const [loading, set_loading] = useState(true);
	const [refreshing, set_refreshing] = useState(false);
	const [error, set_error] = useState<string | null>(null);
	const interval_ref = useRef<ReturnType<typeof setInterval> | null>(null);

	// Fetch (cache-first) on mount
	const fetch_limits = useCallback(async () => {
		try {
			const resp = await get_provider_limits();
			set_snapshots(resp.providers);
			set_error(null);
		} catch (err) {
			console.error("[ProviderLimits] fetch failed:", err);
			set_error(err instanceof Error ? err.message : String(err));
		} finally {
			set_loading(false);
		}
	}, []);

	// Manual / polled refresh (force-fetches from providers)
	const do_refresh = useCallback(async () => {
		set_refreshing(true);
		try {
			const resp = await refresh_provider_limits();
			set_snapshots(resp.providers);
			set_error(null);
		} catch (err) {
			console.error("[ProviderLimits] refresh failed:", err);
			set_error(err instanceof Error ? err.message : String(err));
		} finally {
			set_refreshing(false);
		}
	}, []);

	// Initial fetch
	useEffect(() => {
		fetch_limits();
	}, [fetch_limits]);

	// Poll every 10 minutes
	useEffect(() => {
		interval_ref.current = setInterval(() => {
			do_refresh();
		}, POLL_INTERVAL_MS);

		return () => {
			if (interval_ref.current) {
				clearInterval(interval_ref.current);
			}
		};
	}, [do_refresh]);

	// Refresh on window focus
	useEffect(() => {
		const handle_focus = () => {
			do_refresh();
		};
		window.addEventListener("focus", handle_focus);
		return () => window.removeEventListener("focus", handle_focus);
	}, [do_refresh]);

	return (
		<ProviderLimitsContext.Provider
			value={{ snapshots, loading, refreshing, error, refresh: do_refresh }}
		>
			{children}
		</ProviderLimitsContext.Provider>
	);
}

export function use_provider_limits() {
	const ctx = useContext(ProviderLimitsContext);
	if (ctx === undefined) {
		throw new Error(
			"use_provider_limits must be used within a ProviderLimitsProvider",
		);
	}
	return ctx;
}

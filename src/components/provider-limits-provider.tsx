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
import { use_provider_limits_enabled } from "@/components/app-settings-provider";

/** Polling interval: 10 minutes. */
const POLL_INTERVAL_MS = 10 * 60 * 1000;

interface ProviderLimitsState {
	snapshots: ProviderLimitSnapshot[];
	loading: boolean;
	refreshing: boolean;
	error: string | null;
	refresh: () => Promise<void>;
}

const ProviderLimitsContext = createContext<ProviderLimitsState | null>(null);

export function ProviderLimitsProvider({
	children,
}: {
	children: React.ReactNode;
}) {
	const is_provider_limits_enabled = use_provider_limits_enabled();
	const [snapshots, set_snapshots] = useState<ProviderLimitSnapshot[]>([]);
	const [loading, set_loading] = useState(is_provider_limits_enabled);
	const [refreshing, set_refreshing] = useState(false);
	const [error, set_error] = useState<string | null>(null);
	const request_id_ref = useRef(0);

	const clear_state = useCallback(() => {
		request_id_ref.current += 1;
		set_snapshots([]);
		set_error(null);
		set_loading(false);
		set_refreshing(false);
	}, []);

	const fetch_limits = useCallback(async () => {
		if (!is_provider_limits_enabled) {
			clear_state();
			return;
		}

		const request_id = ++request_id_ref.current;
		set_loading(true);

		try {
			const resp = await get_provider_limits();
			if (request_id !== request_id_ref.current) return;
			set_snapshots(resp.providers);
			set_error(null);
		} catch (err) {
			if (request_id !== request_id_ref.current) return;
			console.error("[ProviderLimits] fetch failed:", err);
			set_error(err instanceof Error ? err.message : String(err));
		} finally {
			if (request_id === request_id_ref.current) {
				set_loading(false);
			}
		}
	}, [clear_state, is_provider_limits_enabled]);

	const do_refresh = useCallback(async () => {
		if (!is_provider_limits_enabled) {
			clear_state();
			return;
		}

		const request_id = ++request_id_ref.current;
		set_refreshing(true);

		try {
			const resp = await refresh_provider_limits();
			if (request_id !== request_id_ref.current) return;
			set_snapshots(resp.providers);
			set_error(null);
		} catch (err) {
			if (request_id !== request_id_ref.current) return;
			console.error("[ProviderLimits] refresh failed:", err);
			set_error(err instanceof Error ? err.message : String(err));
		} finally {
			if (request_id === request_id_ref.current) {
				set_loading(false);
				set_refreshing(false);
			}
		}
	}, [clear_state, is_provider_limits_enabled]);

	useEffect(() => {
		if (!is_provider_limits_enabled) {
			clear_state();
			return;
		}

		void fetch_limits();
	}, [clear_state, fetch_limits, is_provider_limits_enabled]);

	useEffect(() => {
		if (!is_provider_limits_enabled) return;

		const interval_id = window.setInterval(() => {
			void do_refresh();
		}, POLL_INTERVAL_MS);

		return () => {
			window.clearInterval(interval_id);
		};
	}, [do_refresh, is_provider_limits_enabled]);

	useEffect(() => {
		if (!is_provider_limits_enabled) return;

		const handle_focus = () => {
			void do_refresh();
		};

		window.addEventListener("focus", handle_focus);
		return () => window.removeEventListener("focus", handle_focus);
	}, [do_refresh, is_provider_limits_enabled]);

	return (
		<ProviderLimitsContext.Provider
			value={{ snapshots, loading, refreshing, error, refresh: do_refresh }}
		>
			{children}
		</ProviderLimitsContext.Provider>
	);
}

export function use_provider_limits(): ProviderLimitsState {
	const context = useContext(ProviderLimitsContext);
	if (!context) {
		throw new Error(
			"use_provider_limits must be used within a ProviderLimitsProvider",
		);
	}
	return context;
}

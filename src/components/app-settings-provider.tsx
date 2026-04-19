import {
	createContext,
	useCallback,
	useContext,
	useMemo,
	useState,
} from "react";
import {
	type AppSettings,
	are_provider_limits_enabled,
	is_provider_limit_enabled,
	read_app_settings,
	reset_app_settings,
	write_app_settings,
} from "@/lib/app-settings";

interface AppSettingsState {
	settings: AppSettings;
	set_qmd_enabled: (enabled: boolean) => void;
	set_provider_enabled: (provider_id: "codex", enabled: boolean) => void;
	reset_settings: () => void;
}

const AppSettingsContext = createContext<AppSettingsState | null>(null);

export function AppSettingsProvider({
	children,
}: {
	children: React.ReactNode;
}) {
	const [settings, set_settings] = useState<AppSettings>(() =>
		read_app_settings(),
	);

	const update_settings = useCallback(
		(updater: (current: AppSettings) => AppSettings) => {
			set_settings((current) => {
				const next = updater(current);
				write_app_settings(next);
				return next;
			});
		},
		[],
	);

	const set_qmd_enabled = useCallback(
		(enabled: boolean) => {
			update_settings((current) => ({
				...current,
				experimental_features: {
					...current.experimental_features,
					qmd: enabled,
				},
			}));
		},
		[update_settings],
	);

	const set_provider_enabled = useCallback(
		(provider_id: "codex", enabled: boolean) => {
			update_settings((current) => ({
				...current,
				experimental_features: {
					...current.experimental_features,
					provider_limits: {
						...current.experimental_features.provider_limits,
						[provider_id]: enabled,
					},
				},
			}));
		},
		[update_settings],
	);

	const handle_reset_settings = useCallback(() => {
		set_settings(reset_app_settings());
	}, []);

	const value = useMemo<AppSettingsState>(
		() => ({
			settings,
			set_qmd_enabled,
			set_provider_enabled,
			reset_settings: handle_reset_settings,
		}),
		[settings, handle_reset_settings, set_provider_enabled, set_qmd_enabled],
	);

	return (
		<AppSettingsContext.Provider value={value}>
			{children}
		</AppSettingsContext.Provider>
	);
}

export function use_app_settings(): AppSettingsState {
	const context = useContext(AppSettingsContext);
	if (!context) {
		throw new Error(
			"use_app_settings must be used within an AppSettingsProvider",
		);
	}
	return context;
}

export function use_qmd_enabled(): boolean {
	const { settings } = use_app_settings();
	return settings.experimental_features.qmd;
}

export function use_provider_limits_enabled(): boolean {
	const { settings } = use_app_settings();
	return are_provider_limits_enabled(settings);
}

export function use_provider_enabled(provider_id: "codex"): boolean {
	const { settings } = use_app_settings();
	return is_provider_limit_enabled(settings, provider_id);
}

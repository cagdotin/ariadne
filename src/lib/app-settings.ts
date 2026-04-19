export const APP_SETTINGS_STORAGE_KEY = "ariadne:app-settings";

export interface AppSettings {
	version: 1;
	experimental_features: {
		qmd: boolean;
		provider_limits: {
			codex: boolean;
		};
	};
}

const DEFAULT_APP_SETTINGS: AppSettings = {
	version: 1,
	experimental_features: {
		qmd: true,
		provider_limits: {
			codex: true,
		},
	},
};

interface StorageLike {
	getItem(key: string): string | null;
	setItem(key: string, value: string): void;
	removeItem(key: string): void;
}

function clone_default_settings(): AppSettings {
	return {
		version: DEFAULT_APP_SETTINGS.version,
		experimental_features: {
			qmd: DEFAULT_APP_SETTINGS.experimental_features.qmd,
			provider_limits: {
				codex: DEFAULT_APP_SETTINGS.experimental_features.provider_limits.codex,
			},
		},
	};
}

function is_record(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

export function normalize_app_settings(value: unknown): AppSettings {
	const defaults = clone_default_settings();
	if (!is_record(value)) return defaults;

	const experimental_features = is_record(value.experimental_features)
		? value.experimental_features
		: {};
	const provider_limits = is_record(experimental_features.provider_limits)
		? experimental_features.provider_limits
		: {};

	return {
		version: 1,
		experimental_features: {
			qmd:
				typeof experimental_features.qmd === "boolean"
					? experimental_features.qmd
					: defaults.experimental_features.qmd,
			provider_limits: {
				codex:
					typeof provider_limits.codex === "boolean"
						? provider_limits.codex
						: defaults.experimental_features.provider_limits.codex,
			},
		},
	};
}

function get_storage(storage?: StorageLike): StorageLike | null {
	if (storage) return storage;
	if (typeof localStorage === "undefined") return null;
	return localStorage;
}

export function read_app_settings(storage?: StorageLike): AppSettings {
	const resolved_storage = get_storage(storage);
	if (!resolved_storage) return clone_default_settings();

	try {
		const raw = resolved_storage.getItem(APP_SETTINGS_STORAGE_KEY);
		if (!raw) return clone_default_settings();
		const parsed = JSON.parse(raw);
		const normalized = normalize_app_settings(parsed);
		if (JSON.stringify(parsed) !== JSON.stringify(normalized)) {
			resolved_storage.setItem(
				APP_SETTINGS_STORAGE_KEY,
				JSON.stringify(normalized),
			);
		}
		return normalized;
	} catch {
		resolved_storage.removeItem(APP_SETTINGS_STORAGE_KEY);
		return clone_default_settings();
	}
}

export function write_app_settings(
	settings: AppSettings,
	storage?: StorageLike,
): void {
	const resolved_storage = get_storage(storage);
	if (!resolved_storage) return;

	try {
		resolved_storage.setItem(
			APP_SETTINGS_STORAGE_KEY,
			JSON.stringify(normalize_app_settings(settings)),
		);
	} catch {
		// Ignore storage failures.
	}
}

export function reset_app_settings(storage?: StorageLike): AppSettings {
	const settings = clone_default_settings();
	write_app_settings(settings, storage);
	return settings;
}

export function are_provider_limits_enabled(settings: AppSettings): boolean {
	return settings.experimental_features.provider_limits.codex;
}

export function is_provider_limit_enabled(
	settings: AppSettings,
	provider_id: "codex",
): boolean {
	return settings.experimental_features.provider_limits[provider_id];
}

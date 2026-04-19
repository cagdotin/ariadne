import { beforeEach, describe, expect, it } from "vitest";
import {
	APP_SETTINGS_STORAGE_KEY,
	are_provider_limits_enabled,
	normalize_app_settings,
	read_app_settings,
	reset_app_settings,
	write_app_settings,
} from "@/lib/app-settings";

class MemoryStorage {
	private data = new Map<string, string>();

	getItem(key: string): string | null {
		return this.data.get(key) ?? null;
	}

	setItem(key: string, value: string): void {
		this.data.set(key, value);
	}

	removeItem(key: string): void {
		this.data.delete(key);
	}
}

describe("app settings", () => {
	let storage: MemoryStorage;

	beforeEach(() => {
		storage = new MemoryStorage();
	});

	it("returns default settings when nothing is stored", () => {
		const settings = read_app_settings(storage);
		expect(settings.experimental_features.qmd).toBe(true);
		expect(settings.experimental_features.provider_limits.codex).toBe(true);
		expect(are_provider_limits_enabled(settings)).toBe(true);
	});

	it("normalizes partial payloads with defaults", () => {
		const settings = normalize_app_settings({
			experimental_features: {
				provider_limits: {
					codex: false,
				},
			},
		});

		expect(settings.experimental_features.qmd).toBe(true);
		expect(settings.experimental_features.provider_limits.codex).toBe(false);
	});

	it("persists normalized settings", () => {
		write_app_settings(
			{
				version: 1,
				experimental_features: {
					qmd: false,
					provider_limits: {
						codex: true,
					},
				},
			},
			storage,
		);

		const stored = storage.getItem(APP_SETTINGS_STORAGE_KEY);
		expect(stored).not.toBeNull();
		expect(read_app_settings(storage).experimental_features.qmd).toBe(false);
	});

	it("clears invalid JSON and falls back to defaults", () => {
		storage.setItem(APP_SETTINGS_STORAGE_KEY, "not-json");

		const settings = read_app_settings(storage);
		expect(settings.experimental_features.qmd).toBe(true);
		expect(storage.getItem(APP_SETTINGS_STORAGE_KEY)).toBeNull();
	});

	it("reset restores defaults", () => {
		write_app_settings(
			{
				version: 1,
				experimental_features: {
					qmd: false,
					provider_limits: {
						codex: false,
					},
				},
			},
			storage,
		);

		const reset = reset_app_settings(storage);
		expect(reset.experimental_features.qmd).toBe(true);
		expect(reset.experimental_features.provider_limits.codex).toBe(true);
	});
});

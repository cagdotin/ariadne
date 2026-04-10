import {
	type ProviderLimitsResponse,
	provider_limits_response_schema,
} from "@contracts/provider-limits/snapshots";
import { commands } from "@/platform/ipc";

export async function get_provider_limits(): Promise<ProviderLimitsResponse> {
	const raw = await commands.provider_limits.get_provider_limits();
	return provider_limits_response_schema.parse(raw);
}

export async function refresh_provider_limits(): Promise<ProviderLimitsResponse> {
	const raw = await commands.provider_limits.refresh_provider_limits();
	return provider_limits_response_schema.parse(raw);
}

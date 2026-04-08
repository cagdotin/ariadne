import { invoke } from "@tauri-apps/api/core";
import {
  provider_limits_response_schema,
  type ProviderLimitsResponse,
} from "@contracts/provider-limits/snapshots";

export async function get_provider_limits(): Promise<ProviderLimitsResponse> {
  const raw = await invoke("get_provider_limits");
  return provider_limits_response_schema.parse(raw);
}

export async function refresh_provider_limits(): Promise<ProviderLimitsResponse> {
  const raw = await invoke("refresh_provider_limits");
  return provider_limits_response_schema.parse(raw);
}

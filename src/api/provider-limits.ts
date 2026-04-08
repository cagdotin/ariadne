import { invoke } from "@tauri-apps/api/core";
import { ProviderLimitsResponseSchema } from "@/schemas/provider-limits";
import type { ProviderLimitsResponse } from "@/schemas/provider-limits";

export async function get_provider_limits(): Promise<ProviderLimitsResponse> {
  const raw = await invoke("get_provider_limits");
  return ProviderLimitsResponseSchema.parse(raw);
}

export async function refresh_provider_limits(): Promise<ProviderLimitsResponse> {
  const raw = await invoke("refresh_provider_limits");
  return ProviderLimitsResponseSchema.parse(raw);
}

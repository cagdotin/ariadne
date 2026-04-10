// ---- Provider limits command handlers ----------------------------------------

import { register_handler } from "../runtime/request-router.js";
import { provider_limits_cache } from "./cache.js";

register_handler("get_provider_limits", async () => {
	const providers = await provider_limits_cache.get();
	return { providers };
});

register_handler("refresh_provider_limits", async () => {
	const providers = await provider_limits_cache.refresh();
	return { providers };
});

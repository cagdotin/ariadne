import {
	type ExplorationPayload,
	exploration_payload_schema,
} from "@contracts/exploration";
import { commands } from "@/platform/ipc";

export async function get_session_exploration(
	session_id: string,
): Promise<ExplorationPayload> {
	const raw = await commands.analytics.get_session_exploration({
		sessionId: session_id,
	});
	return exploration_payload_schema.parse(raw);
}

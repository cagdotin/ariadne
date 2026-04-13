import {
	type SessionGraphPayload,
	session_graph_payload_schema,
} from "@contracts/graph";
import { commands } from "@/platform/ipc";

export async function get_session_graph(
	session_id: string,
): Promise<SessionGraphPayload> {
	const raw = await commands.analytics.get_session_graph({
		sessionId: session_id,
	});
	return session_graph_payload_schema.parse(raw);
}

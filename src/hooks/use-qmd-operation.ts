import { useEffect, useState } from "react";
import { subscribe, unsubscribe } from "@/platform/events";

export interface UpdateProgress {
	collection: string;
	file: string;
	current: number;
	total: number;
}

export interface EmbedProgress {
	chunks_embedded: number;
	total_chunks: number;
	bytes_processed: number;
	total_bytes: number;
}

export interface QmdOperationState {
	operation: "update" | "embed" | "cleanup" | null;
	progress: UpdateProgress | EmbedProgress | null;
	is_busy: boolean;
}

// Event payloads use camelCase from the backend
interface RawUpdateProgress {
	collection: string;
	file: string;
	current: number;
	total: number;
}

interface RawEmbedProgress {
	chunksEmbedded: number;
	totalChunks: number;
	bytesProcessed: number;
	totalBytes: number;
}

export function use_qmd_operation(): {
	state: QmdOperationState;
	start_operation: (type: "update" | "embed" | "cleanup") => void;
	clear_operation: () => void;
} {
	const [state, set_state] = useState<QmdOperationState>({
		operation: null,
		progress: null,
		is_busy: false,
	});

	useEffect(() => {
		const sub_ids: string[] = [];

		sub_ids.push(
			subscribe("qmd:update-progress", (payload) => {
				const p = payload as RawUpdateProgress;
				set_state((prev) => ({
					...prev,
					operation: "update",
					is_busy: true,
					progress: {
						collection: p.collection,
						file: p.file,
						current: p.current,
						total: p.total,
					} as UpdateProgress,
				}));
			}),
		);

		sub_ids.push(
			subscribe("qmd:embed-progress", (payload) => {
				const p = payload as RawEmbedProgress;
				set_state((prev) => ({
					...prev,
					operation: "embed",
					is_busy: true,
					progress: {
						chunks_embedded: p.chunksEmbedded,
						total_chunks: p.totalChunks,
						bytes_processed: p.bytesProcessed,
						total_bytes: p.totalBytes,
					} as EmbedProgress,
				}));
			}),
		);

		return () => {
			sub_ids.forEach((id) => {
				unsubscribe(id);
			});
		};
	}, []);

	const start_operation = (type: "update" | "embed" | "cleanup") => {
		set_state({ operation: type, progress: null, is_busy: true });
	};

	const clear_operation = () => {
		set_state({ operation: null, progress: null, is_busy: false });
	};

	return { state, start_operation, clear_operation };
}

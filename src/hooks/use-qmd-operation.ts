import { useState, useEffect } from "react";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

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

// Tauri event payloads use camelCase from Rust
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
    const unlisten_fns: UnlistenFn[] = [];

    const setup = async () => {
      const unlisten_update = await listen<RawUpdateProgress>(
        "qmd:update-progress",
        (event) => {
          const p = event.payload;
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
        }
      );

      const unlisten_embed = await listen<RawEmbedProgress>(
        "qmd:embed-progress",
        (event) => {
          const p = event.payload;
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
        }
      );

      unlisten_fns.push(unlisten_update, unlisten_embed);
    };

    setup();

    return () => {
      unlisten_fns.forEach((fn) => fn());
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

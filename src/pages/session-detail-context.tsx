import { createContext, useContext } from "react";
import type { SessionHeader, SessionEntry } from "@/components/session-viewer/types";
import type { SessionSummary } from "@contracts/sessions/summary";

export interface SessionDetailContextValue {
  header: SessionHeader | null;
  entries: SessionEntry[];
  leaf_id: string | null;
  session_summary: SessionSummary | null;
  loading: boolean;
  error: string | null;
}

const SessionDetailContext = createContext<SessionDetailContextValue | null>(null);

export const SessionDetailProvider = SessionDetailContext.Provider;

export function use_session_detail_context(): SessionDetailContextValue {
  const ctx = useContext(SessionDetailContext);
  if (!ctx) throw new Error("use_session_detail_context must be used within SessionDetailProvider");
  return ctx;
}

import { useEffect } from "react";
import { useNavigate, useParams } from "@tanstack/react-router";

export function SessionDetailRedirect() {
  const navigate = useNavigate();
  const { id } = useParams({ strict: false }) as { id: string };

  useEffect(() => {
    navigate({ to: `/sessions/${id}/conversation`, replace: true });
  }, [navigate, id]);

  return null;
}

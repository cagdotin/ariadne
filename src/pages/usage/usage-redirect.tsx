import { useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";

export function UsageRedirect() {
  const navigate = useNavigate();
  useEffect(() => {
    navigate({ to: "/usage/cost", replace: true });
  }, [navigate]);
  return null;
}

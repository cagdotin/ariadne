import { useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { qmd_list_indexes } from "@/api/qmd";
import { Skeleton } from "@/components/ui/skeleton";

const LAST_INDEX_KEY = "ariadne:qmd:last-index";

export function QmdRedirect() {
  const navigate = useNavigate();
  useEffect(() => {
    const redirect = async () => {
      try {
        const last_index = localStorage.getItem(LAST_INDEX_KEY);
        if (last_index) {
          // Verify the index still exists
          const indexes = await qmd_list_indexes();
          const exists = indexes.some((idx) => idx.name === last_index);
          if (exists) {
            navigate({ to: "/qmd/$index", params: { index: last_index }, replace: true });
            return;
          }
        }
        // Fall back to default
        navigate({ to: "/qmd/$index", params: { index: "default" }, replace: true });
      } catch {
        // If listing fails, just go to default
        navigate({ to: "/qmd/$index", params: { index: "default" }, replace: true });
      }
    };
    redirect();
  }, [navigate]);

  return (
    <div className="space-y-6">
      <Skeleton className="h-7 w-24" />
      <Skeleton className="h-14 w-full" />
    </div>
  );
}

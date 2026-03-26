import { Search } from "lucide-react";

export function ProjectScopeEmpty() {
  return (
    <div className="px-4 py-6 text-center">
      <Search className="mx-auto size-4 text-muted-foreground" />
      <p className="mt-2 text-sm text-muted-foreground">
        No matching projects
      </p>
    </div>
  );
}

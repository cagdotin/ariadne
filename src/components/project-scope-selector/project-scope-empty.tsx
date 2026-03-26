import { Search } from "lucide-react";
import { ComboboxEmpty } from "@/components/ui/combobox";

export function ProjectScopeEmpty() {
  return (
    <ComboboxEmpty className="flex flex-col px-4 py-6 text-center">
      <Search className="mx-auto size-4 text-muted-foreground" />
      <p className="mt-2 text-sm text-muted-foreground">
        No matching projects
      </p>
    </ComboboxEmpty>
  );
}

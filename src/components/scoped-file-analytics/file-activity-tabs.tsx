import { DataTable } from "@/components/data-table";
import { file_activity_columns } from "@/components/columns/file-activity-columns";
import type { NameCount } from "@/schemas/analytics";
import type { FileTab } from "./types";

interface FileActivityTabsProps {
  active_tab: FileTab;
  filtered_read: NameCount[];
  filtered_edit: NameCount[];
  filtered_write: NameCount[];
  active_file_list: NameCount[];
  on_tab_change: (tab: FileTab) => void;
}

const file_tabs: FileTab[] = ["read", "edit", "write"];

export function FileActivityTabs({
  active_tab,
  filtered_read,
  filtered_edit,
  filtered_write,
  active_file_list,
  on_tab_change,
}: FileActivityTabsProps) {
  const counts_by_tab: Record<FileTab, number> = {
    read: filtered_read.length,
    edit: filtered_edit.length,
    write: filtered_write.length,
  };

  return (
    <div>
      <h3 className="mb-4 text-base font-semibold text-foreground">File Activity</h3>
      <div className="mb-4 flex gap-2">
        {file_tabs.map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => on_tab_change(tab)}
            className={`px-3 py-1.5 text-sm rounded-md font-medium transition-colors ${
              active_tab === tab
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
            <span className="ml-1.5 text-xs opacity-70">({counts_by_tab[tab]})</span>
          </button>
        ))}
      </div>
      <DataTable
        columns={file_activity_columns}
        data={active_file_list.slice(0, 50)}
        filter_column="name"
        filter_placeholder="Search files..."
      />
    </div>
  );
}

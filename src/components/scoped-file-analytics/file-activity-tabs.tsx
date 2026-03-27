import { DataTable } from "@/components/data-table";
import { file_activity_columns } from "@/components/columns/file-activity-columns";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import type { NameCount } from "@/schemas/analytics";
import type { FileTab } from "./types";

interface FileActivityTabsProps {
  active_tab: FileTab;
  filtered_read: NameCount[];
  filtered_edit: NameCount[];
  filtered_write: NameCount[];
  on_tab_change: (tab: FileTab) => void;
}

const file_tabs: FileTab[] = ["read", "edit", "write"];

export function FileActivityTabs({
  active_tab,
  filtered_read,
  filtered_edit,
  filtered_write,
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
      <Tabs value={active_tab} onValueChange={(v) => on_tab_change(v as FileTab)}>
        <TabsList>
          {file_tabs.map((tab) => (
            <TabsTrigger key={tab} value={tab}>
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
              <span className="text-xs opacity-70">({counts_by_tab[tab]})</span>
            </TabsTrigger>
          ))}
        </TabsList>
        {file_tabs.map((tab) => (
          <TabsContent key={tab} value={tab}>
            <DataTable
              columns={file_activity_columns}
              data={(tab === "read" ? filtered_read : tab === "edit" ? filtered_edit : filtered_write).slice(0, 50)}
              filter_column="name"
              filter_placeholder="Search files..."
            />
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}

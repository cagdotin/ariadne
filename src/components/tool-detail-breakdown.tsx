import type { NameCount } from "@contracts/shared";
import { RankedListCard } from "@/components/ranked-list-card";

interface ToolDetailBreakdownProps {
  bash_commands: NameCount[];
  read_files: NameCount[];
  edit_files: NameCount[];
  write_files: NameCount[];
}

export function ToolDetailBreakdown({
  bash_commands,
  read_files,
  edit_files,
  write_files,
}: ToolDetailBreakdownProps) {
  const list_cards = [
    {
      title: "Most Used Bash Programs",
      items: bash_commands,
      max_count: bash_commands[0]?.count || 1,
    },
    {
      title: "Most Read Files",
      items: read_files,
      max_count: read_files[0]?.count || 1,
    },
    {
      title: "Most Edited Files",
      items: edit_files,
      max_count: edit_files[0]?.count || 1,
    },
    {
      title: "Most Written Files",
      items: write_files,
      max_count: write_files[0]?.count || 1,
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="mb-4 text-lg font-semibold text-foreground">
          Tool Detail Breakdown
        </h2>
        <p className="mb-6 text-sm text-muted-foreground">
          Detailed breakdown of bash commands executed and files accessed across all sessions.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        {list_cards.map((card) => (
          <RankedListCard
            key={card.title}
            title={card.title}
            items={card.items}
            max_count={card.max_count}
          />
        ))}
      </div>
    </div>
  );
}

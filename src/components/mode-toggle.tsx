import { Moon, Sun } from "lucide-react";

import { Button } from "@/components/ui/button";
import { use_theme } from "@/components/theme-provider";

export function ModeToggle() {
  const { theme, set_theme } = use_theme();

  const toggle_theme = () => {
    set_theme(theme === "dark" ? "light" : "dark");
  };

  return (
    <Button variant="ghost" size="icon-sm" onClick={toggle_theme}>
      <Sun className="size-3.5 scale-100 rotate-0 transition-all dark:scale-0 dark:-rotate-90" />
      <Moon className="absolute size-3.5 scale-0 rotate-90 transition-all dark:scale-100 dark:rotate-0" />
      <span className="sr-only">Toggle theme</span>
    </Button>
  );
}

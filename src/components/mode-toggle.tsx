import { Moon, Sun } from "lucide-react"

import { Button } from "@/components/ui/button"
import { use_theme } from "@/components/theme-provider"

export function ModeToggle() {
  const { theme, set_theme } = use_theme()

  const toggle_theme = () => {
    set_theme(theme === "dark" ? "light" : "dark")
  }

  return (
    <Button variant="outline" size="icon" onClick={toggle_theme}>
      <Sun className="h-[1.2rem] w-[1.2rem] scale-100 rotate-0 transition-all dark:scale-0 dark:-rotate-90" />
      <Moon className="absolute h-[1.2rem] w-[1.2rem] scale-0 rotate-90 transition-all dark:scale-100 dark:rotate-0" />
      <span className="sr-only">Toggle theme</span>
    </Button>
  )
}

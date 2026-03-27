import { Link, Outlet, useLocation } from "@tanstack/react-router";
import {
  LayoutDashboard,
  List,
  BarChart3,
  RefreshCw,
  LibraryBig,
  ChevronRight,
} from "lucide-react";
import { useMemo, useState } from "react";
import { resync_sessions } from "./api/analytics";
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarProvider,
  SidebarInset,
  SidebarRail,
  SidebarTrigger,
  SidebarGroup,
  SidebarGroupContent,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { ThemeProvider } from "@/components/theme-provider";
import { ModeToggle } from "@/components/mode-toggle";
import { PageHeader } from "@/components/page-header";
import { LabyrinthLogo } from "@/components/labyrinth-logo";
import { ProjectScopeSelector } from "@/components/project-scope-selector";
import { Separator } from "./components/ui/separator";

export function AppLayout() {
  const location = useLocation();
  const [is_syncing, set_is_syncing] = useState(false);

  const is_active = (path: string) => {
    if (path === "/") return location.pathname === "/";
    return location.pathname.startsWith(path);
  };

  const handle_sync = async () => {
    try {
      set_is_syncing(true);
      await resync_sessions();
      console.log("Sessions synced successfully");
      // Full reload is load-bearing: it re-runs the ProjectScopeProvider startup
      // effect which re-fetches the project list and clears stale stored scope.
      window.location.reload();
    } catch (error) {
      console.error("Failed to sync sessions:", error);
      alert("Failed to sync sessions");
    } finally {
      set_is_syncing(false);
    }
  };

  const breadcrumbs = useMemo((): { label: string; href?: string }[] => {
    const parts = location.pathname.split("/").filter(Boolean);

    if (parts.length === 0) return [{ label: "Overview" }];
    if (parts[0] === "sessions" && parts[1]) {
      return [
        { label: "Sessions", href: "/sessions" },
        { label: parts[1].slice(0, 12) + "…" },
      ];
    }
    if (parts[0] === "sessions") return [{ label: "Sessions" }];
    if (parts[0] === "usage") {
      const tab_labels: Record<string, string> = {
        cost: "Cost",
        tools: "Tools",
        patterns: "Patterns",
        files: "Files",
      };
      const tab = parts[1];
      const tab_label = tab_labels[tab];

      if (tab === "tools" && parts[2]) {
        return [
          { label: "Usage", href: "/usage" },
          { label: "Tools", href: "/usage/tools" },
          { label: decodeURIComponent(parts[2]) },
        ];
      }
      if (tab_label) {
        return [
          { label: "Usage", href: "/usage" },
          { label: tab_label },
        ];
      }
      return [{ label: "Usage" }];
    }
    if (parts[0] === "qmd" && parts[1] === "logs") {
      return [
        { label: "QMD", href: "/qmd" },
        { label: "Logs" },
      ];
    }
    if (parts[0] === "qmd" && parts[1] && parts[2]) {
      return [
        { label: "QMD", href: "/qmd" },
        { label: parts[1], href: `/qmd/${parts[1]}` },
        { label: decodeURIComponent(parts[2]) },
      ];
    }
    if (parts[0] === "qmd" && parts[1]) {
      return [{ label: "QMD", href: "/qmd" }, { label: parts[1] }];
    }
    if (parts[0] === "qmd") return [{ label: "QMD" }];
    return [{ label: parts[0] }];
  }, [location.pathname]);

  const is_session_detail = /^\/sessions\/[^/]+$/.test(location.pathname);

  return (
    <ThemeProvider default_theme="dark" storage_key="ariadne-ui-theme">
      <SidebarProvider className="max-h-svh overflow-hidden">
        <Sidebar collapsible="icon">
          <SidebarHeader className="border-b border-sidebar-border px-4 h-12 justify-center group-data-[collapsible=icon]:px-2">
            <div className="flex items-center gap-2.5 group-data-[collapsible=icon]:justify-center">
              <LabyrinthLogo className="size-6 shrink-0 text-foreground group-data-[collapsible=icon]:size-5" />
              <div className="group-data-[collapsible=icon]:hidden">
                <h2 className="text-foreground text-md font-semibold leading-tight">
                  Ariadne
                </h2>
              </div>
            </div>
          </SidebarHeader>
          <SidebarContent>
            <SidebarGroup>
              <SidebarGroupContent>
                <SidebarMenu>
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      render={<Link to="/" />}
                      isActive={location.pathname === "/"}
                      tooltip="Overview"
                    >
                      <LayoutDashboard />
                      <span>Overview</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      render={<Link to="/sessions" />}
                      isActive={is_active("/sessions")}
                      tooltip="Sessions"
                    >
                      <List />
                      <span>Sessions</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      render={<Link to="/usage" />}
                      isActive={is_active("/usage")}
                      tooltip="Usage"
                    >
                      <BarChart3 />
                      <span>Usage</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      render={<Link to="/qmd" />}
                      isActive={is_active("/qmd")}
                      tooltip="QMD"
                    >
                      <LibraryBig />
                      <span>QMD</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </SidebarContent>
          <SidebarRail />
        </Sidebar>

        <SidebarInset>
          <header className="flex items-center justify-center gap-1 pl-2 pr-4 h-12 border-b border-border shrink-0">
            <SidebarTrigger />
            <Separator orientation="vertical" className="h-5 my-auto mr-1" />
            <ProjectScopeSelector />
            <span>
              <ChevronRight className="size-3" />
            </span>
            <div className="">
              <PageHeader items={breadcrumbs} />
            </div>
            <div className="ml-auto flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={handle_sync}
                disabled={is_syncing}
              >
                <RefreshCw
                  className={`h-4 w-4 ${is_syncing ? "animate-spin" : ""}`}
                />
                <span className="ml-2">Sync</span>
              </Button>
              <ModeToggle />
            </div>
          </header>
          {is_session_detail ? (
            <div className="flex-1 overflow-hidden min-w-0 min-h-0">
              <Outlet />
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto overflow-x-hidden min-w-0 min-h-0 p-4 md:p-6 lg:p-8">
              <div className="flex flex-col gap-4 min-w-0 max-w-full">
                <Outlet />
              </div>
            </div>
          )}
        </SidebarInset>
      </SidebarProvider>
    </ThemeProvider>
  );
}

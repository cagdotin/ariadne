import { Link, Outlet, useLocation } from "@tanstack/react-router";
import {
  LayoutDashboard,
  FolderOpen,
  List,
  BarChart3,
  RefreshCw,
} from "lucide-react";
import { useState } from "react";
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
      window.location.reload();
    } catch (error) {
      console.error("Failed to sync sessions:", error);
      alert("Failed to sync sessions");
    } finally {
      set_is_syncing(false);
    }
  };

  const get_breadcrumbs = () => {
    const parts = location.pathname.split("/").filter(Boolean);
    if (parts[0] === "projects" && parts[1]) {
      return [
        { label: "Projects", href: "/projects" },
        { label: decodeURIComponent(parts[1]) },
      ];
    }
    if (parts[0] === "tools" && parts[1]) {
      return [
        { label: "Usage", href: "/usage" },
        { label: decodeURIComponent(parts[1]) },
      ];
    }
    return null;
  };
  const breadcrumbs = get_breadcrumbs();

  return (
    <ThemeProvider default_theme="dark" storage_key="ariadne-ui-theme">
      <SidebarProvider>
        <Sidebar collapsible="icon">
          <SidebarHeader className="border-b border-sidebar-border px-4 py-4 group-data-[collapsible=icon]:px-2 group-data-[collapsible=icon]:py-3">
            <div className="flex items-center gap-2.5 group-data-[collapsible=icon]:justify-center">
              <LabyrinthLogo className="size-7 shrink-0 text-foreground group-data-[collapsible=icon]:size-6" />
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
                      render={<Link to="/projects" />}
                      isActive={is_active("/projects")}
                      tooltip="Projects"
                    >
                      <FolderOpen />
                      <span>Projects</span>
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
                      isActive={
                        location.pathname === "/usage" || is_active("/tools")
                      }
                      tooltip="Usage"
                    >
                      <BarChart3 />
                      <span>Usage</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </SidebarContent>
          <SidebarRail />
        </Sidebar>

        <SidebarInset>
          <header className="flex items-center gap-2 px-4 py-2 border-b border-border shrink-0">
            <SidebarTrigger />
            {breadcrumbs && (
              <div className="ml-2">
                <PageHeader items={breadcrumbs} />
              </div>
            )}
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
          <div className="flex-1 overflow-y-auto overflow-x-hidden min-w-0 p-4 md:p-6 lg:p-8">
            <Outlet />
          </div>
        </SidebarInset>
      </SidebarProvider>
    </ThemeProvider>
  );
}

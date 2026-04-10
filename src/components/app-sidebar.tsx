import { Link, useLocation } from "@tanstack/react-router";
import { BarChart3, LayoutDashboard, LibraryBig, List } from "lucide-react";
import { ProviderLimitsSidebarCard } from "@/components/provider-limits-sidebar-card";
import {
	Sidebar,
	SidebarContent,
	SidebarFooter,
	SidebarGroup,
	SidebarGroupContent,
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
	SidebarRail,
} from "@/components/ui/sidebar";

const nav_items = [
	{ to: "/", label: "Overview", icon: LayoutDashboard, exact: true },
	{ to: "/sessions", label: "Sessions", icon: List, exact: false },
	{ to: "/usage", label: "Usage", icon: BarChart3, exact: false },
	{ to: "/qmd", label: "QMD", icon: LibraryBig, exact: false },
] as const;

export function AppSidebar() {
	const { pathname } = useLocation();

	const is_active = (to: string, exact?: boolean) => {
		if (exact) return pathname === to;
		return pathname.startsWith(to);
	};

	return (
		<Sidebar collapsible="icon">
			<SidebarContent>
				<SidebarGroup>
					<SidebarGroupContent>
						<SidebarMenu>
							{nav_items.map(({ to, label, icon: Icon, exact }) => (
								<SidebarMenuItem key={to}>
									<SidebarMenuButton
										render={<Link to={to} />}
										isActive={is_active(to, exact)}
										tooltip={label}
									>
										<Icon />
										<span>{label}</span>
									</SidebarMenuButton>
								</SidebarMenuItem>
							))}
						</SidebarMenu>
					</SidebarGroupContent>
				</SidebarGroup>
			</SidebarContent>
			<SidebarFooter className="border-t border-sidebar-border p-0">
				<ProviderLimitsSidebarCard />
			</SidebarFooter>
			<SidebarRail />
		</Sidebar>
	);
}

import { Outlet, useLocation } from "@tanstack/react-router";
import { useMemo } from "react";
import { AppSidebar } from "@/components/app-sidebar";
import { AppTitlebar } from "@/components/app-titlebar";
import { ThemeProvider } from "@/components/theme-provider";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { use_breadcrumbs } from "@/components/use-breadcrumbs";

export function AppLayout() {
	const { pathname } = useLocation();
	const breadcrumbs = use_breadcrumbs();

	const is_session_detail = /^\/sessions\/[^/]+(\/.*)?$/.test(pathname);

	const show_time_range_selector = useMemo(() => {
		if (pathname === "/") return true;
		if (pathname === "/sessions") return true;
		if (pathname.startsWith("/usage")) return true;
		return false;
	}, [pathname]);

	return (
		<ThemeProvider default_theme="dark" storage_key="ariadne-ui-theme">
			<SidebarProvider
				className="flex-col max-h-svh overflow-hidden"
				style={{ "--titlebar-h": "2.5rem" } as React.CSSProperties}
			>
				<AppTitlebar
					breadcrumbs={breadcrumbs}
					show_time_range_selector={show_time_range_selector}
				/>

				<div className="flex flex-1 overflow-hidden">
					<AppSidebar />

					<SidebarInset className="min-w-0 min-h-0 overflow-hidden">
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
				</div>
			</SidebarProvider>
		</ThemeProvider>
	);
}

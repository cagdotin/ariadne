import type { QmdAvailability } from "@contracts/qmd/availability";
import type { LucideIcon } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { qmd_check_availability } from "@/api/qmd";
import { use_qmd_enabled } from "@/components/app-settings-provider";
import { FeatureDisabledState } from "@/components/feature-disabled-state";
import { QmdUnavailableState } from "@/components/qmd-unavailable-state";
import { Skeleton } from "@/components/ui/skeleton";

interface QmdFeatureGateProps {
	disabled_icon: LucideIcon;
	disabled_title: string;
	disabled_description: string;
	unavailable_title?: string;
	unavailable_description?: string;
	children: React.ReactNode;
}

export function QmdFeatureGate({
	disabled_icon,
	disabled_title,
	disabled_description,
	unavailable_title,
	unavailable_description,
	children,
}: QmdFeatureGateProps) {
	const is_qmd_enabled = use_qmd_enabled();
	const [availability, set_availability] = useState<QmdAvailability | null>(
		null,
	);
	const [loading, set_loading] = useState(is_qmd_enabled);
	const request_id_ref = useRef(0);

	const refresh_availability = useCallback(async () => {
		if (!is_qmd_enabled) {
			request_id_ref.current += 1;
			set_availability(null);
			set_loading(false);
			return;
		}

		const request_id = ++request_id_ref.current;
		set_loading(true);

		try {
			const next_availability = await qmd_check_availability();
			if (request_id !== request_id_ref.current) return;
			set_availability(next_availability);
		} catch {
			if (request_id !== request_id_ref.current) return;
			set_availability(null);
		} finally {
			if (request_id === request_id_ref.current) {
				set_loading(false);
			}
		}
	}, [is_qmd_enabled]);

	useEffect(() => {
		void refresh_availability();
	}, [refresh_availability]);

	if (!is_qmd_enabled) {
		return (
			<FeatureDisabledState
				icon={disabled_icon}
				title={disabled_title}
				description={disabled_description}
			/>
		);
	}

	if (loading) {
		return (
			<div className="space-y-6">
				<Skeleton className="h-14 w-full" />
				<Skeleton className="h-7 w-24" />
				<div className="flex flex-wrap gap-3">
					{["one", "two", "three", "four"].map((key) => (
						<Skeleton key={key} className="h-[88px] min-w-[140px] flex-1" />
					))}
				</div>
				<Skeleton className="h-48" />
			</div>
		);
	}

	if (!availability?.installed) {
		return (
			<QmdUnavailableState
				title={unavailable_title}
				description={unavailable_description}
				availability={availability}
				on_refresh={refresh_availability}
				refreshing={loading}
			/>
		);
	}

	return <>{children}</>;
}

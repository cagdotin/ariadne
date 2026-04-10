import { Skeleton } from "@/components/ui/skeleton";

export function RouteFallback() {
	return (
		<div className="flex flex-col gap-4 p-6 w-full">
			<Skeleton className="h-8 w-48" />
			<Skeleton className="h-4 w-96" />
			<div className="flex gap-4 mt-4">
				<Skeleton className="h-32 w-full" />
				<Skeleton className="h-32 w-full" />
			</div>
			<Skeleton className="h-64 w-full mt-2" />
		</div>
	);
}

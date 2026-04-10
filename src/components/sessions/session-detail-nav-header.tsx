import type { ReactNode } from "react";

interface SessionDetailNavHeaderProps {
	children: ReactNode;
	right?: ReactNode;
}

export function SessionDetailNavHeader({
	children,
	right,
}: SessionDetailNavHeaderProps) {
	return (
		<div className="flex items-center justify-between shrink-0 border-b">
			<div className="flex items-center gap-4">{children}</div>
			{right && <div className="flex items-center gap-2">{right}</div>}
		</div>
	);
}

export function format_cost(cost: number): string {
	if (cost < 0.01) return `$${cost.toFixed(4)}`;
	if (cost < 1) return `$${cost.toFixed(2)}`;
	return `$${cost.toFixed(2)}`;
}

export function format_tokens(tokens: number): string {
	if (tokens >= 1_000_000_000) return `${(tokens / 1_000_000_000).toFixed(1)}B`;
	if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1)}M`;
	if (tokens >= 1_000) return `${(tokens / 1_000).toFixed(1)}K`;
	return tokens.toString();
}

export function format_duration(seconds: number | null): string {
	if (seconds === null || seconds <= 0) return "—";
	const hours = Math.floor(seconds / 3600);
	const minutes = Math.floor((seconds % 3600) / 60);
	if (hours > 0) return `${hours}h ${minutes}m`;
	if (minutes > 0) return `${minutes}m`;
	return `${Math.floor(seconds)}s`;
}

export function format_date(iso: string): string {
	const d = new Date(iso);
	return d.toLocaleDateString("en-US", {
		month: "short",
		day: "numeric",
		year: "numeric",
	});
}

export function format_date_short(iso: string): string {
	const d = new Date(iso);
	return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function format_date_relative(iso: string): string {
	const now = Date.now();
	const then = new Date(iso).getTime();
	const diff = now - then;
	const minutes = Math.floor(diff / 60000);
	const hours = Math.floor(diff / 3600000);
	const days = Math.floor(diff / 86400000);
	if (minutes < 1) return "just now";
	if (minutes < 60) return `${minutes}m ago`;
	if (hours < 24) return `${hours}h ago`;
	if (days < 7) return `${days}d ago`;
	return format_date_short(iso);
}

export function format_file_size(bytes: number): string {
	if (bytes >= 1_048_576) return `${(bytes / 1_048_576).toFixed(1)} MB`;
	if (bytes >= 1_024) return `${(bytes / 1_024).toFixed(0)} KB`;
	return `${bytes} B`;
}

export function format_number(n: number): string {
	return n.toLocaleString("en-US");
}

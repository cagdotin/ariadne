import { Link } from "@tanstack/react-router";
import {
	Breadcrumb,
	BreadcrumbItem,
	BreadcrumbLink,
	BreadcrumbList,
	BreadcrumbPage,
	BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";

interface PageHeaderProps {
	items: Array<{ label: string; href?: string }>;
}

export function PageHeader({ items }: PageHeaderProps) {
	return (
		<Breadcrumb>
			<BreadcrumbList>
				{items.flatMap((item, index) => {
					const is_last = index === items.length - 1;
					const elements = [
						// biome-ignore lint/suspicious/noArrayIndexKey: static list, index is stable
						<BreadcrumbItem key={`item-${index}`}>
							{is_last ? (
								<BreadcrumbPage>{item.label}</BreadcrumbPage>
							) : (
								<BreadcrumbLink render={<Link to={item.href ?? "#"} />}>
									{item.label}
								</BreadcrumbLink>
							)}
						</BreadcrumbItem>,
					];
					if (!is_last) {
						// biome-ignore lint/suspicious/noArrayIndexKey: static list, index is stable
						elements.push(<BreadcrumbSeparator key={`sep-${index}`} />);
					}
					return elements;
				})}
			</BreadcrumbList>
		</Breadcrumb>
	);
}

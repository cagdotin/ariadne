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
        {items.map((item, index) => {
          const is_last = index === items.length - 1;
          return (
            <BreadcrumbItem key={index}>
              {is_last ? (
                <BreadcrumbPage>{item.label}</BreadcrumbPage>
              ) : (
                <>
                  <BreadcrumbLink render={<Link to={item.href ?? "#"} />}>
                    {item.label}
                  </BreadcrumbLink>
                  <BreadcrumbSeparator />
                </>
              )}
            </BreadcrumbItem>
          );
        })}
      </BreadcrumbList>
    </Breadcrumb>
  );
}

import { useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";

export function UsageRedirect() {
	const navigate = useNavigate();
	useEffect(() => {
		navigate({ to: "/usage/cost", replace: true });
	}, [navigate]);
	return null;
}

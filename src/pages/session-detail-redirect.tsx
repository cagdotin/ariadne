import { useNavigate, useParams } from "@tanstack/react-router";
import { useEffect } from "react";

export function SessionDetailRedirect() {
	const navigate = useNavigate();
	const { id } = useParams({ strict: false }) as { id: string };

	useEffect(() => {
		navigate({ to: `/sessions/${id}/conversation`, replace: true });
	}, [navigate, id]);

	return null;
}

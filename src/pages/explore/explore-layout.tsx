import { ExploreProvider } from "./explore-context";
import { ExplorePage } from "./explore-page";

export function ExploreLayout() {
	return (
		<ExploreProvider>
			<ExplorePage />
		</ExploreProvider>
	);
}

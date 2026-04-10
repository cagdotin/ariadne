import { createContext, useContext, useEffect, useState } from "react";

type Theme = "dark" | "light" | "system";

type ThemeProviderProps = {
	children: React.ReactNode;
	default_theme?: Theme;
	storage_key?: string;
};

type ThemeProviderState = {
	theme: Theme;
	set_theme: (theme: Theme) => void;
};

const initial_state: ThemeProviderState = {
	theme: "system",
	set_theme: () => null,
};

const ThemeProviderContext = createContext<ThemeProviderState>(initial_state);

export function ThemeProvider({
	children,
	default_theme = "system",
	storage_key = "ariadne-ui-theme",
	...props
}: ThemeProviderProps) {
	const [theme, set_theme_state] = useState<Theme>(
		() => (localStorage.getItem(storage_key) as Theme) || default_theme,
	);

	useEffect(() => {
		const root = window.document.documentElement;

		root.classList.remove("light", "dark");

		if (theme === "system") {
			const system_theme = window.matchMedia("(prefers-color-scheme: dark)")
				.matches
				? "dark"
				: "light";

			root.classList.add(system_theme);
			return;
		}

		root.classList.add(theme);
	}, [theme]);

	const value = {
		theme,
		set_theme: (theme: Theme) => {
			localStorage.setItem(storage_key, theme);
			set_theme_state(theme);
		},
	};

	return (
		<ThemeProviderContext.Provider {...props} value={value}>
			{children}
		</ThemeProviderContext.Provider>
	);
}

export const use_theme = () => {
	const context = useContext(ThemeProviderContext);

	if (context === undefined)
		throw new Error("use_theme must be used within a ThemeProvider");

	return context;
};

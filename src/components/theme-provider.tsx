import {
	createContext,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useState,
} from "react";

export type Theme = "dark" | "light" | "system";

type ThemeProviderProps = {
	children: React.ReactNode;
	default_theme?: Theme;
	storage_key?: string;
};

type ThemeProviderState = {
	theme: Theme;
	set_theme: (theme: Theme) => void;
};

const ThemeProviderContext = createContext<ThemeProviderState | null>(null);

function is_theme(value: string | null): value is Theme {
	return value === "dark" || value === "light" || value === "system";
}

function read_theme(storage_key: string, default_theme: Theme): Theme {
	const stored_theme = localStorage.getItem(storage_key);
	return is_theme(stored_theme) ? stored_theme : default_theme;
}

export function ThemeProvider({
	children,
	default_theme = "system",
	storage_key = "ariadne-ui-theme",
	...props
}: ThemeProviderProps) {
	const [theme, set_theme_state] = useState<Theme>(() =>
		read_theme(storage_key, default_theme),
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

	const set_theme = useCallback(
		(next_theme: Theme) => {
			localStorage.setItem(storage_key, next_theme);
			set_theme_state(next_theme);
		},
		[storage_key],
	);

	const value = useMemo(() => ({ theme, set_theme }), [set_theme, theme]);

	return (
		<ThemeProviderContext.Provider {...props} value={value}>
			{children}
		</ThemeProviderContext.Provider>
	);
}

export function use_theme(): ThemeProviderState {
	const context = useContext(ThemeProviderContext);
	if (!context) {
		throw new Error("use_theme must be used within a ThemeProvider");
	}
	return context;
}

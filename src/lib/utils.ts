import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
	return twMerge(clsx(inputs));
}

/**
 * Extract a human-readable error message from an unknown caught value.
 *
 * Backend commands can reject with a plain string (not an Error instance).
 * This helper handles that case along with standard Error objects and
 * other thrown values.
 */
export function error_message(
	err: unknown,
	fallback = "Unknown error",
): string {
	if (err instanceof Error) return err.message;
	if (typeof err === "string" && err.length > 0) return err;
	return fallback;
}

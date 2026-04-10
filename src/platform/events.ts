// Platform adapter — event subscription / unsubscription.

export function subscribe(
	channel: string,
	callback: (payload: unknown) => void,
): string {
	return window.ariadne.events.on(channel, callback);
}

export function unsubscribe(subscription_id: string): void {
	window.ariadne.events.off(subscription_id);
}

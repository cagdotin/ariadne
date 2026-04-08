// Platform adapter — native dialog wrappers.

export async function pick_directory(
  options: { title: string },
): Promise<string | null> {
  return window.ariadne.dialogs.pick_directory(options);
}

// Platform adapter — thin wrapper around window.ariadne.commands.
// All renderer IPC goes through this module so the transport is a single
// point of change.

export const commands = window.ariadne.commands;

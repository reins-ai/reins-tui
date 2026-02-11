import { SERVICE_COMMANDS } from "./service-commands";

export interface Command {
  id: string;
  label: string;
  shortcut?: string;
  category: string;
  action: string;
}

export const DEFAULT_COMMANDS: Command[] = [
  {
    id: "new-conversation",
    label: "New Conversation",
    shortcut: "Ctrl+N",
    category: "Conversation",
    action: "NEW_CONVERSATION",
  },
  {
    id: "clear-messages",
    label: "Clear Messages",
    category: "Conversation",
    action: "CLEAR_MESSAGES",
  },
  {
    id: "switch-model",
    label: "Switch Model",
    category: "Model",
    action: "SWITCH_MODEL",
  },
  {
    id: "toggle-help",
    label: "Toggle Help",
    shortcut: "?",
    category: "Navigation",
    action: "TOGGLE_HELP",
  },
  {
    id: "focus-sidebar",
    label: "Focus Sidebar",
    shortcut: "Ctrl+1",
    category: "Navigation",
    action: "FOCUS_SIDEBAR",
  },
  {
    id: "focus-conversation",
    label: "Focus Conversation",
    shortcut: "Ctrl+2",
    category: "Navigation",
    action: "FOCUS_CONVERSATION",
  },
  {
    id: "focus-input",
    label: "Focus Input",
    shortcut: "Ctrl+3",
    category: "Navigation",
    action: "FOCUS_INPUT",
  },
  {
    id: "quit",
    label: "Quit",
    shortcut: "q",
    category: "Application",
    action: "QUIT",
  },
  ...SERVICE_COMMANDS,
];

export function filterCommands(commands: Command[], query: string): Command[] {
  const normalized = query.trim().toLowerCase();

  if (normalized.length === 0) {
    return commands;
  }

  return commands.filter((command) => {
    const label = command.label.toLowerCase();
    const category = command.category.toLowerCase();

    return label.includes(normalized) || category.includes(normalized);
  });
}

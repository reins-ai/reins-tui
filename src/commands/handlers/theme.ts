import { err, ok } from "../../daemon/contracts";
import type { CommandHandler } from "./types";

function resolveTheme(themes: readonly string[], requestedTheme: string): string | null {
  const normalized = requestedTheme.trim().toLowerCase();

  for (const theme of themes) {
    if (theme.toLowerCase() === normalized) {
      return theme;
    }
  }

  return null;
}

function formatThemeList(themes: readonly string[], activeTheme: string): string {
  const lines = themes.map((theme) => (theme === activeTheme ? `* ${theme} (active)` : `* ${theme}`));
  return ["Available themes:", ...lines].join("\n");
}

export const handleThemeCommand: CommandHandler = (args, context) => {
  const requestedTheme = args.positional[0]?.trim();
  const availableThemes = context.theme.listThemes();

  if (!requestedTheme) {
    return ok({
      statusMessage: `Theme: ${context.theme.activeTheme}`,
      responseText: formatThemeList(availableThemes, context.theme.activeTheme),
    });
  }

  const resolvedTheme = resolveTheme(availableThemes, requestedTheme);
  if (!resolvedTheme) {
    return err({
      code: "NOT_FOUND",
      message: `Unknown theme '${requestedTheme}'. Use /theme to list available themes.`,
    });
  }

  const switched = context.theme.setTheme(resolvedTheme);
  if (!switched) {
    return err({
      code: "UNSUPPORTED",
      message: `Could not activate theme '${resolvedTheme}'.`,
    });
  }

  return ok({
    statusMessage: `Theme set to ${resolvedTheme}`,
    responseText: `Theme switched to '${resolvedTheme}'.`,
  });
};

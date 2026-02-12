// Migrated from components/help-screen.tsx — screen-level overlay for keyboard shortcuts and greeting.

import { LogoAscii } from "../components/logo-ascii";
import type { StartupContent } from "../personalization/greeting-service";
import { useThemeTokens } from "../theme";
import { Box, Text } from "../ui";

export interface HelpShortcut {
  key: string;
  description: string;
}

export interface HelpShortcutCategory {
  title: string;
  shortcuts: HelpShortcut[];
}

export const HELP_SHORTCUT_CATEGORIES: HelpShortcutCategory[] = [
  {
    title: "NAVIGATION",
    shortcuts: [
      { key: "Tab", description: "Next panel" },
      { key: "Shift+Tab", description: "Previous panel" },
      { key: "Ctrl+1/2/3", description: "Jump to panel" },
    ],
  },
  {
    title: "CONVERSATION",
    shortcuts: [
      { key: "Enter", description: "Send message" },
      { key: "Shift+Enter", description: "New line" },
      { key: "Ctrl+N", description: "New conversation" },
      { key: "Up/Down", description: "Message history" },
    ],
  },
  {
    title: "SIDEBAR",
    shortcuts: [
      { key: "R", description: "Rename conversation" },
      { key: "D", description: "Delete conversation" },
      { key: "M", description: "Cycle model" },
    ],
  },
  {
    title: "APPLICATION",
    shortcuts: [
      { key: "Ctrl+K", description: "Command palette" },
      { key: "?", description: "Toggle this help" },
      { key: "q", description: "Quit" },
    ],
  },
];

function formatShortcutRow(shortcut: HelpShortcut): string {
  return `${shortcut.key.padEnd(12, " ")}${shortcut.description}`;
}

export function formatGreetingLines(startup: StartupContent): string[] {
  const lines: string[] = [startup.greeting];

  if (startup.contextSummary) {
    lines.push("");
    for (const line of startup.contextSummary.split("\n")) {
      lines.push(line);
    }
  }

  return lines;
}

export interface WelcomeGreetingProps {
  startup: StartupContent | null;
}

export function WelcomeGreeting({ startup }: WelcomeGreetingProps) {
  const { tokens } = useThemeTokens();

  if (!startup) {
    return null;
  }

  const lines = formatGreetingLines(startup);

  return (
    <Box style={{ flexDirection: "column", marginBottom: 1 }}>
      <Text style={{ color: tokens["text.primary"] }}>{lines[0]}</Text>
      {lines.slice(1).map((line, index) => (
        <Text key={`greeting-${index}`} style={{ color: tokens["text.muted"] }}>
          {line}
        </Text>
      ))}
    </Box>
  );
}

export interface HelpScreenProps {
  isOpen: boolean;
  startup?: StartupContent | null;
}

export function HelpScreen({ isOpen, startup = null }: HelpScreenProps) {
  const { tokens } = useThemeTokens();

  if (!isOpen) {
    return null;
  }

  return (
    <Box
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        width: "100%",
        height: "100%",
        backgroundColor: tokens["surface.primary"],
        flexDirection: "column",
        paddingTop: 2,
        paddingLeft: 8,
        paddingRight: 8,
      }}
    >
      <Box style={{ flexDirection: "column", marginBottom: 1 }}>
        <LogoAscii variant="standard" size="full" showTagline />
      </Box>
      {startup && <WelcomeGreeting startup={startup} />}
      <Box
        style={{
          border: true,
          borderColor: tokens["border.focus"],
          backgroundColor: tokens["surface.secondary"],
          flexDirection: "column",
          padding: 1,
        }}
      >
        <Text>Help</Text>
        <Text content="" />
        {HELP_SHORTCUT_CATEGORIES.map((category) => (
          <Box key={category.title} style={{ flexDirection: "column" }}>
            <Text style={{ color: tokens["accent.primary"] }}>{category.title}</Text>
            {category.shortcuts.map((shortcut) => (
              <Text key={`${category.title}-${shortcut.key}`} content={formatShortcutRow(shortcut)} />
            ))}
            <Text content="" />
          </Box>
        ))}
        <Text style={{ color: tokens["text.muted"] }}>Press ? or Esc to close</Text>
      </Box>
    </Box>
  );
}

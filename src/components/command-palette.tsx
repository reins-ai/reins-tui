import { useEffect, useMemo, useState } from "react";

import { type Command, filterCommands } from "../lib";
import { useThemeTokens } from "../theme";
import { Input, Box, Text, useKeyboard } from "../ui";

export interface CommandPaletteProps {
  isOpen: boolean;
  commands: Command[];
  onClose(): void;
  onExecute(command: Command): void;
}

function isEscapeKey(name?: string): boolean {
  return name === "escape" || name === "esc";
}

function isUpKey(name?: string): boolean {
  return name === "up";
}

function isDownKey(name?: string): boolean {
  return name === "down";
}

function isEnterKey(name?: string): boolean {
  return name === "return" || name === "enter";
}

function extractInputValue(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "object" && value !== null) {
    if ("plainText" in value && typeof value.plainText === "string") {
      return value.plainText;
    }

    if ("value" in value && typeof value.value === "string") {
      return value.value;
    }
  }

  return "";
}

export function CommandPalette({ isOpen, commands, onClose, onExecute }: CommandPaletteProps) {
  const { tokens } = useThemeTokens();
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const filteredCommands = useMemo(() => filterCommands(commands, query), [commands, query]);

  useEffect(() => {
    if (!isOpen) {
      setQuery("");
      setSelectedIndex(0);
      return;
    }

    setSelectedIndex(0);
  }, [isOpen]);

  useKeyboard((event) => {
    if (!isOpen) {
      return;
    }

    if (isEscapeKey(event.name)) {
      onClose();
      return;
    }

    if (filteredCommands.length === 0) {
      return;
    }

    if (isUpKey(event.name)) {
      setSelectedIndex((current) => {
        const next = current - 1;
        return next < 0 ? filteredCommands.length - 1 : next;
      });
      return;
    }

    if (isDownKey(event.name)) {
      setSelectedIndex((current) => (current + 1) % filteredCommands.length);
      return;
    }

    if (isEnterKey(event.name)) {
      const command = filteredCommands[selectedIndex];
      if (command) {
        onExecute(command);
      }
    }
  });

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
        paddingTop: 3,
        paddingLeft: 6,
        paddingRight: 6,
      }}
    >
      <Box
        style={{
          border: true,
          borderColor: tokens["border.focus"],
          backgroundColor: tokens["surface.secondary"],
          padding: 1,
          flexDirection: "column",
        }}
      >
        <Text>Command Palette (Esc to close)</Text>
        <Input
          focused
          placeholder="Search commands..."
          value={query}
          onInput={(value) => {
            setQuery(extractInputValue(value));
            setSelectedIndex(0);
          }}
        />

        <Box style={{ marginTop: 1, flexDirection: "column" }}>
          {filteredCommands.length === 0 ? (
            <Text>No matching commands</Text>
          ) : (
            filteredCommands.map((command, index) => {
              const isSelected = index === selectedIndex;

              return (
                <Box
                  key={command.id}
                  style={{
                    flexDirection: "row",
                    paddingLeft: 1,
                    paddingRight: 1,
                    backgroundColor: isSelected ? tokens["surface.elevated"] : "transparent",
                  }}
                >
                  <Text content={`${command.label} (${command.category})`} />
                  <Text content={command.shortcut ? ` ${command.shortcut}` : ""} style={{ color: tokens["text.secondary"] }} />
                </Box>
              );
            })
          )}
        </Box>
      </Box>
    </Box>
  );
}

import { existsSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

import * as cardAdaptersModule from "../../src/cards/card-adapters";
import * as commandPaletteModule from "../../src/components/command-palette";
import * as statusBarModule from "../../src/components/status-bar";
import * as streamingTextModule from "../../src/components/streaming-text";
import * as themeCommandModule from "../../src/commands/handlers/theme";
import * as commandRegistryModule from "../../src/commands/registry";
import * as daemonContractsModule from "../../src/daemon/contracts";
import * as mockDaemonModule from "../../src/daemon/mock-daemon";
import * as reconnectPolicyModule from "../../src/daemon/reconnect-policy";
import * as breakpointsModule from "../../src/layout/breakpoints";
import * as fuzzyIndexModule from "../../src/palette/fuzzy-index";
import * as greetingServiceModule from "../../src/personalization/greeting-service";
import * as connectServiceModule from "../../src/providers/connect-service";
import * as layoutModeModule from "../../src/state/layout-mode";
import * as statusMachineModule from "../../src/state/status-machine";
import * as fallback256Module from "../../src/theme/fallback-256";
import * as themeRegistryModule from "../../src/theme/theme-registry";
import * as toolLifecycleModule from "../../src/tools/tool-lifecycle";

function expectRepoFile(relativePath: string): void {
  expect(existsSync(join(process.cwd(), relativePath))).toBe(true);
}

describe("Contract Traceability: MH1-MH17", () => {
  test("MH1: daemon client contract, reconnect policy, and fallback artifacts exist", () => {
    expect(typeof daemonContractsModule.ok).toBe("function");
    expect(typeof mockDaemonModule.MockDaemonClient).toBe("function");
    expect(typeof reconnectPolicyModule.ExponentialReconnectPolicy).toBe("function");
    expectRepoFile("reins-tui/tests/integration/daemon-live.test.ts");
    expectRepoFile("reins-tui/tests/integration/daemon-offline.test.ts");
  });

  test("MH2: theme registry loads built-ins, fallback mapping, and /theme handler", () => {
    const registryResult = themeRegistryModule.createThemeRegistry();
    expect(registryResult.ok).toBe(true);
    if (registryResult.ok) {
      expect(registryResult.value.listThemes().length).toBe(5);
      expect(typeof registryResult.value.getTheme().fallback256).toBe("object");
    }

    expect(typeof fallback256Module.resolveTheme256).toBe("function");
    expect(typeof themeCommandModule.handleThemeCommand).toBe("function");
  });

  test("MH3: layout mode orchestration and conversation-first layout artifacts exist", () => {
    expect(typeof layoutModeModule.reduceLayoutMode).toBe("function");
    expect(layoutModeModule.LAYOUT_MODES).toContain("normal");
    expect(layoutModeModule.LAYOUT_MODES).toContain("activity");
    expect(layoutModeModule.LAYOUT_MODES).toContain("zen");
    expectRepoFile("reins-tui/tests/components/conversation-panel.test.tsx");
  });

  test("MH4: streaming lifecycle state machine and cursor exports exist", () => {
    expect(typeof statusMachineModule.reduceStatusMachine).toBe("function");
    expect(typeof statusMachineModule.createInitialStatusMachineState).toBe("function");
    expect(typeof streamingTextModule.resolveCursorForStatus).toBe("function");
    expect(streamingTextModule.STREAMING_CURSOR).toBeString();
  });

  test("MH5: slash command registry covers required command surface", () => {
    expect(Array.isArray(commandRegistryModule.SLASH_COMMANDS)).toBe(true);
    expect(commandRegistryModule.SLASH_COMMANDS.some((command) => command.name === "help")).toBe(true);
    expect(commandRegistryModule.SLASH_COMMANDS.some((command) => command.name === "theme")).toBe(true);
    expect(commandRegistryModule.SLASH_COMMANDS.some((command) => command.name === "connect")).toBe(true);
  });

  test("MH6: command palette and fuzzy index APIs exist", () => {
    expect(typeof commandPaletteModule.CommandPalette).toBe("function");
    expect(typeof fuzzyIndexModule.createFuzzySearchIndex).toBe("function");
    expect(typeof fuzzyIndexModule.searchFuzzyIndex).toBe("function");
  });

  test("MH7: rich card adapters map tool output to typed card contracts", () => {
    const calendarCard = cardAdaptersModule.adaptToolOutput("calendar", { title: "Daily Sync", startTime: "2026-02-11T10:00:00.000Z" });
    const noteCard = cardAdaptersModule.adaptToolOutput("notes", { title: "Todo", content: "Ship MVP" });
    const reminderCard = cardAdaptersModule.adaptToolOutput("reminders", { title: "Standup", dueAt: "2026-02-12T09:00:00.000Z" });

    expect(calendarCard.type).toBe("calendar-event");
    expect(noteCard.type).toBe("note");
    expect(reminderCard.type).toBe("reminder");
  });

  test("MH8: inline tool lifecycle model exports glyph and reducer contracts", () => {
    expect(typeof toolLifecycleModule.createQueuedToolCall).toBe("function");
    expect(typeof toolLifecycleModule.toolCallReducer).toBe("function");
    expect(toolLifecycleModule.getToolGlyph("running")).toBe("◎");
    expect(toolLifecycleModule.getToolGlyph("success")).toBe("✦");
    expect(toolLifecycleModule.getToolGlyph("error")).toBe("✧");
  });

  test("MH9: provider connection flow service and /connect artifacts exist", () => {
    expect(typeof connectServiceModule.ConnectService).toBe("function");
    expectRepoFile("reins-tui/src/components/connect-flow.tsx");
    expectRepoFile("reins-tui/tests/integration/provider-flow.test.ts");
  });

  test("MH10: reins launcher entrypoint contract exists", async () => {
    const cliModule = await import("../../../reins-core/src/cli/index");
    expect(typeof cliModule.runCli).toBe("function");
    expect(typeof cliModule.routeCliArgs).toBe("function");
  });

  test("MH11: reins setup command contract exists", async () => {
    const setupModule = await import("../../../reins-core/src/cli/commands/setup");
    expect(typeof setupModule.runSetup).toBe("function");
    expect(typeof setupModule.parseSetupFlags).toBe("function");
  });

  test("MH12: reins status command contract exists", async () => {
    const statusModule = await import("../../../reins-core/src/cli/commands/status");
    expect(typeof statusModule.runStatus).toBe("function");
  });

  test("MH13: reins service lifecycle command contract exists", async () => {
    const serviceModule = await import("../../../reins-core/src/cli/commands/service");
    expect(typeof serviceModule.runService).toBe("function");
  });

  test("MH14: one-shot query command contract exists", async () => {
    const oneshotModule = await import("../../../reins-core/src/cli/commands/oneshot");
    expect(typeof oneshotModule.runOneshot).toBe("function");
  });

  test("MH15: heartbeat indicator contract exports and integration tests exist", () => {
    expect(statusBarModule.HEARTBEAT_GLYPH).toBe("·");
    expect(typeof statusBarModule.resolveHeartbeatInterval).toBe("function");
    expect(typeof statusBarModule.HeartbeatPulse).toBe("function");
    expectRepoFile("reins-tui/tests/components/status-bar.test.tsx");
  });

  test("MH16: time-aware greeting service contract exists", () => {
    expect(typeof greetingServiceModule.GreetingService).toBe("function");
    const service = new greetingServiceModule.GreetingService({
      configNameReader: () => "Jamie",
      now: () => new Date("2026-02-11T09:00:00.000Z"),
    });

    expect(service.generateGreeting()).toContain("Jamie");
  });

  test("MH17: responsive breakpoint contracts and compatibility artifacts exist", () => {
    expect(typeof breakpointsModule.getBreakpointBand).toBe("function");
    expect(typeof breakpointsModule.resolveBreakpointState).toBe("function");
    expect(breakpointsModule.getBreakpointBand(59)).toBe("compact");
    expect(breakpointsModule.getBreakpointBand(160)).toBe("standard");
    expect(breakpointsModule.getBreakpointBand(180)).toBe("wide");
    expectRepoFile("reins-tui/tests/compat/breakpoint-snapshots.test.tsx");
  });
});

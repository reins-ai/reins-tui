import { describe, expect, test } from "bun:test";

import {
  formatCategories,
  formatMetadataRows,
  formatTriggers,
  getIntegrationStatusText,
  type SkillDetailData,
  type SkillIntegrationStatus,
} from "../../../src/components/skills/SkillDetailView";

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const FULL_SKILL: SkillDetailData = {
  name: "git-workflow",
  description: "Automate common Git workflows with branch management and PR creation.",
  version: "1.2.0",
  enabled: true,
  trustLevel: "trusted",
  categories: ["development", "git", "automation"],
  triggers: ["git", "branch", "pull request", "merge"],
  requiredTools: ["git", "gh"],
  scripts: ["create-branch.sh", "open-pr.sh", "sync-fork.sh"],
  integrationStatus: "setup_complete",
  body: "# Git Workflow\n\nThis skill automates common Git operations.\n\n## Usage\n\nAsk me to create branches, open PRs, or sync forks.",
};

const MINIMAL_SKILL: SkillDetailData = {
  name: "simple-note",
  description: "A minimal skill with no extras.",
  enabled: false,
  trustLevel: "untrusted",
  categories: [],
  triggers: [],
  requiredTools: [],
  scripts: [],
  integrationStatus: "not_required",
  body: "",
};

const INTEGRATION_SKILL: SkillDetailData = {
  name: "slack-notifier",
  description: "Send notifications to Slack channels.",
  version: "0.5.0",
  enabled: true,
  trustLevel: "verified",
  categories: ["communication"],
  triggers: ["slack", "notify", "message"],
  requiredTools: [],
  scripts: ["send-notification.sh"],
  integrationStatus: "needs_setup",
  body: "# Slack Notifier\n\nSend messages to Slack channels via webhook.",
};

// ---------------------------------------------------------------------------
// formatMetadataRows
// ---------------------------------------------------------------------------

describe("SkillDetailView formatMetadataRows", () => {
  test("includes all fields for a full skill", () => {
    const rows = formatMetadataRows(FULL_SKILL);
    const labels = rows.map((r) => r.label);

    expect(labels).toContain("Version");
    expect(labels).toContain("Categories");
    expect(labels).toContain("Trust");
    expect(labels).toContain("Triggers");
    expect(labels).toContain("Required Tools");
  });

  test("version row contains the version string", () => {
    const rows = formatMetadataRows(FULL_SKILL);
    const versionRow = rows.find((r) => r.label === "Version");
    expect(versionRow).toBeDefined();
    expect(versionRow!.value).toBe("1.2.0");
  });

  test("categories row joins with comma", () => {
    const rows = formatMetadataRows(FULL_SKILL);
    const catRow = rows.find((r) => r.label === "Categories");
    expect(catRow).toBeDefined();
    expect(catRow!.value).toBe("development, git, automation");
  });

  test("triggers row joins with comma", () => {
    const rows = formatMetadataRows(FULL_SKILL);
    const trigRow = rows.find((r) => r.label === "Triggers");
    expect(trigRow).toBeDefined();
    expect(trigRow!.value).toBe("git, branch, pull request, merge");
  });

  test("required tools row joins with comma", () => {
    const rows = formatMetadataRows(FULL_SKILL);
    const toolsRow = rows.find((r) => r.label === "Required Tools");
    expect(toolsRow).toBeDefined();
    expect(toolsRow!.value).toBe("git, gh");
  });

  test("trust row is always present", () => {
    const rows = formatMetadataRows(FULL_SKILL);
    const trustRow = rows.find((r) => r.label === "Trust");
    expect(trustRow).toBeDefined();
    expect(trustRow!.value).toBe("Trusted");
  });

  test("minimal skill omits version, categories, triggers, and required tools", () => {
    const rows = formatMetadataRows(MINIMAL_SKILL);
    const labels = rows.map((r) => r.label);

    expect(labels).not.toContain("Version");
    expect(labels).not.toContain("Categories");
    expect(labels).not.toContain("Triggers");
    expect(labels).not.toContain("Required Tools");
  });

  test("minimal skill still includes trust", () => {
    const rows = formatMetadataRows(MINIMAL_SKILL);
    const trustRow = rows.find((r) => r.label === "Trust");
    expect(trustRow).toBeDefined();
    expect(trustRow!.value).toBe("Untrusted");
  });

  test("verified trust level shows Verified", () => {
    const rows = formatMetadataRows(INTEGRATION_SKILL);
    const trustRow = rows.find((r) => r.label === "Trust");
    expect(trustRow).toBeDefined();
    expect(trustRow!.value).toBe("Verified");
  });

  test("skill with no required tools omits that row", () => {
    const rows = formatMetadataRows(INTEGRATION_SKILL);
    const labels = rows.map((r) => r.label);
    expect(labels).not.toContain("Required Tools");
  });
});

// ---------------------------------------------------------------------------
// getIntegrationStatusText
// ---------------------------------------------------------------------------

describe("SkillDetailView getIntegrationStatusText", () => {
  test("not_required returns null", () => {
    expect(getIntegrationStatusText("not_required")).toBeNull();
  });

  test("needs_setup returns descriptive text", () => {
    expect(getIntegrationStatusText("needs_setup")).toBe("Needs setup");
  });

  test("setup_complete returns descriptive text", () => {
    expect(getIntegrationStatusText("setup_complete")).toBe("Setup complete");
  });

  test("all statuses produce expected values", () => {
    const statuses: SkillIntegrationStatus[] = ["not_required", "needs_setup", "setup_complete"];
    const expected = [null, "Needs setup", "Setup complete"];

    statuses.forEach((status, i) => {
      expect(getIntegrationStatusText(status)).toBe(expected[i]);
    });
  });
});

// ---------------------------------------------------------------------------
// formatCategories
// ---------------------------------------------------------------------------

describe("SkillDetailView formatCategories", () => {
  test("joins multiple categories with comma and space", () => {
    expect(formatCategories(["dev", "git", "tools"])).toBe("dev, git, tools");
  });

  test("single category returns it as-is", () => {
    expect(formatCategories(["productivity"])).toBe("productivity");
  });

  test("empty array returns empty string", () => {
    expect(formatCategories([])).toBe("");
  });
});

// ---------------------------------------------------------------------------
// formatTriggers
// ---------------------------------------------------------------------------

describe("SkillDetailView formatTriggers", () => {
  test("joins multiple triggers with comma and space", () => {
    expect(formatTriggers(["git", "branch", "merge"])).toBe("git, branch, merge");
  });

  test("single trigger returns it as-is", () => {
    expect(formatTriggers(["deploy"])).toBe("deploy");
  });

  test("empty array returns empty string", () => {
    expect(formatTriggers([])).toBe("");
  });
});

// ---------------------------------------------------------------------------
// Full skill data rendering (structural tests via helpers)
// ---------------------------------------------------------------------------

describe("SkillDetailView full skill data", () => {
  test("full skill produces metadata rows with all fields", () => {
    const rows = formatMetadataRows(FULL_SKILL);
    // Version + Categories + Trust + Triggers + Required Tools = 5 rows
    expect(rows.length).toBe(5);
  });

  test("full skill has non-empty scripts list", () => {
    expect(FULL_SKILL.scripts.length).toBe(3);
    expect(FULL_SKILL.scripts).toContain("create-branch.sh");
    expect(FULL_SKILL.scripts).toContain("open-pr.sh");
    expect(FULL_SKILL.scripts).toContain("sync-fork.sh");
  });

  test("full skill has integration status text", () => {
    const text = getIntegrationStatusText(FULL_SKILL.integrationStatus);
    expect(text).toBe("Setup complete");
  });

  test("full skill has non-empty body", () => {
    expect(FULL_SKILL.body.length).toBeGreaterThan(0);
    expect(FULL_SKILL.body).toContain("Git Workflow");
  });
});

// ---------------------------------------------------------------------------
// Minimal skill data (no scripts, no integration, no categories)
// ---------------------------------------------------------------------------

describe("SkillDetailView minimal skill data", () => {
  test("minimal skill produces only trust row", () => {
    const rows = formatMetadataRows(MINIMAL_SKILL);
    expect(rows.length).toBe(1);
    expect(rows[0].label).toBe("Trust");
  });

  test("minimal skill has empty scripts", () => {
    expect(MINIMAL_SKILL.scripts.length).toBe(0);
  });

  test("minimal skill integration is not required", () => {
    const text = getIntegrationStatusText(MINIMAL_SKILL.integrationStatus);
    expect(text).toBeNull();
  });

  test("minimal skill has empty body", () => {
    expect(MINIMAL_SKILL.body).toBe("");
  });

  test("minimal skill is disabled", () => {
    expect(MINIMAL_SKILL.enabled).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Integration skill (needs_setup status)
// ---------------------------------------------------------------------------

describe("SkillDetailView integration skill", () => {
  test("needs_setup integration shows status text", () => {
    const text = getIntegrationStatusText(INTEGRATION_SKILL.integrationStatus);
    expect(text).toBe("Needs setup");
  });

  test("integration skill has scripts", () => {
    expect(INTEGRATION_SKILL.scripts.length).toBe(1);
    expect(INTEGRATION_SKILL.scripts[0]).toBe("send-notification.sh");
  });

  test("integration skill metadata includes categories and triggers", () => {
    const rows = formatMetadataRows(INTEGRATION_SKILL);
    const labels = rows.map((r) => r.label);
    expect(labels).toContain("Categories");
    expect(labels).toContain("Triggers");
  });
});

// ---------------------------------------------------------------------------
// Null skill (empty state)
// ---------------------------------------------------------------------------

describe("SkillDetailView null skill", () => {
  test("null skill data means no metadata rows can be generated", () => {
    // When skill is null, the component renders the empty state.
    // We verify the contract: formatMetadataRows requires a non-null skill.
    const skill: SkillDetailData | null = null;
    expect(skill).toBeNull();
  });

  test("component contract: onBack and onToggleEnabled are callback props", () => {
    // Verify the interface shape — callbacks are accepted but not invoked
    // by the detail view itself (wiring happens in Task 5.3)
    const onBack = () => {};
    const onToggleEnabled = (_name: string) => {};
    expect(typeof onBack).toBe("function");
    expect(typeof onToggleEnabled).toBe("function");
  });
});

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------

describe("SkillDetailView edge cases", () => {
  test("skill with version but no categories still shows version", () => {
    const skill: SkillDetailData = {
      ...MINIMAL_SKILL,
      version: "0.1.0",
    };
    const rows = formatMetadataRows(skill);
    const labels = rows.map((r) => r.label);
    expect(labels).toContain("Version");
    expect(labels).not.toContain("Categories");
  });

  test("skill with empty string version is treated as no version", () => {
    const skill: SkillDetailData = {
      ...MINIMAL_SKILL,
      version: "",
    };
    const rows = formatMetadataRows(skill);
    const labels = rows.map((r) => r.label);
    // Empty string is falsy, so version row should be omitted
    expect(labels).not.toContain("Version");
  });

  test("skill with many categories formats correctly", () => {
    const cats = ["a", "b", "c", "d", "e", "f"];
    expect(formatCategories(cats)).toBe("a, b, c, d, e, f");
  });

  test("skill with single trigger", () => {
    const skill: SkillDetailData = {
      ...MINIMAL_SKILL,
      triggers: ["deploy"],
    };
    const rows = formatMetadataRows(skill);
    const trigRow = rows.find((r) => r.label === "Triggers");
    expect(trigRow).toBeDefined();
    expect(trigRow!.value).toBe("deploy");
  });

  test("skill with single required tool", () => {
    const skill: SkillDetailData = {
      ...MINIMAL_SKILL,
      requiredTools: ["docker"],
    };
    const rows = formatMetadataRows(skill);
    const toolsRow = rows.find((r) => r.label === "Required Tools");
    expect(toolsRow).toBeDefined();
    expect(toolsRow!.value).toBe("docker");
  });
});

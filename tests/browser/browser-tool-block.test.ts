import { describe, expect, test } from "bun:test";

import { adaptToolOutput } from "../../src/cards/card-adapters";
import { validateCard, type ContentCard } from "../../src/cards/card-schemas";

describe("browser tool block adapters", () => {
  describe("browser (nav) adapter", () => {
    test("adapts navigate action with url and title", () => {
      const card = adaptToolOutput("browser", {
        action: "navigate",
        url: "https://example.com",
        title: "Example Domain",
      });

      expect(card.type).toBe("browser-nav");
      if (card.type !== "browser-nav") return;

      expect(card.action).toBe("navigate");
      expect(card.url).toBe("https://example.com");
      expect(card.title).toBe("Example Domain");
    });

    test("adapts status action with tab count", () => {
      const card = adaptToolOutput("browser", {
        action: "status",
        url: "https://example.com",
        count: 3,
        message: "Browser running",
      });

      expect(card.type).toBe("browser-nav");
      if (card.type !== "browser-nav") return;

      expect(card.action).toBe("status");
      expect(card.tabCount).toBe(3);
      expect(card.message).toBe("Browser running");
    });

    test("adapts list_tabs action with tabs array", () => {
      const card = adaptToolOutput("browser", {
        action: "list_tabs",
        tabs: [{ id: 1 }, { id: 2 }],
      });

      expect(card.type).toBe("browser-nav");
      if (card.type !== "browser-nav") return;

      expect(card.action).toBe("list_tabs");
      expect(card.tabCount).toBe(2);
    });

    test("adapts new_tab action with message", () => {
      const card = adaptToolOutput("browser", {
        action: "new_tab",
        url: "about:blank",
        message: "New tab opened",
      });

      expect(card.type).toBe("browser-nav");
      if (card.type !== "browser-nav") return;

      expect(card.action).toBe("new_tab");
      expect(card.url).toBe("about:blank");
      expect(card.message).toBe("New tab opened");
    });

    test("falls back to plain-text for non-object output", () => {
      const card = adaptToolOutput("browser", "just a string");
      expect(card.type).toBe("plain-text");
    });

    test("falls back to plain-text for missing action", () => {
      const card = adaptToolOutput("browser", { url: "https://example.com" });
      expect(card.type).toBe("plain-text");
    });
  });

  describe("browser_snapshot adapter", () => {
    test("adapts snapshot with structured output", () => {
      const card = adaptToolOutput("browser_snapshot", {
        url: "https://example.com",
        format: "text",
        content: '[e0] link "Home"\n[e1] button "Sign In"',
        elementCount: 2,
      });

      expect(card.type).toBe("browser-snapshot");
      if (card.type !== "browser-snapshot") return;

      expect(card.url).toBe("https://example.com");
      expect(card.format).toBe("text");
      expect(card.content).toContain('[e0] link "Home"');
      expect(card.elementCount).toBe(2);
      expect(card.truncated).toBe(false);
    });

    test("truncates content exceeding 500 chars", () => {
      const longContent = "a".repeat(800);
      const card = adaptToolOutput("browser_snapshot", {
        content: longContent,
        format: "compact",
      });

      expect(card.type).toBe("browser-snapshot");
      if (card.type !== "browser-snapshot") return;

      expect(card.truncated).toBe(true);
      expect(card.content.length).toBeLessThan(longContent.length);
      expect(card.content).toContain("[...truncated 300 chars]");
    });

    test("does not truncate content at exactly 500 chars", () => {
      const exactContent = "b".repeat(500);
      const card = adaptToolOutput("browser_snapshot", {
        content: exactContent,
        format: "text",
      });

      expect(card.type).toBe("browser-snapshot");
      if (card.type !== "browser-snapshot") return;

      expect(card.truncated).toBe(false);
      expect(card.content).toBe(exactContent);
    });

    test("adapts raw string content as snapshot", () => {
      const card = adaptToolOutput("browser_snapshot", '[e0] link "Home"');

      expect(card.type).toBe("browser-snapshot");
      if (card.type !== "browser-snapshot") return;

      expect(card.format).toBe("text");
      expect(card.content).toBe('[e0] link "Home"');
    });

    test("defaults format to text when missing", () => {
      const card = adaptToolOutput("browser_snapshot", {
        content: "some content",
      });

      expect(card.type).toBe("browser-snapshot");
      if (card.type !== "browser-snapshot") return;

      expect(card.format).toBe("text");
    });
  });

  describe("browser_act adapter", () => {
    test("adapts click action with ref", () => {
      const card = adaptToolOutput("browser_act", {
        action: "click",
        ref: "e0",
        message: 'Clicked "Home" link',
      });

      expect(card.type).toBe("browser-action");
      if (card.type !== "browser-action") return;

      expect(card.action).toBe("click");
      expect(card.ref).toBe("e0");
      expect(card.message).toBe('Clicked "Home" link');
      expect(card.hasScreenshotData).toBe(false);
    });

    test("adapts screenshot action with file path", () => {
      const card = adaptToolOutput("browser_act", {
        action: "screenshot",
        path: "/home/user/.reins/browser/screenshots/screenshot-2026-02-17.jpg",
        message: "Screenshot saved",
      });

      expect(card.type).toBe("browser-action");
      if (card.type !== "browser-action") return;

      expect(card.action).toBe("screenshot");
      expect(card.screenshotPath).toBe("/home/user/.reins/browser/screenshots/screenshot-2026-02-17.jpg");
      expect(card.hasScreenshotData).toBe(false);
    });

    test("adapts screenshot action with inline data", () => {
      const card = adaptToolOutput("browser_act", {
        action: "screenshot",
        data: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk",
        mimeType: "image/jpeg",
      });

      expect(card.type).toBe("browser-action");
      if (card.type !== "browser-action") return;

      expect(card.action).toBe("screenshot");
      expect(card.hasScreenshotData).toBe(true);
      expect(card.screenshotPath).toBeUndefined();
    });

    test("adapts type action with ref", () => {
      const card = adaptToolOutput("browser_act", {
        action: "type",
        ref: "e2",
        message: 'Typed into "Email" input',
      });

      expect(card.type).toBe("browser-action");
      if (card.type !== "browser-action") return;

      expect(card.action).toBe("type");
      expect(card.ref).toBe("e2");
    });

    test("falls back to plain-text for missing action", () => {
      const card = adaptToolOutput("browser_act", { ref: "e0" });
      expect(card.type).toBe("plain-text");
    });

    test("reads element from alternative field name", () => {
      const card = adaptToolOutput("browser_act", {
        action: "hover",
        element: "e5",
      });

      expect(card.type).toBe("browser-action");
      if (card.type !== "browser-action") return;

      expect(card.ref).toBe("e5");
    });
  });

  describe("regression: unknown tools", () => {
    test("unknown tool falls back to plain-text", () => {
      const card = adaptToolOutput("unknown_tool", { data: "test" });
      expect(card.type).toBe("plain-text");
    });

    test("empty string tool name falls back to plain-text", () => {
      const card = adaptToolOutput("", { data: "test" });
      expect(card.type).toBe("plain-text");
    });
  });
});

describe("browser card validation", () => {
  test("validates browser-nav card", () => {
    const card: ContentCard = {
      type: "browser-nav",
      action: "navigate",
      url: "https://example.com",
      title: "Example",
      tabCount: 1,
      message: "Navigated",
    };

    const result = validateCard(card);
    expect(result).toEqual(card);
  });

  test("validates browser-nav card with minimal fields", () => {
    const card: ContentCard = {
      type: "browser-nav",
      action: "status",
    };

    const result = validateCard(card);
    expect(result).toEqual(card);
  });

  test("rejects browser-nav card with missing action", () => {
    const result = validateCard({ type: "browser-nav" });
    expect(result).toBeNull();
  });

  test("validates browser-snapshot card", () => {
    const card: ContentCard = {
      type: "browser-snapshot",
      url: "https://example.com",
      format: "text",
      content: '[e0] link "Home"',
      elementCount: 1,
      truncated: false,
    };

    const result = validateCard(card);
    expect(result).toEqual(card);
  });

  test("validates browser-snapshot card with empty content", () => {
    const card: ContentCard = {
      type: "browser-snapshot",
      format: "compact",
      content: "",
      truncated: true,
    };

    const result = validateCard(card);
    expect(result).toEqual(card);
  });

  test("rejects browser-snapshot card with missing format", () => {
    const result = validateCard({
      type: "browser-snapshot",
      content: "test",
      truncated: false,
    });
    expect(result).toBeNull();
  });

  test("rejects browser-snapshot card with missing truncated", () => {
    const result = validateCard({
      type: "browser-snapshot",
      format: "text",
      content: "test",
    });
    expect(result).toBeNull();
  });

  test("validates browser-action card", () => {
    const card: ContentCard = {
      type: "browser-action",
      action: "click",
      ref: "e0",
      message: "Clicked",
      hasScreenshotData: false,
    };

    const result = validateCard(card);
    expect(result).toEqual(card);
  });

  test("validates browser-action card with screenshot path", () => {
    const card: ContentCard = {
      type: "browser-action",
      action: "screenshot",
      screenshotPath: "/path/to/screenshot.jpg",
      hasScreenshotData: false,
    };

    const result = validateCard(card);
    expect(result).toEqual(card);
  });

  test("rejects browser-action card with missing action", () => {
    const result = validateCard({
      type: "browser-action",
      hasScreenshotData: false,
    });
    expect(result).toBeNull();
  });

  test("rejects browser-action card with missing hasScreenshotData", () => {
    const result = validateCard({
      type: "browser-action",
      action: "click",
    });
    expect(result).toBeNull();
  });
});

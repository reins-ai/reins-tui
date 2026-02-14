import { describe, expect, test } from "bun:test";

import { DaemonEnvironmentClient } from "../../src/daemon/environment-client";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("DaemonEnvironmentClient", () => {
  test("refresh hydrates active and available environments", async () => {
    const client = new DaemonEnvironmentClient({
      baseUrl: "http://localhost:7433",
      fetchImpl: async () => jsonResponse(200, {
        activeEnvironment: "work",
        environments: [
          { name: "default", path: "/tmp/default", availableDocumentTypes: [] },
          { name: "work", path: "/tmp/work", availableDocumentTypes: [] },
        ],
      }),
    });

    const result = await client.refresh();
    expect(result.ok).toBe(true);
    expect(client.activeEnvironment).toBe("work");
    expect(client.availableEnvironments).toEqual(["default", "work"]);
  });

  test("switchEnvironment refreshes environment list after a successful switch", async () => {
    const calls: Array<{ method: string; path: string }> = [];

    const client = new DaemonEnvironmentClient({
      baseUrl: "http://localhost:7433",
      fetchImpl: async (input, init) => {
        const url = typeof input === "string" ? input : input.toString();
        const path = new URL(url).pathname;
        const method = init?.method ?? "GET";
        calls.push({ method, path });

        if (method === "POST" && path === "/api/environments/switch") {
          return jsonResponse(200, {
            activeEnvironment: "work",
            previousEnvironment: "default",
            switchedAt: new Date().toISOString(),
          });
        }

        if (method === "GET" && path === "/api/environments") {
          return jsonResponse(200, {
            activeEnvironment: "work",
            environments: [
              { name: "default", path: "/tmp/default", availableDocumentTypes: [] },
              { name: "work", path: "/tmp/work", availableDocumentTypes: [] },
            ],
          });
        }

        return jsonResponse(500, { error: "unexpected route" });
      },
    });

    const result = await client.switchEnvironment("work");
    expect(result.ok).toBe(true);
    expect(client.activeEnvironment).toBe("work");
    expect(client.availableEnvironments).toEqual(["default", "work"]);
    expect(calls).toEqual([
      { method: "POST", path: "/api/environments/switch" },
      { method: "GET", path: "/api/environments" },
    ]);
  });

  test("switchEnvironment still succeeds when refresh fails", async () => {
    const client = new DaemonEnvironmentClient({
      baseUrl: "http://localhost:7433",
      fetchImpl: async (input, init) => {
        const url = typeof input === "string" ? input : input.toString();
        const path = new URL(url).pathname;
        const method = init?.method ?? "GET";

        if (method === "POST" && path === "/api/environments/switch") {
          return jsonResponse(200, {
            activeEnvironment: "work",
            previousEnvironment: "default",
            switchedAt: new Date().toISOString(),
          });
        }

        if (method === "GET" && path === "/api/environments") {
          return jsonResponse(503, { error: "service unavailable" });
        }

        return jsonResponse(500, { error: "unexpected route" });
      },
    });

    const result = await client.switchEnvironment("work");
    expect(result.ok).toBe(true);
    expect(client.activeEnvironment).toBe("work");
    expect(client.availableEnvironments).toEqual(["default", "work"]);
  });
});

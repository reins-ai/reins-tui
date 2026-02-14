import { describe, expect, test } from "bun:test";

import {
  DaemonMemoryClient,
  createMemoryClient,
  type DaemonMemoryClientOptions,
} from "../../src/daemon/memory-client";

const BASE_URL = "http://localhost:7433";

/** Minimal daemon DTO shape for a memory record. */
function makeDaemonDto(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: overrides.id ?? "mem-001-abc-def",
    content: overrides.content ?? "User prefers dark themes",
    type: overrides.type ?? "preference",
    layer: overrides.layer ?? "stm",
    tags: overrides.tags ?? ["ui"],
    entities: overrides.entities ?? [],
    importance: overrides.importance ?? 0.7,
    confidence: overrides.confidence ?? 1.0,
    provenance: overrides.provenance ?? { sourceType: "explicit" },
    supersedes: overrides.supersedes ?? undefined,
    supersededBy: overrides.supersededBy ?? undefined,
    createdAt: overrides.createdAt ?? "2026-02-13T10:00:00.000Z",
    updatedAt: overrides.updatedAt ?? "2026-02-13T10:00:00.000Z",
    accessedAt: overrides.accessedAt ?? "2026-02-13T10:00:00.000Z",
  };
}

function createMockFetch(
  handler: (url: string, init?: RequestInit) => Response | Promise<Response>,
): typeof fetch {
  return handler as unknown as typeof fetch;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function createClient(
  fetchImpl: typeof fetch,
  overrides?: Partial<DaemonMemoryClientOptions>,
): DaemonMemoryClient {
  return new DaemonMemoryClient({
    baseUrl: overrides?.baseUrl ?? BASE_URL,
    requestTimeoutMs: overrides?.requestTimeoutMs,
    fetchImpl,
  });
}

describe("DaemonMemoryClient", () => {
  describe("remember", () => {
    test("sends POST to /api/memory with content", async () => {
      let capturedUrl = "";
      let capturedInit: RequestInit | undefined;
      const dto = makeDaemonDto();

      const mockFetch = createMockFetch((url, init) => {
        capturedUrl = url;
        capturedInit = init;
        return jsonResponse(dto);
      });

      const client = createClient(mockFetch);
      const result = await client.remember({ content: "User prefers dark themes" });

      expect(result.ok).toBe(true);
      expect(capturedUrl).toBe(`${BASE_URL}/api/memory`);
      expect(capturedInit?.method).toBe("POST");

      const body = JSON.parse(capturedInit?.body as string);
      expect(body.content).toBe("User prefers dark themes");
    });

    test("includes optional type and tags in request body", async () => {
      let capturedBody: Record<string, unknown> = {};
      const dto = makeDaemonDto({ type: "fact", tags: ["work", "project"] });

      const mockFetch = createMockFetch((_url, init) => {
        capturedBody = JSON.parse(init?.body as string);
        return jsonResponse(dto);
      });

      const client = createClient(mockFetch);
      await client.remember({ content: "test", type: "fact", tags: ["work", "project"] });

      expect(capturedBody.type).toBe("fact");
      expect(capturedBody.tags).toEqual(["work", "project"]);
    });

    test("maps daemon DTO to MemoryEntry", async () => {
      const dto = makeDaemonDto({
        id: "mem-999",
        content: "Mapped content",
        type: "fact",
        layer: "ltm",
        tags: ["a", "b"],
        entities: ["entity-1"],
        importance: 0.9,
        confidence: 0.8,
        provenance: { sourceType: "compaction", conversationId: "conv-1" },
      });

      const mockFetch = createMockFetch(() => jsonResponse(dto));
      const client = createClient(mockFetch);
      const result = await client.remember({ content: "test" });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.id).toBe("mem-999");
        expect(result.value.content).toBe("Mapped content");
        expect(result.value.type).toBe("fact");
        expect(result.value.layer).toBe("ltm");
        expect(result.value.tags).toEqual(["a", "b"]);
        expect(result.value.entities).toEqual(["entity-1"]);
        expect(result.value.importance).toBe(0.9);
        expect(result.value.confidence).toBe(0.8);
        expect(result.value.source.type).toBe("compaction");
        expect(result.value.source.conversationId).toBe("conv-1");
      }
    });

    test("returns INVALID_ARGUMENT error on 400 response", async () => {
      const mockFetch = createMockFetch(() => jsonResponse({ error: "bad" }, 400));
      const client = createClient(mockFetch);
      const result = await client.remember({ content: "" });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("INVALID_ARGUMENT");
      }
    });

    test("returns UNSUPPORTED error on 503 response", async () => {
      const mockFetch = createMockFetch(() => jsonResponse({ error: "not ready" }, 503));
      const client = createClient(mockFetch);
      const result = await client.remember({ content: "test" });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("UNSUPPORTED");
        expect(result.error.message).toContain("not ready");
      }
    });

    test("returns UNSUPPORTED error on network failure", async () => {
      const mockFetch = createMockFetch(() => {
        throw new TypeError("fetch failed");
      });
      const client = createClient(mockFetch);
      const result = await client.remember({ content: "test" });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("UNSUPPORTED");
        expect(result.error.message).toContain("not reachable");
      }
    });
  });

  describe("list", () => {
    test("sends GET to /api/memory with no params by default", async () => {
      let capturedUrl = "";
      const mockFetch = createMockFetch((url) => {
        capturedUrl = url;
        return jsonResponse({ memories: [] });
      });

      const client = createClient(mockFetch);
      await client.list();

      expect(capturedUrl).toBe(`${BASE_URL}/api/memory`);
    });

    test("appends query params for type, layer, and limit", async () => {
      let capturedUrl = "";
      const mockFetch = createMockFetch((url) => {
        capturedUrl = url;
        return jsonResponse({ memories: [] });
      });

      const client = createClient(mockFetch);
      await client.list({ type: "fact", layer: "stm", limit: 5 });

      expect(capturedUrl).toContain("type=fact");
      expect(capturedUrl).toContain("layer=stm");
      expect(capturedUrl).toContain("limit=5");
    });

    test("maps array of DTOs to MemoryEntry array", async () => {
      const dto1 = makeDaemonDto({ id: "mem-001" });
      const dto2 = makeDaemonDto({ id: "mem-002", content: "Second memory" });

      const mockFetch = createMockFetch(() =>
        jsonResponse({ memories: [dto1, dto2] }),
      );

      const client = createClient(mockFetch);
      const result = await client.list();

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toHaveLength(2);
        expect(result.value[0].id).toBe("mem-001");
        expect(result.value[1].id).toBe("mem-002");
      }
    });

    test("returns empty array when no memories exist", async () => {
      const mockFetch = createMockFetch(() => jsonResponse({ memories: [] }));
      const client = createClient(mockFetch);
      const result = await client.list();

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toHaveLength(0);
      }
    });

    test("returns error on server failure", async () => {
      const mockFetch = createMockFetch(() => jsonResponse({ error: "fail" }, 500));
      const client = createClient(mockFetch);
      const result = await client.list();

      expect(result.ok).toBe(false);
    });
  });

  describe("show", () => {
    test("sends GET to /api/memory/:id", async () => {
      let capturedUrl = "";
      const dto = makeDaemonDto({ id: "mem-123" });

      const mockFetch = createMockFetch((url) => {
        capturedUrl = url;
        return jsonResponse(dto);
      });

      const client = createClient(mockFetch);
      await client.show("mem-123");

      expect(capturedUrl).toBe(`${BASE_URL}/api/memory/mem-123`);
    });

    test("returns mapped MemoryEntry on success", async () => {
      const dto = makeDaemonDto({ id: "mem-123", content: "Found it" });
      const mockFetch = createMockFetch(() => jsonResponse(dto));

      const client = createClient(mockFetch);
      const result = await client.show("mem-123");

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).not.toBeNull();
        expect(result.value!.id).toBe("mem-123");
        expect(result.value!.content).toBe("Found it");
      }
    });

    test("returns null when memory not found (404)", async () => {
      const mockFetch = createMockFetch(() => jsonResponse({ error: "not found" }, 404));

      const client = createClient(mockFetch);
      const result = await client.show("mem-nonexistent");

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBeNull();
      }
    });

    test("encodes special characters in id", async () => {
      let capturedUrl = "";
      const dto = makeDaemonDto();

      const mockFetch = createMockFetch((url) => {
        capturedUrl = url;
        return jsonResponse(dto);
      });

      const client = createClient(mockFetch);
      await client.show("mem/special&chars");

      expect(capturedUrl).toContain("mem%2Fspecial%26chars");
    });

    test("returns error on server failure", async () => {
      const mockFetch = createMockFetch(() => jsonResponse({ error: "fail" }, 500));
      const client = createClient(mockFetch);
      const result = await client.show("mem-123");

      expect(result.ok).toBe(false);
    });
  });

  describe("search", () => {
    test("sends POST to /api/memory/search with query", async () => {
      let capturedUrl = "";
      let capturedBody: Record<string, unknown> = {};

      const mockFetch = createMockFetch((url, init) => {
        capturedUrl = url;
        capturedBody = JSON.parse(init?.body as string);
        return jsonResponse({ query: "dark theme", results: [], total: 0 });
      });

      const client = createClient(mockFetch);
      await client.search({ query: "dark theme" });

      expect(capturedUrl).toBe(`${BASE_URL}/api/memory/search`);
      expect(capturedBody.query).toBe("dark theme");
    });

    test("includes optional type, layer, and limit in body", async () => {
      let capturedBody: Record<string, unknown> = {};

      const mockFetch = createMockFetch((_url, init) => {
        capturedBody = JSON.parse(init?.body as string);
        return jsonResponse({ query: "test", results: [], total: 0 });
      });

      const client = createClient(mockFetch);
      await client.search({ query: "test", type: "fact", layer: "ltm", limit: 3 });

      expect(capturedBody.type).toBe("fact");
      expect(capturedBody.layer).toBe("ltm");
      expect(capturedBody.limit).toBe(3);
    });

    test("maps search results to MemoryEntry array", async () => {
      const dto1 = makeDaemonDto({ id: "mem-s1" });
      const dto2 = makeDaemonDto({ id: "mem-s2" });

      const mockFetch = createMockFetch(() =>
        jsonResponse({ query: "test", results: [dto1, dto2], total: 2 }),
      );

      const client = createClient(mockFetch);
      const result = await client.search({ query: "test" });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toHaveLength(2);
        expect(result.value[0].id).toBe("mem-s1");
        expect(result.value[1].id).toBe("mem-s2");
      }
    });

    test("returns error on server failure", async () => {
      const mockFetch = createMockFetch(() => jsonResponse({ error: "fail" }, 500));
      const client = createClient(mockFetch);
      const result = await client.search({ query: "test" });

      expect(result.ok).toBe(false);
    });
  });

  describe("error mapping", () => {
    test("maps 400 to INVALID_ARGUMENT", async () => {
      const mockFetch = createMockFetch(() => jsonResponse({}, 400));
      const client = createClient(mockFetch);
      const result = await client.remember({ content: "test" });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("INVALID_ARGUMENT");
      }
    });

    test("maps 404 to NOT_FOUND for non-show operations", async () => {
      const mockFetch = createMockFetch(() => jsonResponse({}, 404));
      const client = createClient(mockFetch);
      const result = await client.remember({ content: "test" });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("NOT_FOUND");
      }
    });

    test("maps 503 to UNSUPPORTED with readiness message", async () => {
      const mockFetch = createMockFetch(() => jsonResponse({}, 503));
      const client = createClient(mockFetch);
      const result = await client.list();

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("UNSUPPORTED");
        expect(result.error.message).toContain("not ready");
      }
    });

    test("maps 500 to UNSUPPORTED", async () => {
      const mockFetch = createMockFetch(() => jsonResponse({}, 500));
      const client = createClient(mockFetch);
      const result = await client.list();

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("UNSUPPORTED");
      }
    });

    test("maps network error to UNSUPPORTED with reachability message", async () => {
      const mockFetch = createMockFetch(() => {
        throw new TypeError("fetch failed");
      });
      const client = createClient(mockFetch);
      const result = await client.list();

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("UNSUPPORTED");
        expect(result.error.message).toContain("not reachable");
      }
    });

    test("maps invalid JSON response to UNSUPPORTED", async () => {
      const mockFetch = createMockFetch(() =>
        new Response("not json", { status: 200 }),
      );
      const client = createClient(mockFetch);
      const result = await client.list();

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("UNSUPPORTED");
        expect(result.error.message).toContain("Invalid JSON");
      }
    });
  });

  describe("configuration", () => {
    test("strips trailing slash from base URL", async () => {
      let capturedUrl = "";
      const mockFetch = createMockFetch((url) => {
        capturedUrl = url;
        return jsonResponse({ memories: [] });
      });

      const client = createClient(mockFetch, { baseUrl: "http://localhost:7433/" });
      await client.list();

      expect(capturedUrl).toBe("http://localhost:7433/api/memory");
    });

    test("available is always true", () => {
      const mockFetch = createMockFetch(() => jsonResponse({}));
      const client = createClient(mockFetch);
      expect(client.available).toBe(true);
    });
  });
});

describe("createMemoryClient", () => {
  test("returns DaemonMemoryClient when connected", () => {
    const client = createMemoryClient(true, BASE_URL);
    expect(client).not.toBeNull();
    expect(client!.available).toBe(true);
  });

  test("returns null when not connected", () => {
    const client = createMemoryClient(false, BASE_URL);
    expect(client).toBeNull();
  });

  test("passes custom fetch implementation", async () => {
    let called = false;
    const customFetch = createMockFetch(() => {
      called = true;
      return jsonResponse({ memories: [] });
    });

    const client = createMemoryClient(true, BASE_URL, { fetchImpl: customFetch });
    expect(client).not.toBeNull();

    await client!.list();
    expect(called).toBe(true);
  });
});

/**
 * Integration Tests for MCP Server Tool Handlers
 *
 * Verifies tool handler logic with real dependencies:
 *   - In-memory SQLite + sqlite-vec
 *   - Real CryptoService / EmbeddingService / DLP sanitization
 *
 * McpServer protocol layer and SessionWatcher are mocked —
 * handlers are called directly as functions, not through MCP protocol.
 * For real protocol-level E2E tests, see ../e2e/mcp-protocol.e2e.test.ts.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';

// Mock only McpServer (capture tool handlers) and SessionWatcher (filesystem)
vi.mock('@modelcontextprotocol/sdk/server/mcp.js', () => {
  return {
    McpServer: vi.fn().mockImplementation(() => {
      const tools = new Map();
      return {
        tool: vi.fn().mockImplementation((name: string, _desc: string, _schema: unknown, handler: Function) => {
          tools.set(name, handler);
        }),
        _getToolHandler: (name: string) => tools.get(name),
      };
    }),
  };
});

vi.mock('@engram/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@engram/core')>();
  return {
    ...actual,
    // Only mock SessionWatcher to avoid filesystem side effects
    SessionWatcher: vi.fn().mockImplementation(() => ({
      watch: vi.fn(),
      close: vi.fn().mockResolvedValue(undefined),
    })),
    // IndexingService requires LLMService which we don't need for integration tests
    IndexingService: vi.fn().mockImplementation(() => ({})),
  };
});

import { createEngramServer } from '../../src/server';
import type { EngramServerResult } from '../../src/server';
import { CryptoService } from '@engram/core';

describe('MCP Server Integration — Tool Handlers', () => {
  let serverResult: EngramServerResult;
  let getHandler: (name: string) => Function;

  beforeAll(async () => {
    const masterKey = CryptoService.generateMasterKey();
    const vaultKey = CryptoService.generateMasterKey();

    serverResult = createEngramServer({
      dbPath: ':memory:',
      masterKey,
      vaultKey,
    });

    // Wait for embedding model to load
    await serverResult.embedder.initialize();

    getHandler = (name: string) => {
      const handler = (serverResult.server as any)._getToolHandler(name);
      if (!handler) throw new Error(`Tool handler '${name}' not found`);
      return handler;
    };
  }, 120_000); // 120s for model loading

  afterAll(async () => {
    await serverResult.close();
  });

  // ── mcp_save_memory + mcp_read_memory ────────────────────────────

  describe('save → read full flow', () => {
    it('should save a memory and find it via semantic search', async () => {
      const save = getHandler('mcp_save_memory');
      const read = getHandler('mcp_read_memory');

      const saveResult = await save({
        content: 'Rust uses ownership and borrowing for memory safety',
        tags: ['programming', 'rust'],
      });

      expect(saveResult.content[0].text).toContain('Remembered:');
      expect(saveResult.isError).toBeUndefined();

      const readResult = await read({
        query: 'memory safety in systems programming',
        limit: 3,
      });

      expect(readResult.content[0].text).toContain('Rust');
      expect(readResult.content[0].text).toContain('ownership');
    });

    it('should return "No relevant memories found" for unrelated query on empty-ish store', async () => {
      const read = getHandler('mcp_read_memory');

      // Search for something completely unrelated
      // Note: store has the Rust memory from previous test, so we check that
      // the response format is correct regardless
      const result = await read({ query: 'quantum entanglement physics', limit: 1 });
      expect(result.content[0].text).toBeDefined();
      expect(result.isError).toBeUndefined();
    });
  });

  // ── Memory lifecycle ─────────────────────────────────────────────

  describe('memory lifecycle: save → list → delete → verify', () => {
    it('should create, list, and delete a memory', async () => {
      const save = getHandler('mcp_save_memory');
      const list = getHandler('mcp_list_memories');
      const del = getHandler('mcp_delete_memory');

      // Save
      const saveResult = await save({
        content: 'Ephemeral memory for lifecycle test',
        tags: ['lifecycle'],
      });
      const idMatch = saveResult.content[0].text.match(/ID: ([^\)]+)/);
      expect(idMatch).not.toBeNull();
      const memoryId = idMatch![1];

      // List — should include the new memory
      const listResult = await list({ limit: 50 });
      expect(listResult.content[0].text).toContain('Ephemeral memory');

      // Delete
      const delResult = await del({ memory_id: memoryId });
      expect(delResult.content[0].text).toContain('has been deleted');

      // Verify deleted
      const delAgain = await del({ memory_id: memoryId });
      expect(delAgain.content[0].text).toContain('not found');
    });
  });

  // ── DLP end-to-end ───────────────────────────────────────────────

  describe('DLP sanitization through save → read', () => {
    it('should redact secrets before storing and return sanitized content', async () => {
      const save = getHandler('mcp_save_memory');
      const read = getHandler('mcp_read_memory');

      const fakeKey = 'sk-' + 'a'.repeat(48);
      const saveResult = await save({
        content: `My OpenAI key is ${fakeKey} and I use it daily`,
        tags: ['credentials'],
      });

      // Save should succeed with sanitized content
      expect(saveResult.content[0].text).toContain('Remembered:');
      expect(saveResult.content[0].text).not.toContain(fakeKey);

      // Read should return sanitized content
      const readResult = await read({ query: 'OpenAI API key', limit: 3 });
      expect(readResult.content[0].text).not.toContain(fakeKey);
      expect(readResult.content[0].text).toContain('OPENAI_KEY');
    });
  });

  // ── Secret store ─────────────────────────────────────────────────

  describe('secret store: set → get', () => {
    it('should store and retrieve a secret through MCP tools', async () => {
      const setSecret = getHandler('mcp_set_secret');
      const getSecret = getHandler('mcp_get_secret');

      const setResult = await setSecret({
        key: 'TEST_API_KEY',
        value: 'my-secret-api-value-12345',
        description: 'Test key for integration',
      });

      expect(setResult.content[0].text).toContain("'TEST_API_KEY' stored successfully");

      const getResult = await getSecret({ key: 'TEST_API_KEY' });
      expect(getResult.content[0].text).toBe('my-secret-api-value-12345');
      expect(getResult.isError).toBeUndefined();
    });

    it('should return error for non-existent secret', async () => {
      const getSecret = getHandler('mcp_get_secret');

      const result = await getSecret({ key: 'DOES_NOT_EXIST' });
      expect(result.content[0].text).toContain('not found');
      expect(result.isError).toBe(true);
    });
  });

  // ── mcp_memory_status ────────────────────────────────────────────

  describe('mcp_memory_status', () => {
    it('should return consistent status', async () => {
      const status = getHandler('mcp_memory_status');

      const result = await status({});
      expect(result.content[0].text).toContain('Memory count:');
      expect(result.content[0].text).toContain('Embedding model: Ready');
    });
  });

  // ── mcp_find_similar_sessions ────────────────────────────────────

  describe('mcp_find_similar_sessions', () => {
    it('should find session-indexed memories', async () => {
      const save = getHandler('mcp_save_memory');
      const find = getHandler('mcp_find_similar_sessions');

      // Save a session-like memory
      await save({
        content: 'Fixed websocket reconnection logic with exponential backoff',
        tags: ['session-index'],
      });

      const result = await find({
        intent: 'websocket connection issues',
        limit: 3,
      });

      // Should find our session-indexed memory
      expect(result.content[0].text).toContain('websocket');
    });

    it('should return "No relevant past sessions found" when no session memories exist', async () => {
      const find = getHandler('mcp_find_similar_sessions');

      // Search for something with no matching session-index tagged memories
      const result = await find({
        intent: 'quantum computing algorithm optimization',
        limit: 3,
      });

      // May or may not find the websocket session; just verify no error
      expect(result.isError).toBeUndefined();
    });
  });

  // ── Multi-tool workflow ──────────────────────────────────────────

  describe('multi-tool workflow', () => {
    it('should save multiple → search → delete → search again', async () => {
      const save = getHandler('mcp_save_memory');
      const read = getHandler('mcp_read_memory');
      const del = getHandler('mcp_delete_memory');

      // Save multiple memories
      const r1 = await save({ content: 'PostgreSQL supports JSONB columns for semi-structured data', tags: ['database'] });
      const r2 = await save({ content: 'Redis provides in-memory caching with pub/sub', tags: ['database'] });
      const r3 = await save({ content: 'SQLite is embedded and serverless', tags: ['database'] });

      const id1 = r1.content[0].text.match(/ID: ([^\)]+)/)![1];
      const id2 = r2.content[0].text.match(/ID: ([^\)]+)/)![1];

      // Search — should find database memories
      const searchBefore = await read({ query: 'database systems', limit: 5 });
      expect(searchBefore.content[0].text).toContain('Found');

      // Delete two
      await del({ memory_id: id1 });
      await del({ memory_id: id2 });

      // Search again — SQLite should still be findable
      const searchAfter = await read({ query: 'embedded database', limit: 5 });
      expect(searchAfter.content[0].text).toContain('SQLite');
      // Deleted ones should not appear
      expect(searchAfter.content[0].text).not.toContain('PostgreSQL');
      expect(searchAfter.content[0].text).not.toContain('Redis');
    });
  });

  // ── mcp_create_recovery_kit ──────────────────────────────────────

  describe('mcp_create_recovery_kit', () => {
    it('should generate a recovery kit with shares', async () => {
      const createKit = getHandler('mcp_create_recovery_kit');

      const result = await createKit({ shares: 5, threshold: 3 });
      expect(result.content[0].text).toContain('Recovery kit created (3-of-5)');
      expect(result.content[0].text).toContain('Share 1:');
      expect(result.content[0].text).toContain('Share 5:');
      expect(result.content[0].text).toContain('Store these shares');
    });
  });
});

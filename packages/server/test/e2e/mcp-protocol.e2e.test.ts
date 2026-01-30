/**
 * Real E2E Tests — MCP Client ↔ Server via stdio transport
 *
 * Spawns the actual engram-server as a child process, connects a real
 * MCP Client through StdioClientTransport, and exercises the full
 * JSON-RPC protocol stack.
 *
 * NO mocks. Everything is real:
 *   - MCP protocol handshake (initialize / initialized)
 *   - JSON-RPC serialization over stdin/stdout
 *   - SQLite + sqlite-vec database
 *   - Embedding model (Xenova/all-MiniLM-L6-v2)
 *   - DLP sanitization
 *   - SessionWatcher (watches real filesystem)
 *
 * Compare with ../integration/server.integration.test.ts which mocks
 * McpServer and calls tool handlers directly (integration test).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// ── Paths ────────────────────────────────────────────────────────
const __dirname = dirname(fileURLToPath(import.meta.url));
const SERVER_BIN = resolve(__dirname, '../../dist/bin.js');

// ── Helpers ──────────────────────────────────────────────────────

/** Extract concatenated text from a callTool result. */
function getText(result: Awaited<ReturnType<Client['callTool']>>): string {
  if ('content' in result && Array.isArray(result.content)) {
    return (result.content as Array<{ type: string; text?: string }>)
      .filter((c) => c.type === 'text' && c.text)
      .map((c) => c.text!)
      .join('\n');
  }
  return '';
}

/** Build a clean env with ENGRAM_PATH / ENGRAM_MODELS_DIR overrides. */
function buildEnv(overrides: Record<string, string>): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (v !== undefined) env[k] = v;
  }
  return { ...env, ...overrides };
}

// ── Tests ────────────────────────────────────────────────────────

describe('MCP Server E2E — Real Protocol', () => {
  let client: Client;
  let transport: StdioClientTransport;
  let tmpDir: string;
  let dbPath: string;

  beforeAll(async () => {
    if (!existsSync(SERVER_BIN)) {
      throw new Error(
        `Server binary not found at ${SERVER_BIN}.\nRun "pnpm build" before running E2E tests.`,
      );
    }

    tmpDir = mkdtempSync(join(tmpdir(), 'engram-e2e-'));
    dbPath = join(tmpDir, 'test.db');

    transport = new StdioClientTransport({
      command: 'node',
      args: [SERVER_BIN],
      env: buildEnv({
        ENGRAM_PATH: dbPath,
        ENGRAM_MODELS_DIR: join(tmpDir, 'models'),
      }),
      stderr: 'pipe',
    });

    client = new Client(
      { name: 'engram-e2e-test', version: '1.0.0' },
      { capabilities: {} },
    );

    // connect() performs the full MCP initialize handshake
    await client.connect(transport);
  }, 120_000);

  afterAll(async () => {
    try {
      await client?.close();
    } catch {
      /* transport already closed */
    }
    try {
      rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      /* best-effort cleanup */
    }
  });

  // ── 1. Protocol handshake ───────────────────────────────────────

  describe('protocol handshake', () => {
    it('should complete initialization and report server info', () => {
      const info = client.getServerVersion();
      expect(info).toBeDefined();
      expect(info!.name).toBe('engram');
    });

    it('should list all 12 registered tools with schemas', async () => {
      const { tools } = await client.listTools();

      const names = tools.map((t) => t.name).sort();
      expect(names).toEqual([
        'mcp_authorize_device',
        'mcp_create_recovery_kit',
        'mcp_delete_memory',
        'mcp_find_similar_sessions',
        'mcp_get_secret',
        'mcp_list_devices',
        'mcp_list_memories',
        'mcp_memory_status',
        'mcp_read_memory',
        'mcp_revoke_device',
        'mcp_save_memory',
        'mcp_set_secret',
      ]);

      // Verify schema is present
      const saveTool = tools.find((t) => t.name === 'mcp_save_memory')!;
      expect(saveTool.inputSchema.type).toBe('object');
      expect(saveTool.inputSchema.properties).toHaveProperty('content');
    });
  });

  // ── 2. Save → Read (semantic search) ────────────────────────────

  describe('save → read full cycle', () => {
    it('should save a memory and retrieve it via semantic search', async () => {
      // Save — first call triggers embedding model loading
      const saveResult = await client.callTool({
        name: 'mcp_save_memory',
        arguments: {
          content: 'TypeScript uses structural typing instead of nominal typing',
          tags: ['programming', 'typescript'],
        },
      });

      const saveText = getText(saveResult);
      expect(saveText).toContain('Remembered:');
      expect(saveText).toContain('structural typing');
      expect(saveResult.isError).toBeFalsy();

      // Read — semantic search through the protocol
      const readResult = await client.callTool({
        name: 'mcp_read_memory',
        arguments: {
          query: 'type system in programming languages',
          limit: 3,
        },
      });

      const readText = getText(readResult);
      expect(readText).toContain('TypeScript');
      expect(readText).toContain('structural');
    }, 120_000); // model loading on first embed()
  });

  // ── 3. Memory lifecycle ─────────────────────────────────────────

  describe('memory lifecycle: save → list → delete → verify', () => {
    it('should create, list, delete, and confirm deletion', async () => {
      // Save
      const saveResult = await client.callTool({
        name: 'mcp_save_memory',
        arguments: {
          content: 'Ephemeral memory for E2E lifecycle test',
          tags: ['e2e-lifecycle'],
        },
      });
      const saveText = getText(saveResult);
      const idMatch = saveText.match(/ID: ([^\)]+)/);
      expect(idMatch).not.toBeNull();
      const memoryId = idMatch![1];

      // List — should include the new memory
      const listResult = await client.callTool({
        name: 'mcp_list_memories',
        arguments: { limit: 50 },
      });
      expect(getText(listResult)).toContain('Ephemeral memory');

      // Delete
      const delResult = await client.callTool({
        name: 'mcp_delete_memory',
        arguments: { memory_id: memoryId },
      });
      expect(getText(delResult)).toContain('has been deleted');

      // Verify deleted — second delete should say "not found"
      const delAgain = await client.callTool({
        name: 'mcp_delete_memory',
        arguments: { memory_id: memoryId },
      });
      expect(getText(delAgain)).toContain('not found');
    });
  });

  // ── 4. DLP sanitization ─────────────────────────────────────────

  describe('DLP end-to-end through protocol', () => {
    it('should redact secrets before storing', async () => {
      const fakeKey = 'sk-' + 'a'.repeat(48);

      const saveResult = await client.callTool({
        name: 'mcp_save_memory',
        arguments: {
          content: `My OpenAI key is ${fakeKey} and I use it daily`,
          tags: ['credentials'],
        },
      });

      const saveText = getText(saveResult);
      expect(saveText).toContain('Remembered:');
      expect(saveText).not.toContain(fakeKey);

      // Read back — should also not contain the raw key
      const readResult = await client.callTool({
        name: 'mcp_read_memory',
        arguments: { query: 'OpenAI API key', limit: 3 },
      });
      expect(getText(readResult)).not.toContain(fakeKey);
    });
  });

  // ── 5. System status ────────────────────────────────────────────

  describe('mcp_memory_status', () => {
    it('should report memory count and embedding model state', async () => {
      const result = await client.callTool({
        name: 'mcp_memory_status',
        arguments: {},
      });

      const text = getText(result);
      expect(text).toContain('Memory count:');
      expect(text).toContain('Embedding model:');
    });
  });

  // ── 6. Find similar sessions ────────────────────────────────────

  describe('mcp_find_similar_sessions', () => {
    it('should find session-indexed memories via semantic search', async () => {
      // Save a session-like memory
      await client.callTool({
        name: 'mcp_save_memory',
        arguments: {
          content: 'Implemented OAuth2 PKCE flow with refresh token rotation',
          tags: ['session-index'],
        },
      });

      const result = await client.callTool({
        name: 'mcp_find_similar_sessions',
        arguments: {
          intent: 'authentication flow implementation',
          limit: 3,
        },
      });

      const text = getText(result);
      expect(text).toContain('OAuth2');
    });
  });

  // ── 7. Multi-tool workflow ──────────────────────────────────────

  describe('multi-tool workflow', () => {
    it('should save multiple → search → delete → verify removal', async () => {
      // Save two memories
      const r1 = await client.callTool({
        name: 'mcp_save_memory',
        arguments: {
          content: 'Docker uses cgroups and namespaces for container isolation',
          tags: ['infra'],
        },
      });
      const r2 = await client.callTool({
        name: 'mcp_save_memory',
        arguments: {
          content: 'Kubernetes orchestrates container workloads across clusters',
          tags: ['infra'],
        },
      });

      const id1 = getText(r1).match(/ID: ([^\)]+)/)![1];
      const id2 = getText(r2).match(/ID: ([^\)]+)/)![1];

      // Search — should find both
      const search1 = await client.callTool({
        name: 'mcp_read_memory',
        arguments: { query: 'container infrastructure', limit: 10 },
      });
      expect(getText(search1)).toContain('Found');

      // Delete Docker memory
      await client.callTool({
        name: 'mcp_delete_memory',
        arguments: { memory_id: id1 },
      });

      // Search again — only Kubernetes should remain
      const search2 = await client.callTool({
        name: 'mcp_read_memory',
        arguments: { query: 'container orchestration', limit: 10 },
      });
      const text2 = getText(search2);
      expect(text2).toContain('Kubernetes');
      expect(text2).not.toContain('Docker');

      // Cleanup
      await client.callTool({
        name: 'mcp_delete_memory',
        arguments: { memory_id: id2 },
      });
    });
  });

  // ── 8. Secret tools (vault not configured) ──────────────────────

  describe('secret tools without vault', () => {
    it('mcp_get_secret should return vault-not-initialized error', async () => {
      const result = await client.callTool({
        name: 'mcp_get_secret',
        arguments: { key: 'TEST_KEY' },
      });

      expect(result.isError).toBe(true);
      expect(getText(result)).toContain('not initialized');
    });

    it('mcp_set_secret should return vault-not-initialized error', async () => {
      const result = await client.callTool({
        name: 'mcp_set_secret',
        arguments: { key: 'TEST_KEY', value: 'secret-value' },
      });

      expect(result.isError).toBe(true);
      expect(getText(result)).toContain('not initialized');
    });

    it('mcp_create_recovery_kit should return vault-key-not-configured error', async () => {
      const result = await client.callTool({
        name: 'mcp_create_recovery_kit',
        arguments: { shares: 5, threshold: 3 },
      });

      expect(result.isError).toBe(true);
      expect(getText(result)).toContain('Vault key not configured');
    });
  });

  // ── 9. Database persistence ─────────────────────────────────────

  describe('database persistence', () => {
    it('should have created the SQLite database file on disk', () => {
      expect(existsSync(dbPath)).toBe(true);
    });
  });
});

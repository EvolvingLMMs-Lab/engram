import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createEngramServer } from '../src/server';

// Mock MCP Server
vi.mock('@modelcontextprotocol/sdk/server/mcp.js', () => {
  return {
    McpServer: vi.fn().mockImplementation(() => {
      const tools = new Map();
      return {
        tool: vi.fn().mockImplementation((name, _desc, _schema, handler) => {
          tools.set(name, handler);
        }),
        _getToolHandler: (name: string) => tools.get(name),
      };
    }),
  };
});

// Mock dependencies
vi.mock('@engram/core', async () => {
  const actual = await vi.importActual('@engram/core');
  return {
    ...actual,
    initDatabase: vi.fn(),
    MemoryStore: vi.fn().mockImplementation(() => ({
      sanitize: vi.fn().mockImplementation((text) => ({
        sanitized: text.replace('SECRET', 'REDACTED'),
        detected: text.includes('SECRET') ? ['Secret'] : [],
      })),
      create: vi.fn().mockReturnValue({ id: '123', content: 'REDACTED' }),
      search: vi.fn().mockReturnValue([]),
      list: vi.fn().mockReturnValue([]),
      count: vi.fn().mockReturnValue(0),
      delete: vi.fn().mockReturnValue(true),
    })),
    EmbeddingService: vi.fn().mockImplementation(() => ({
      embed: vi.fn().mockResolvedValue(new Float32Array(384)),
      isReady: vi.fn().mockReturnValue(true),
      isLoading: vi.fn().mockReturnValue(false),
    })),
    SecretStore: vi.fn().mockImplementation(() => ({
      init: vi.fn(),
      get: vi.fn().mockImplementation((key) => {
        if (key === 'VALID_KEY') return 'sk_live_secret_value';
        return null;
      }),
    })),
    CryptoService: vi.fn(),
  };
});

describe('Engram Server MCP Tools', () => {
  let serverResult: any;

  beforeEach(() => {
    serverResult = createEngramServer({
      masterKey: Buffer.alloc(32),
    });
  });

  it('mcp_get_secret should return secret if found', async () => {
    const getSecretTool = serverResult.server._getToolHandler('mcp_get_secret');
    expect(getSecretTool).toBeDefined();

    const result = await getSecretTool({ key: 'VALID_KEY' });
    expect(result.content[0].text).toBe('sk_live_secret_value');
  });

  it('mcp_get_secret should handle missing keys', async () => {
    const getSecretTool = serverResult.server._getToolHandler('mcp_get_secret');
    const result = await getSecretTool({ key: 'MISSING_KEY' });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('not found');
  });

  it('mcp_save_memory should sanitize before embedding', async () => {
    // Access the mocked server instance and get the captured handler
    const saveTool = serverResult.server._getToolHandler('mcp_save_memory');

    expect(saveTool).toBeDefined();

    const result = await saveTool({ content: 'This is a SECRET' });

    const store = serverResult.store;
    const embedder = serverResult.embedder;

    // 1. Sanitize called
    expect(store.sanitize).toHaveBeenCalledWith('This is a SECRET');

    // 2. Embedder called with SANITIZED text (Critical!)
    expect(embedder.embed).toHaveBeenCalledWith('This is a REDACTED');

    // 3. Store create called with SANITIZED text
    expect(store.create).toHaveBeenCalledWith(
      expect.objectContaining({ content: 'This is a REDACTED' }),
      expect.any(Float32Array)
    );

    // 4. Result contains sanitized text
    expect(result.content[0].text).toContain('REDACTED');
  });
});

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createEngramServer } from '../src/server';
import { generateRecoveryKit } from '@engram/core';

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
vi.mock('@engram/core', () => {
  return {
    initDatabase: vi.fn().mockReturnValue({ close: vi.fn() }),
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
      set: vi.fn().mockResolvedValue(undefined),
      isSyncEnabled: vi.fn().mockReturnValue(false),
      delete: vi.fn().mockResolvedValue(true),
      list: vi.fn().mockReturnValue([]),
    })),
    CryptoService: vi.fn(),
    SecretsSyncEngine: vi.fn().mockImplementation(() => ({
      connect: vi.fn().mockResolvedValue(undefined),
      disconnect: vi.fn().mockResolvedValue(undefined),
      authorizeDevice: vi.fn().mockResolvedValue(undefined),
      revokeDevice: vi.fn().mockResolvedValue(undefined),
      setVaultKey: vi.fn(),
      configureBlindIndex: vi.fn(),
      configure: vi.fn(),
    })),
    generateRecoveryKit: vi.fn().mockResolvedValue({
      userId: 'user',
      totalShares: 5,
      threshold: 3,
      shares: [
        { index: 0, data: 'c2hhcmUwZGF0YWFhYWFhYWFhYWE=' },
        { index: 1, data: 'c2hhcmUxZGF0YWFhYWFhYWFhYWE=' },
        { index: 2, data: 'c2hhcmUyZGF0YWFhYWFhYWFhYWE=' },
        { index: 3, data: 'c2hhcmUzZGF0YWFhYWFhYWFhYWE=' },
        { index: 4, data: 'c2hhcmU0ZGF0YWFhYWFhYWFhYWE=' },
      ],
      createdAt: Date.now(),
    }),
    IndexingService: vi.fn().mockImplementation(() => ({})),
    SessionWatcher: Object.assign(
      vi.fn().mockImplementation(() => ({
        watch: vi.fn(),
        close: vi.fn().mockResolvedValue(undefined),
      })),
      {
        getDefaultPaths: vi.fn().mockReturnValue(['/mock/.claude/projects', '/mock/.claude/plugins']),
        getProjectPath: vi.fn().mockReturnValue('/mock/project/.claude'),
      }
    ),
    KeyManager: vi.fn().mockImplementation(() => ({})),
  };
});

describe('Engram Server MCP Tools', () => {
  let serverResult: any;

  beforeEach(() => {
    serverResult = createEngramServer({
      masterKey: Buffer.alloc(32),
    });
  });

  // ============================================================
  // mcp_save_memory
  // ============================================================
  describe('mcp_save_memory', () => {
    it('should sanitize before embedding', async () => {
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

    it('should save memory with tags', async () => {
      const saveTool = serverResult.server._getToolHandler('mcp_save_memory');
      const result = await saveTool({
        content: 'Normal content',
        tags: ['project', 'api'],
      });

      expect(serverResult.store.create).toHaveBeenCalledWith(
        expect.objectContaining({
          content: 'Normal content',
          tags: ['project', 'api'],
        }),
        expect.any(Float32Array)
      );
      expect(result.content[0].text).toContain('Remembered:');
      expect(result.content[0].text).toContain('ID: 123');
    });

    it('should handle embedder errors', async () => {
      vi.mocked(serverResult.embedder.embed).mockRejectedValueOnce(
        new Error('Model not loaded')
      );

      const saveTool = serverResult.server._getToolHandler('mcp_save_memory');
      const result = await saveTool({ content: 'test' });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Failed to remember');
      expect(result.content[0].text).toContain('Model not loaded');
    });
  });

  // ============================================================
  // mcp_read_memory
  // ============================================================
  describe('mcp_read_memory', () => {
    it('should return formatted search results', async () => {
      vi.mocked(serverResult.store.search).mockReturnValueOnce([
        {
          memory: {
            content: 'API key stored in env',
            tags: ['config'],
            isVerified: true,
          },
          distance: 0.2,
        },
        {
          memory: {
            content: 'Database uses PostgreSQL',
            tags: ['infra', 'db'],
            isVerified: false,
          },
          distance: 0.4,
        },
      ]);

      const readTool = serverResult.server._getToolHandler('mcp_read_memory');
      const result = await readTool({ query: 'database config', limit: 5 });

      expect(result.content[0].text).toContain('Found 2 relevant memories');
      expect(result.content[0].text).toContain('API key stored in env');
      expect(result.content[0].text).toContain('[config]');
      expect(result.content[0].text).toContain('(verified)');
      expect(result.content[0].text).toContain('similarity: 0.800');
      expect(result.content[0].text).toContain('Database uses PostgreSQL');
      expect(result.content[0].text).toContain('[infra, db]');
      expect(result.content[0].text).toContain('similarity: 0.600');
    });

    it('should handle no results', async () => {
      const readTool = serverResult.server._getToolHandler('mcp_read_memory');
      const result = await readTool({ query: 'nonexistent', limit: 5 });

      expect(result.content[0].text).toBe('No relevant memories found.');
    });

    it('should handle search errors', async () => {
      vi.mocked(serverResult.embedder.embed).mockRejectedValueOnce(
        new Error('Embedding failed')
      );

      const readTool = serverResult.server._getToolHandler('mcp_read_memory');
      const result = await readTool({ query: 'test', limit: 5 });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Search failed');
      expect(result.content[0].text).toContain('Embedding failed');
    });
  });

  // ============================================================
  // mcp_delete_memory
  // ============================================================
  describe('mcp_delete_memory', () => {
    it('should delete existing memory', async () => {
      const deleteTool =
        serverResult.server._getToolHandler('mcp_delete_memory');
      const result = await deleteTool({ memory_id: 'mem-123' });

      expect(serverResult.store.delete).toHaveBeenCalledWith('mem-123');
      expect(result.content[0].text).toBe('Memory mem-123 has been deleted.');
    });

    it('should handle non-existent memory', async () => {
      vi.mocked(serverResult.store.delete).mockReturnValueOnce(false);

      const deleteTool =
        serverResult.server._getToolHandler('mcp_delete_memory');
      const result = await deleteTool({ memory_id: 'mem-999' });

      expect(result.content[0].text).toBe('Memory mem-999 not found.');
    });

    it('should handle delete errors', async () => {
      vi.mocked(serverResult.store.delete).mockImplementationOnce(() => {
        throw new Error('DB write error');
      });

      const deleteTool =
        serverResult.server._getToolHandler('mcp_delete_memory');
      const result = await deleteTool({ memory_id: 'mem-123' });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Delete failed');
      expect(result.content[0].text).toContain('DB write error');
    });
  });

  // ============================================================
  // mcp_list_memories
  // ============================================================
  describe('mcp_list_memories', () => {
    it('should list memories with formatting', async () => {
      vi.mocked(serverResult.store.list).mockReturnValueOnce([
        {
          id: 'mem-1',
          content: 'First memory content',
          tags: ['tag1'],
          createdAt: new Date('2024-01-15').getTime(),
        },
        {
          id: 'mem-2',
          content:
            'Second memory with a much longer content that should be truncated because it exceeds eighty characters in total length here',
          tags: ['tag2', 'tag3'],
          createdAt: new Date('2024-02-20').getTime(),
        },
      ]);

      const listTool =
        serverResult.server._getToolHandler('mcp_list_memories');
      const result = await listTool({ limit: 10 });

      expect(result.content[0].text).toContain('2 memories');
      expect(result.content[0].text).toContain('First memory content');
      expect(result.content[0].text).toContain('[tag1]');
      expect(result.content[0].text).toContain('[tag2, tag3]');
      expect(result.content[0].text).toContain('...');
    });

    it('should handle empty list', async () => {
      const listTool =
        serverResult.server._getToolHandler('mcp_list_memories');
      const result = await listTool({ limit: 10 });

      expect(result.content[0].text).toBe('No memories found.');
    });

    it('should pass source filter', async () => {
      const listTool =
        serverResult.server._getToolHandler('mcp_list_memories');
      await listTool({ limit: 5, source: 'claude-session' });

      expect(serverResult.store.list).toHaveBeenCalledWith({
        limit: 5,
        source: 'claude-session',
      });
    });

    it('should handle list errors', async () => {
      vi.mocked(serverResult.store.list).mockImplementationOnce(() => {
        throw new Error('DB read error');
      });

      const listTool =
        serverResult.server._getToolHandler('mcp_list_memories');
      const result = await listTool({ limit: 10 });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('List failed');
      expect(result.content[0].text).toContain('DB read error');
    });
  });

  // ============================================================
  // mcp_memory_status
  // ============================================================
  describe('mcp_memory_status', () => {
    it('should show ready status', async () => {
      vi.mocked(serverResult.store.count).mockReturnValueOnce(42);
      vi.mocked(serverResult.embedder.isReady).mockReturnValueOnce(true);
      vi.mocked(serverResult.embedder.isLoading).mockReturnValueOnce(false);

      const statusTool =
        serverResult.server._getToolHandler('mcp_memory_status');
      const result = await statusTool({});

      expect(result.content[0].text).toContain('Memory count: 42');
      expect(result.content[0].text).toContain('Embedding model: Ready');
    });

    it('should show loading status', async () => {
      vi.mocked(serverResult.store.count).mockReturnValueOnce(10);
      vi.mocked(serverResult.embedder.isReady).mockReturnValueOnce(false);
      vi.mocked(serverResult.embedder.isLoading).mockReturnValueOnce(true);

      const statusTool =
        serverResult.server._getToolHandler('mcp_memory_status');
      const result = await statusTool({});

      expect(result.content[0].text).toContain('Memory count: 10');
      expect(result.content[0].text).toContain('Embedding model: Loading...');
    });

    it('should show not loaded status', async () => {
      vi.mocked(serverResult.store.count).mockReturnValueOnce(0);
      vi.mocked(serverResult.embedder.isReady).mockReturnValueOnce(false);
      vi.mocked(serverResult.embedder.isLoading).mockReturnValueOnce(false);

      const statusTool =
        serverResult.server._getToolHandler('mcp_memory_status');
      const result = await statusTool({});

      expect(result.content[0].text).toContain('Memory count: 0');
      expect(result.content[0].text).toContain('Embedding model: Not loaded');
    });
  });

  // ============================================================
  // mcp_find_similar_sessions
  // ============================================================
  describe('mcp_find_similar_sessions', () => {
    it('should find sessions with session-index tag', async () => {
      vi.mocked(serverResult.store.search).mockReturnValueOnce([
        {
          memory: {
            content: 'Fixed websocket reconnection logic',
            tags: ['session-index'],
            source: '/path/to/session1.jsonl',
          },
          distance: 0.15,
        },
        {
          memory: {
            content: 'Unrelated memory',
            tags: ['general'],
            source: '/path/to/other.jsonl',
          },
          distance: 0.3,
        },
        {
          memory: {
            content: 'Debugged race condition in WS handler',
            tags: ['session-index'],
            source: '/path/to/session2.jsonl',
          },
          distance: 0.25,
        },
      ]);

      const findTool = serverResult.server._getToolHandler(
        'mcp_find_similar_sessions'
      );
      const result = await findTool({
        intent: 'fix websocket race condition',
        limit: 3,
      });

      expect(result.content[0].text).toContain(
        'Fixed websocket reconnection logic'
      );
      expect(result.content[0].text).toContain('Similarity: 0.85');
      expect(result.content[0].text).toContain('/path/to/session1.jsonl');
      expect(result.content[0].text).toContain(
        'Debugged race condition in WS handler'
      );
      expect(result.content[0].text).toContain('/path/to/session2.jsonl');
      // Should not contain the non-session-index memory
      expect(result.content[0].text).not.toContain('Unrelated memory');
    });

    it('should handle no matching sessions', async () => {
      vi.mocked(serverResult.store.search).mockReturnValueOnce([
        {
          memory: {
            content: 'Not a session',
            tags: ['general'],
            source: '',
          },
          distance: 0.5,
        },
      ]);

      const findTool = serverResult.server._getToolHandler(
        'mcp_find_similar_sessions'
      );
      const result = await findTool({ intent: 'fix unknown issue', limit: 3 });

      expect(result.content[0].text).toBe(
        'No relevant past sessions found.'
      );
    });

    it('should handle search errors', async () => {
      vi.mocked(serverResult.embedder.embed).mockRejectedValueOnce(
        new Error('Embedding service down')
      );

      const findTool = serverResult.server._getToolHandler(
        'mcp_find_similar_sessions'
      );
      const result = await findTool({ intent: 'test', limit: 3 });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Search failed');
      expect(result.content[0].text).toContain('Embedding service down');
    });
  });

  // ============================================================
  // mcp_get_secret
  // ============================================================
  describe('mcp_get_secret', () => {
    it('should return secret if found', async () => {
      const getSecretTool =
        serverResult.server._getToolHandler('mcp_get_secret');
      expect(getSecretTool).toBeDefined();

      const result = await getSecretTool({ key: 'VALID_KEY' });
      expect(result.content[0].text).toBe('sk_live_secret_value');
    });

    it('should handle missing keys', async () => {
      const getSecretTool =
        serverResult.server._getToolHandler('mcp_get_secret');
      const result = await getSecretTool({ key: 'MISSING_KEY' });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('not found');
    });

    it('should error when vault not initialized', async () => {
      const noKeyServer = createEngramServer({});
      const getSecretTool =
        noKeyServer.server._getToolHandler('mcp_get_secret');
      const result = await getSecretTool({ key: 'ANY_KEY' });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain(
        'Secrets vault is not initialized'
      );
    });
  });

  // ============================================================
  // mcp_set_secret
  // ============================================================
  describe('mcp_set_secret', () => {
    it('should store secret successfully', async () => {
      const setSecretTool =
        serverResult.server._getToolHandler('mcp_set_secret');
      const result = await setSecretTool({
        key: 'NEW_KEY',
        value: 'new_secret_value',
      });

      expect(serverResult.secretStore.set).toHaveBeenCalledWith(
        'NEW_KEY',
        'new_secret_value',
        undefined
      );
      expect(result.content[0].text).toContain(
        "Secret 'NEW_KEY' stored successfully"
      );
      expect(result.content[0].text).toContain('(local only)');
    });

    it('should indicate sync status when enabled', async () => {
      vi.mocked(serverResult.secretStore.isSyncEnabled).mockReturnValueOnce(
        true
      );

      const setSecretTool =
        serverResult.server._getToolHandler('mcp_set_secret');
      const result = await setSecretTool({
        key: 'SYNCED_KEY',
        value: 'val',
      });

      expect(result.content[0].text).toContain('(synced)');
    });

    it('should error when vault not initialized', async () => {
      const noKeyServer = createEngramServer({});
      const setSecretTool =
        noKeyServer.server._getToolHandler('mcp_set_secret');
      const result = await setSecretTool({ key: 'K', value: 'V' });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain(
        'Secrets vault is not initialized'
      );
    });

    it('should handle store errors', async () => {
      vi.mocked(serverResult.secretStore.set).mockRejectedValueOnce(
        new Error('Encryption failed')
      );

      const setSecretTool =
        serverResult.server._getToolHandler('mcp_set_secret');
      const result = await setSecretTool({ key: 'K', value: 'V' });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Failed to store secret');
      expect(result.content[0].text).toContain('Encryption failed');
    });
  });

  // ============================================================
  // mcp_authorize_device
  // ============================================================
  describe('mcp_authorize_device', () => {
    it('should authorize device', async () => {
      const authTool = serverResult.server._getToolHandler(
        'mcp_authorize_device'
      );
      const result = await authTool({
        device_id: 'device-1',
        device_public_key: 'PEM_KEY_DATA',
      });

      expect(serverResult.secretsSyncEngine.connect).toHaveBeenCalled();
      expect(
        serverResult.secretsSyncEngine.authorizeDevice
      ).toHaveBeenCalledWith('device-1', 'PEM_KEY_DATA');
      expect(result.content[0].text).toContain(
        "Device 'device-1' authorized for vault access."
      );
    });

    it('should error when sync engine not initialized', async () => {
      const noKeyServer = createEngramServer({});
      const authTool =
        noKeyServer.server._getToolHandler('mcp_authorize_device');
      const result = await authTool({
        device_id: 'device-1',
        device_public_key: 'PEM',
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Sync engine not initialized');
    });

    it('should handle authorization errors', async () => {
      vi.mocked(
        serverResult.secretsSyncEngine.authorizeDevice
      ).mockRejectedValueOnce(new Error('Invalid public key'));

      const authTool = serverResult.server._getToolHandler(
        'mcp_authorize_device'
      );
      const result = await authTool({
        device_id: 'device-1',
        device_public_key: 'BAD_KEY',
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Failed to authorize device');
      expect(result.content[0].text).toContain('Invalid public key');
    });
  });

  // ============================================================
  // mcp_list_devices
  // ============================================================
  describe('mcp_list_devices', () => {
    let syncServerResult: any;
    const mockFetch = vi.fn();

    beforeEach(() => {
      vi.stubGlobal('fetch', mockFetch);
      mockFetch.mockReset();
      syncServerResult = createEngramServer({
        masterKey: Buffer.alloc(32),
        syncApiUrl: 'https://sync.example.com',
        syncAuthToken: 'test-token',
      });
    });

    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it('should list authorized devices', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          devices: [
            {
              id: 'dev-1',
              name: 'MacBook',
              createdAt: new Date('2024-03-01').getTime(),
            },
            {
              id: 'dev-2',
              name: undefined,
              createdAt: new Date('2024-04-15').getTime(),
            },
          ],
        }),
      });

      const listTool =
        syncServerResult.server._getToolHandler('mcp_list_devices');
      const result = await listTool({});

      expect(mockFetch).toHaveBeenCalledWith(
        'https://sync.example.com/api/devices',
        expect.objectContaining({
          headers: { Authorization: 'Bearer test-token' },
        })
      );
      expect(result.content[0].text).toContain('Authorized devices');
      expect(result.content[0].text).toContain('MacBook');
      expect(result.content[0].text).toContain('dev-2');
    });

    it('should handle empty device list', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ devices: [] }),
      });

      const listTool =
        syncServerResult.server._getToolHandler('mcp_list_devices');
      const result = await listTool({});

      expect(result.content[0].text).toBe('No devices authorized.');
    });

    it('should error when sync not configured', async () => {
      const noSyncServer = createEngramServer({
        masterKey: Buffer.alloc(32),
      });
      const listTool =
        noSyncServer.server._getToolHandler('mcp_list_devices');
      const result = await listTool({});

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Sync not configured');
    });

    it('should handle fetch errors', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
      });

      const listTool =
        syncServerResult.server._getToolHandler('mcp_list_devices');
      const result = await listTool({});

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Failed to list devices');
      expect(result.content[0].text).toContain('500');
    });
  });

  // ============================================================
  // mcp_revoke_device
  // ============================================================
  describe('mcp_revoke_device', () => {
    it('should revoke device access', async () => {
      const revokeTool =
        serverResult.server._getToolHandler('mcp_revoke_device');
      const result = await revokeTool({ device_id: 'device-1' });

      expect(serverResult.secretsSyncEngine.connect).toHaveBeenCalled();
      expect(
        serverResult.secretsSyncEngine.revokeDevice
      ).toHaveBeenCalledWith('device-1');
      expect(result.content[0].text).toContain(
        "Device 'device-1' access revoked."
      );
    });

    it('should error when sync engine not initialized', async () => {
      const noKeyServer = createEngramServer({});
      const revokeTool =
        noKeyServer.server._getToolHandler('mcp_revoke_device');
      const result = await revokeTool({ device_id: 'device-1' });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Sync engine not initialized');
    });

    it('should handle revocation errors', async () => {
      vi.mocked(
        serverResult.secretsSyncEngine.revokeDevice
      ).mockRejectedValueOnce(new Error('Device not found'));

      const revokeTool =
        serverResult.server._getToolHandler('mcp_revoke_device');
      const result = await revokeTool({ device_id: 'device-1' });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Failed to revoke device');
      expect(result.content[0].text).toContain('Device not found');
    });
  });

  // ============================================================
  // mcp_create_recovery_kit
  // ============================================================
  describe('mcp_create_recovery_kit', () => {
    it('should generate recovery shares', async () => {
      const vaultServer = createEngramServer({
        masterKey: Buffer.alloc(32),
        vaultKey: Buffer.alloc(32),
      });

      const recoveryTool =
        vaultServer.server._getToolHandler('mcp_create_recovery_kit');
      const result = await recoveryTool({ shares: 5, threshold: 3 });

      expect(result.content[0].text).toContain('Recovery kit created (3-of-5)');
      expect(result.content[0].text).toContain('Share 1:');
      expect(result.content[0].text).toContain('Share 5:');
      expect(result.content[0].text).toContain('IMPORTANT');
      expect(result.content[0].text).toContain(
        'You need 3 shares to recover'
      );
    });

    it('should error when vault key not configured', async () => {
      const recoveryTool =
        serverResult.server._getToolHandler('mcp_create_recovery_kit');
      const result = await recoveryTool({ shares: 5, threshold: 3 });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Vault key not configured');
    });

    it('should handle generation errors', async () => {
      vi.mocked(generateRecoveryKit).mockRejectedValueOnce(
        new Error('Shamir split failed')
      );

      const vaultServer = createEngramServer({
        masterKey: Buffer.alloc(32),
        vaultKey: Buffer.alloc(32),
      });

      const recoveryTool =
        vaultServer.server._getToolHandler('mcp_create_recovery_kit');
      const result = await recoveryTool({ shares: 5, threshold: 3 });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Failed to create recovery kit');
      expect(result.content[0].text).toContain('Shamir split failed');
    });
  });
});

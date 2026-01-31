import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import {
  MemoryStore,
  initDatabase,
  EmbeddingService,
  SecretStore,
  CryptoService,
  IndexingService,
  SessionWatcher,
  SecretsSyncEngine,
  generateRecoveryKit,
  KeyManager,
} from '@engram/core';
import { join } from 'path';
import { homedir } from 'os';

export interface EngramServerConfig {
  dbPath?: string;
  modelsDir?: string;
  masterKey?: Buffer;
  vaultKey?: Buffer;
  syncApiUrl?: string;
  syncAuthToken?: string;
  blindIndexKey?: Buffer;
}

export interface EngramServerResult {
  server: McpServer;
  store: MemoryStore;
  secretStore?: SecretStore;
  secretsSyncEngine?: SecretsSyncEngine;
  keyManager?: KeyManager;
  embedder: EmbeddingService;
  watcher: SessionWatcher;
  close: () => Promise<void>;
}

export function createEngramServer(
  config: EngramServerConfig = {}
): EngramServerResult {
  const server = new McpServer({
    name: 'engram',
    version: '0.0.1',
  });

  const db = initDatabase(config.dbPath);
  const embedder = new EmbeddingService(
    'Xenova/all-MiniLM-L6-v2',
    config.modelsDir ?? './.cache/models'
  );

  let cryptoService: CryptoService | undefined;
  let secretStore: SecretStore | undefined;
  let secretsSyncEngine: SecretsSyncEngine | undefined;
  let keyManager: KeyManager | undefined;

  if (config.masterKey) {
    cryptoService = new CryptoService(config.masterKey);
    keyManager = new KeyManager();

    secretsSyncEngine = new SecretsSyncEngine(db);

    if (config.vaultKey) {
      secretsSyncEngine.setVaultKey(config.vaultKey);
    }

    if (config.blindIndexKey) {
      secretsSyncEngine.configureBlindIndex(config.blindIndexKey);
    }

    if (config.syncApiUrl && config.syncAuthToken) {
      secretsSyncEngine.configure({
        apiBaseUrl: config.syncApiUrl,
        authToken: config.syncAuthToken,
      });
    }

    secretStore = new SecretStore(db, cryptoService, {
      syncEngine: secretsSyncEngine,
      enableSync: !!(config.syncApiUrl && config.syncAuthToken),
    });
    secretStore.init();
  }

  const store = new MemoryStore(db, cryptoService);
  const indexer = new IndexingService(store, embedder, undefined, db);
  const watcher = new SessionWatcher(indexer);

  // Start watching Claude Code sessions (stored as JSONL in ~/.claude/projects/)
  const claudeProjectsPath = join(homedir(), '.claude', 'projects');
  watcher.watch([claudeProjectsPath]);

  server.tool(
    'mcp_get_secret',
    'Retrieve a secure secret (API key, credential) from the encrypted vault. The key will be injected ephemerally into your context.',
    {
      key: z.string().describe('The key name (e.g. STRIPE_API_KEY)'),
    },
    async ({ key }) => {
      if (!secretStore) {
        return {
          content: [
            {
              type: 'text',
              text: 'Error: Secrets vault is not initialized (Master Key missing).',
            },
          ],
          isError: true,
        };
      }

      try {
        const secret = secretStore.get(key);
        if (!secret) {
          return {
            content: [
              { type: 'text', text: `Secret '${key}' not found in vault.` },
            ],
            isError: true,
          };
        }

        return {
          content: [{ type: 'text', text: secret }],
        };
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Unknown error';
        return {
          content: [
            { type: 'text', text: `Failed to retrieve secret: ${message}` },
          ],
          isError: true,
        };
      }
    }
  );

  server.tool(
    'mcp_save_memory',
    'Store an important fact or piece of information in long-term memory. Use this when the user shares information worth remembering for future conversations.',
    {
      content: z.string().describe('The fact or information to remember'),
      tags: z
        .array(z.string())
        .optional()
        .describe('Optional tags for categorization'),
    },
    async ({ content, tags }) => {
      try {
        // Sanitize content BEFORE embedding to ensure secrets are not in the vector
        const { sanitized } = store.sanitize(content);
        const vector = await embedder.embed(sanitized);

        const memory = store.create({ content: sanitized, tags }, vector);

        return {
          content: [
            {
              type: 'text',
              text: `Remembered: "${memory.content.substring(0, 100)}${memory.content.length > 100 ? '...' : ''}" (ID: ${memory.id})`,
            },
          ],
        };
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Unknown error';
        return {
          content: [{ type: 'text', text: `Failed to remember: ${message}` }],
          isError: true,
        };
      }
    }
  );

  server.tool(
    'mcp_read_memory',
    'Search through stored memories to find relevant context. Use this before answering questions that might benefit from previously stored information.',
    {
      query: z.string().describe('The search query'),
      limit: z
        .number()
        .optional()
        .default(5)
        .describe('Maximum number of results to return'),
    },
    async ({ query, limit }) => {
      try {
        const queryVector = await embedder.embed(query);
        const results = store.search(queryVector, limit);

        if (results.length === 0) {
          return {
            content: [{ type: 'text', text: 'No relevant memories found.' }],
          };
        }

        const formatted = results
          .map((r, i) => {
            const tags =
              r.memory.tags.length > 0 ? ` [${r.memory.tags.join(', ')}]` : '';
            const verified = r.memory.isVerified ? ' (verified)' : '';
            return `${i + 1}. ${r.memory.content}${tags}${verified}\n   (similarity: ${(1 - r.distance).toFixed(3)})`;
          })
          .join('\n\n');

        return {
          content: [
            {
              type: 'text',
              text: `Found ${results.length} relevant memories:\n\n${formatted}`,
            },
          ],
        };
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Unknown error';
        return {
          content: [{ type: 'text', text: `Search failed: ${message}` }],
          isError: true,
        };
      }
    }
  );

  server.tool(
    'mcp_delete_memory',
    'Delete a specific memory by its ID. Use when the user wants to remove incorrect or outdated information.',
    {
      memory_id: z.string().describe('The ID of the memory to delete'),
    },
    async ({ memory_id }) => {
      try {
        const deleted = store.delete(memory_id);

        if (deleted) {
          return {
            content: [
              { type: 'text', text: `Memory ${memory_id} has been deleted.` },
            ],
          };
        } else {
          return {
            content: [{ type: 'text', text: `Memory ${memory_id} not found.` }],
          };
        }
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Unknown error';
        return {
          content: [{ type: 'text', text: `Delete failed: ${message}` }],
          isError: true,
        };
      }
    }
  );

  server.tool(
    'mcp_list_memories',
    'List recent memories with optional filtering. Use to browse what has been stored.',
    {
      limit: z.number().optional().default(10).describe('Maximum results'),
      source: z.string().optional().describe('Filter by source'),
    },
    async ({ limit, source }) => {
      try {
        const memories = store.list({ limit, source });

        if (memories.length === 0) {
          return {
            content: [{ type: 'text', text: 'No memories found.' }],
          };
        }

        const formatted = memories
          .map((m, i) => {
            const date = new Date(m.createdAt).toLocaleDateString();
            const tags = m.tags.length > 0 ? ` [${m.tags.join(', ')}]` : '';
            return `${i + 1}. [${date}] ${m.content.substring(0, 80)}${m.content.length > 80 ? '...' : ''}${tags}`;
          })
          .join('\n');

        return {
          content: [
            {
              type: 'text',
              text: `${memories.length} memories:\n\n${formatted}`,
            },
          ],
        };
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Unknown error';
        return {
          content: [{ type: 'text', text: `List failed: ${message}` }],
          isError: true,
        };
      }
    }
  );

  server.tool(
    'mcp_memory_status',
    'Get the current status of the memory system.',
    {},
    async () => {
      try {
        const count = store.count();
        const ready = embedder.isReady();
        const loading = embedder.isLoading();

        let status = `Memory count: ${count}\n`;
        status += `Embedding model: ${ready ? 'Ready' : loading ? 'Loading...' : 'Not loaded'}`;

        return {
          content: [{ type: 'text', text: status }],
        };
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Unknown error';
        return {
          content: [{ type: 'text', text: `Status failed: ${message}` }],
          isError: true,
        };
      }
    }
  );

  server.tool(
    'mcp_find_similar_sessions',
    'Find relevant past coding sessions to fork or reference ("Treasure Map"). Use this when you want to see how we solved similar problems before.',
    {
      intent: z
        .string()
        .describe(
          'What you are trying to do (e.g. "fix websocket race condition")'
        ),
      limit: z
        .number()
        .optional()
        .default(3)
        .describe('Number of sessions to find'),
    },
    async ({ intent, limit }) => {
      try {
        const queryVector = await embedder.embed(intent);

        const results = store.search(queryVector, limit * 2); // Fetch more to filter

        const sessionResults = results
          .filter((r) => r.memory.tags.includes('session-index'))
          .slice(0, limit);

        if (sessionResults.length === 0) {
          return {
            content: [
              { type: 'text', text: 'No relevant past sessions found.' },
            ],
          };
        }

        const formatted = sessionResults
          .map((r) => {
            return `Found relevant session (Similarity: ${(1 - r.distance).toFixed(2)}):
Path: ${r.memory.source}
Summary: ${r.memory.content}
Actionable: Use grep/ripgrep on this file to find implementation details.`;
          })
          .join('\n\n---\n\n');

        return {
          content: [{ type: 'text', text: formatted }],
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `Search failed: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  server.tool(
    'mcp_set_secret',
    'Create or update a secret in the encrypted vault with optional cloud sync.',
    {
      key: z.string().describe('The key name (e.g. STRIPE_API_KEY)'),
      value: z.string().describe('The secret value to store'),
      description: z.string().optional().describe('Optional description of the secret'),
    },
    async ({ key, value, description }: { key: string; value: string; description?: string }) => {
      if (!secretStore) {
        return {
          content: [{ type: 'text', text: 'Error: Secrets vault is not initialized.' }],
          isError: true,
        };
      }

      try {
        await secretStore.set(key, value, description);
        const syncStatus = secretStore.isSyncEnabled() ? ' (synced)' : ' (local only)';
        return {
          content: [{ type: 'text', text: `Secret '${key}' stored successfully${syncStatus}.` }],
        };
      } catch (error) {
        return {
          content: [{ type: 'text', text: `Failed to store secret: ${error instanceof Error ? error.message : String(error)}` }],
          isError: true,
        };
      }
    }
  );

  server.tool(
    'mcp_authorize_device',
    'Authorize a new device for vault access by encrypting the vault key with device RSA public key.',
    {
      device_id: z.string().describe('Unique identifier for the device'),
      device_public_key: z.string().describe('RSA public key in PEM format'),
    },
    async ({ device_id, device_public_key }: { device_id: string; device_public_key: string }) => {
      if (!secretsSyncEngine) {
        return {
          content: [{ type: 'text', text: 'Error: Sync engine not initialized.' }],
          isError: true,
        };
      }

      try {
        await secretsSyncEngine.connect();
        await secretsSyncEngine.authorizeDevice(device_id, device_public_key);
        return {
          content: [{ type: 'text', text: `Device '${device_id}' authorized for vault access.` }],
        };
      } catch (error) {
        return {
          content: [{ type: 'text', text: `Failed to authorize device: ${error instanceof Error ? error.message : String(error)}` }],
          isError: true,
        };
      }
    }
  );

  server.tool(
    'mcp_list_devices',
    'List all devices authorized for vault access.',
    {},
    async () => {
      if (!secretsSyncEngine || !config.syncApiUrl || !config.syncAuthToken) {
        return {
          content: [{ type: 'text', text: 'Error: Sync not configured.' }],
          isError: true,
        };
      }

      try {
        const res = await fetch(`${config.syncApiUrl}/api/devices`, {
          headers: { Authorization: `Bearer ${config.syncAuthToken}` },
        });

        if (!res.ok) {
          throw new Error(`Failed to list devices: ${res.status}`);
        }

        const data = (await res.json()) as { devices: Array<{ id: string; name?: string; createdAt: number }> };

        if (data.devices.length === 0) {
          return { content: [{ type: 'text', text: 'No devices authorized.' }] };
        }

        const formatted = data.devices
          .map((d, i) => `${i + 1}. ${d.name || d.id} (added ${new Date(d.createdAt).toLocaleDateString()})`)
          .join('\n');

        return { content: [{ type: 'text', text: `Authorized devices:\n${formatted}` }] };
      } catch (error) {
        return {
          content: [{ type: 'text', text: `Failed to list devices: ${error instanceof Error ? error.message : String(error)}` }],
          isError: true,
        };
      }
    }
  );

  server.tool(
    'mcp_revoke_device',
    'Revoke a device\'s access to the vault.',
    {
      device_id: z.string().describe('The device ID to revoke'),
    },
    async ({ device_id }: { device_id: string }) => {
      if (!secretsSyncEngine) {
        return {
          content: [{ type: 'text', text: 'Error: Sync engine not initialized.' }],
          isError: true,
        };
      }

      try {
        await secretsSyncEngine.connect();
        await secretsSyncEngine.revokeDevice(device_id);
        return {
          content: [{ type: 'text', text: `Device '${device_id}' access revoked.` }],
        };
      } catch (error) {
        return {
          content: [{ type: 'text', text: `Failed to revoke device: ${error instanceof Error ? error.message : String(error)}` }],
          isError: true,
        };
      }
    }
  );

  server.tool(
    'mcp_create_recovery_kit',
    'Generate a Shamir secret sharing recovery kit for vault key backup.',
    {
      shares: z.number().optional().default(5).describe('Total number of shares to create'),
      threshold: z.number().optional().default(3).describe('Minimum shares needed to recover'),
    },
    async ({ shares, threshold }: { shares: number; threshold: number }) => {
      if (!config.vaultKey) {
        return {
          content: [{ type: 'text', text: 'Error: Vault key not configured.' }],
          isError: true,
        };
      }

      try {
        const kit = await generateRecoveryKit(config.vaultKey, 'user', shares, threshold);

        const sharesList = kit.shares
          .map((s) => `Share ${s.index + 1}: ${s.data.substring(0, 20)}...`)
          .join('\n');

        return {
          content: [{
            type: 'text',
            text: `Recovery kit created (${threshold}-of-${shares}):\n\n${sharesList}\n\nIMPORTANT: Store these shares in separate secure locations. You need ${threshold} shares to recover your vault.`,
          }],
        };
      } catch (error) {
        return {
          content: [{ type: 'text', text: `Failed to create recovery kit: ${error instanceof Error ? error.message : String(error)}` }],
          isError: true,
        };
      }
    }
  );

  return {
    server,
    store,
    secretStore,
    secretsSyncEngine,
    keyManager,
    embedder,
    watcher,
    close: async () => {
      await watcher.close();
      if (secretsSyncEngine) {
        await secretsSyncEngine.disconnect();
      }
      db.close();
    },
  };
}

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';

import {
  initDatabase,
  MemoryStore,
  EmbeddingService,
  KeyManager,
  generateRecoveryPhrase,
  phraseToKey,
  SecretStore,
  CryptoService,
  IndexingService,
} from '@engram/core';

export function createCLI() {
  const program = new Command();

  program
    .name('engram')
    .description('Privacy-first AI memory layer - Signal for AI Memory')
    .version('0.0.1');

  program
    .command('init')
    .description('Initialize Engram with a new master key')
    .option('-f, --force', 'Overwrite existing configuration')
    .action(async (options: { force?: boolean }) => {
      const spinner = ora('Initializing Engram...').start();

      try {
        const keyManager = new KeyManager();
        const hasKey = await keyManager.hasMasterKey();

        if (hasKey && !options.force) {
          spinner.fail(
            'Engram already initialized. Use --force to reinitialize.'
          );
          return;
        }

        const recoveryPhrase = generateRecoveryPhrase();
        const masterKey = phraseToKey(recoveryPhrase);

        await keyManager.storeMasterKey(masterKey);

        const dataDir = join(homedir(), '.engram');
        if (!existsSync(dataDir)) {
          mkdirSync(dataDir, { recursive: true });
        }

        initDatabase();

        spinner.succeed('Engram initialized successfully!');

        console.log(
          '\n' + chalk.yellow.bold('⚠️  IMPORTANT: Save your recovery phrase!')
        );
        console.log(
          chalk.yellow(
            'This is the ONLY way to recover your memories if you lose access.\n'
          )
        );
        console.log(chalk.cyan('━'.repeat(60)));
        console.log(chalk.white.bold('\n' + recoveryPhrase + '\n'));
        console.log(chalk.cyan('━'.repeat(60)));
        console.log(
          chalk.yellow(
            '\nStore this phrase in a safe place and never share it.\n'
          )
        );

        await configureClients();
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'Unknown error';
        spinner.fail(`Initialization failed: ${msg}`);
        process.exit(1);
      }
    });

  program
    .command('build [paths...]')
    .description('Build memory by indexing session files')
    .option('-l, --limit <number>', 'Maximum files to process', '100')
    .option('-w, --watch', 'Watch for new files after initial build')
    .action(async (paths: string[], options: { limit: string; watch?: boolean }) => {
      const spinner = ora('Building memory...').start();

      try {
        const db = initDatabase();
        const store = new MemoryStore(db);
        const embedder = new EmbeddingService();
        const indexer = new IndexingService(store, embedder, undefined, db);

        // Default paths if none provided
        const searchPaths = paths.length > 0
          ? paths
          : [
              join(homedir(), '.claude', 'projects'),
              join(homedir(), '.opencode', 'history'),
              join(homedir(), '.cursor'),
              join(homedir(), '.codex'),
            ];

        // Collect all session files
        const { globSync } = await import('glob');
        const allFiles: string[] = [];

        for (const searchPath of searchPaths) {
          if (existsSync(searchPath)) {
            const jsonlFiles = globSync(join(searchPath, '**/*.jsonl'));
            const jsonFiles = globSync(join(searchPath, '**/*.json'));
            allFiles.push(...jsonlFiles, ...jsonFiles);
          }
        }

        const limit = parseInt(options.limit, 10);
        const filesToProcess = allFiles.slice(0, limit);

        spinner.text = `Processing ${filesToProcess.length} files...`;

        let processed = 0;
        let indexed = 0;
        let skipped = 0;
        let errors = 0;

        // Listen to indexing events for progress
        indexer.on('indexing', (event: { type: string; path: string }) => {
          if (event.type === 'stored') {
            indexed++;
            spinner.text = `Indexed ${indexed}/${processed} files...`;
          } else if (event.type === 'skipped') {
            skipped++;
          } else if (event.type === 'error') {
            errors++;
          }
        });

        for (const file of filesToProcess) {
          await indexer.ingestFile(file, 'add');
          processed++;
          spinner.text = `Processing ${processed}/${filesToProcess.length} files...`;
        }

        spinner.succeed(
          `Build complete: ${indexed} indexed, ${skipped} skipped, ${errors} errors`
        );

        if (options.watch) {
          console.log(chalk.cyan('\nWatching for new files... (Ctrl+C to stop)'));

          const { SessionWatcher } = await import('@engram/core');
          const watcher = new SessionWatcher(indexer);
          watcher.watch(searchPaths.filter(p => existsSync(p)));

          // Keep process running
          await new Promise(() => {});
        } else {
          db.close();
        }
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'Unknown error';
        spinner.fail(`Build failed: ${msg}`);
        process.exit(1);
      }
    });

  program
    .command('server')
    .description('Start the Engram MCP server (stdio mode)')
    .action(async () => {
      const keyManager = new KeyManager();
      const hasKey = await keyManager.hasMasterKey();

      if (!hasKey) {
        console.error(
          chalk.red('Engram not initialized. Run `engram init` first.')
        );
        process.exit(1);
      }

      const { createEngramServer } = await import('@engram/server');
      const { StdioServerTransport } =
        await import('@modelcontextprotocol/sdk/server/stdio.js');

      const dbPath = process.env['ENGRAM_PATH'];
      const modelsDir = process.env['ENGRAM_MODELS_DIR'];

      let masterKey: Buffer | undefined;
      try {
        masterKey = await keyManager.retrieveMasterKey();
      } catch (error) {
        process.stderr.write(
          chalk.yellow(
            'Warning: Could not retrieve Master Key from keychain. Secrets Vault will be disabled.\n'
          )
        );
      }

      const { server } = createEngramServer({ dbPath, modelsDir, masterKey });
      const transport = new StdioServerTransport();

      await server.connect(transport);
      process.stderr.write('Engram MCP Server running on stdio\n');
    });

  const secretCommand = program
    .command('secret')
    .description('Manage encrypted secrets');

  secretCommand
    .command('set <key> <value>')
    .description('Store a secret')
    .option('-d, --description <text>', 'Description of the secret')
    .action(
      async (key: string, value: string, options: { description?: string }) => {
        const keyManager = new KeyManager();
        const masterKey = await keyManager.retrieveMasterKey();

        const db = initDatabase();
        const crypto = new CryptoService(masterKey);
        const store = new SecretStore(db, crypto);

        store.init();
        await store.set(key, value, options.description);

        console.log(chalk.green(`Secret '${key}' saved.`));
        db.close();
      }
    );

  secretCommand
    .command('get <key>')
    .description('Retrieve a secret')
    .action(async (key: string) => {
      const keyManager = new KeyManager();
      const masterKey = await keyManager.retrieveMasterKey();

      const db = initDatabase();
      const crypto = new CryptoService(masterKey);
      const store = new SecretStore(db, crypto);

      const value = store.get(key);
      if (value) {
        console.log(value);
      } else {
        console.error(chalk.red(`Secret '${key}' not found.`));
        process.exit(1);
      }
      db.close();
    });

  secretCommand
    .command('list')
    .description('List all secrets')
    .action(async () => {
      const keyManager = new KeyManager();
      const masterKey = await keyManager.retrieveMasterKey();

      const db = initDatabase();
      const crypto = new CryptoService(masterKey);
      const store = new SecretStore(db, crypto);

      const secrets = store.list();
      if (secrets.length === 0) {
        console.log('No secrets stored.');
      } else {
        console.log(chalk.bold('\nStored Secrets:\n'));
        secrets.forEach((s) => {
          console.log(
            `- ${chalk.cyan(s.key)}: ${s.description || '(no description)'}`
          );
        });
        console.log('');
      }
      db.close();
    });

  secretCommand
    .command('delete <key>')
    .description('Delete a secret')
    .action(async (key: string) => {
      const keyManager = new KeyManager();
      const masterKey = await keyManager.retrieveMasterKey();

      const db = initDatabase();
      const crypto = new CryptoService(masterKey);
      const store = new SecretStore(db, crypto);

      const deleted = await store.delete(key);
      if (deleted) {
        console.log(chalk.green(`Secret '${key}' deleted.`));
      } else {
        console.error(chalk.red(`Secret '${key}' not found.`));
        process.exit(1);
      }
      db.close();
    });

  program
    .command('find-fork <intent>')
    .description('Find relevant past sessions to fork (Smart Forking)')
    .option('-l, --limit <number>', 'Maximum results', '5')
    .action(async (intent: string, options: { limit: string }) => {
      const spinner = ora('Scanning past sessions...').start();

      try {
        const db = initDatabase();
        const store = new MemoryStore(db);
        const embedder = new EmbeddingService();

        const queryVector = await embedder.embed(intent);
        const limit = parseInt(options.limit, 10);

        const results = store.search(queryVector, limit * 2);
        const sessions = results
          .filter((r) => r.memory.tags.includes('session-index'))
          .slice(0, limit);

        spinner.stop();

        if (sessions.length === 0) {
          console.log(chalk.yellow('No relevant past sessions found.'));
          return;
        }

        console.log(
          chalk.bold(`\nFound ${sessions.length} forkable sessions:\n`)
        );

        sessions.forEach((r, i) => {
          const similarity = (1 - r.distance).toFixed(2);
          console.log(chalk.green.bold(`${i + 1}. Similarity: ${similarity}`));
          console.log(chalk.white(r.memory.content));
          console.log(chalk.dim(`Path: ${r.memory.source}`));
          console.log(chalk.dim('─'.repeat(40)) + '\n');
        });

        db.close();
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'Unknown error';
        spinner.fail(`Find failed: ${msg}`);
        process.exit(1);
      }
    });

  program
    .command('status')
    .description('Show Engram status')
    .action(async () => {
      const keyManager = new KeyManager();
      const hasKey = await keyManager.hasMasterKey();

      console.log(chalk.bold('\nEngram Status\n'));
      console.log(
        `Initialized: ${hasKey ? chalk.green('Yes') : chalk.red('No')}`
      );

      if (hasKey) {
        const db = initDatabase();
        const store = new MemoryStore(db);
        const count = store.count();
        console.log(`Memory count: ${chalk.cyan(count)}`);
        db.close();
      }

      console.log('');
    });

  program
    .command('search <query>')
    .description('Search memories')
    .option('-l, --limit <number>', 'Maximum results', '5')
    .action(async (query: string, options: { limit: string }) => {
      const spinner = ora('Searching memories...').start();

      try {
        const db = initDatabase();
        const store = new MemoryStore(db);
        const embedder = new EmbeddingService();

        const vector = await embedder.embed(query);
        const results = store.search(vector, parseInt(options.limit, 10));

        spinner.stop();

        if (results.length === 0) {
          console.log(chalk.yellow('No memories found.'));
          return;
        }

        console.log(chalk.bold(`\nFound ${results.length} memories:\n`));

        results.forEach((r, i) => {
          const date = new Date(r.memory.createdAt).toLocaleDateString();
          const tags =
            r.memory.tags.length > 0
              ? chalk.dim(` [${r.memory.tags.join(', ')}]`)
              : '';
          const similarity = (1 - r.distance).toFixed(3);

          console.log(chalk.cyan(`${i + 1}.`) + ` ${r.memory.content}${tags}`);
          console.log(chalk.dim(`   ${date} | similarity: ${similarity}\n`));
        });

        db.close();
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'Unknown error';
        spinner.fail(`Search failed: ${msg}`);
        process.exit(1);
      }
    });

  program
    .command('export')
    .description('Export memories to JSON')
    .option('-o, --output <file>', 'Output file', 'engram-export.json')
    .action(async (options: { output: string }) => {
      const spinner = ora('Exporting memories...').start();

      try {
        const db = initDatabase();
        const store = new MemoryStore(db);
        const memories = store.list({ limit: 10000 });

        const exportData = {
          version: '1.0.0',
          exportedAt: new Date().toISOString(),
          count: memories.length,
          memories: memories.map((m) => ({
            id: m.id,
            content: m.content,
            tags: m.tags,
            source: m.source,
            confidence: m.confidence,
            isVerified: m.isVerified,
            createdAt: m.createdAt,
            updatedAt: m.updatedAt,
          })),
        };

        writeFileSync(options.output, JSON.stringify(exportData, null, 2));
        spinner.succeed(
          `Exported ${memories.length} memories to ${options.output}`
        );

        db.close();
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'Unknown error';
        spinner.fail(`Export failed: ${msg}`);
        process.exit(1);
      }
    });

  program
    .command('import')
    .description('Import memories from JSON file')
    .argument('<file>', 'JSON file to import')
    .option('--skip-duplicates', 'Skip memories that already exist', false)
    .action(async (file: string, options: { skipDuplicates?: boolean }) => {
      const spinner = ora('Importing memories...').start();

      try {
        if (!existsSync(file)) {
          spinner.fail(`File not found: ${file}`);
          process.exit(1);
        }

        const data = JSON.parse(readFileSync(file, 'utf-8'));

        if (!data.memories || !Array.isArray(data.memories)) {
          spinner.fail('Invalid export file format');
          process.exit(1);
        }

        const db = initDatabase();
        const store = new MemoryStore(db);
        const embedder = new EmbeddingService();

        let imported = 0;
        let skipped = 0;

        for (const memory of data.memories) {
          try {
            if (options.skipDuplicates) {
              const existing = store.getById(memory.id);
              if (existing) {
                skipped++;
                continue;
              }
            }

            const vector = await embedder.embed(memory.content);
            store.create(
              {
                content: memory.content,
                tags: memory.tags,
                source: memory.source,
                confidence: memory.confidence,
              },
              vector
            );
            imported++;
          } catch {
            skipped++;
          }
        }

        spinner.succeed(
          `Imported ${imported} memories${skipped > 0 ? ` (${skipped} skipped)` : ''}`
        );

        db.close();
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'Unknown error';
        spinner.fail(`Import failed: ${msg}`);
        process.exit(1);
      }
    });

  program
    .command('login')
    .description('Login to Engram cloud sync')
    .action(async () => {
      const readline = await import('readline');
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
      });

      const email = await new Promise<string>((resolve) => {
        rl.question(chalk.cyan('Email: '), (answer) => {
          rl.close();
          resolve(answer.trim());
        });
      });

      if (!email) {
        console.error(chalk.red('Email is required'));
        process.exit(1);
      }

      const spinner = ora('Sending magic link...').start();

      try {
        const apiUrl =
          process.env.ENGRAM_API_URL || 'https://engram.vercel.app';
        const res = await fetch(`${apiUrl}/api/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email }),
        });

        if (!res.ok) {
          const err = (await res.json()) as { error?: string };
          throw new Error(err.error || 'Login failed');
        }

        spinner.succeed('Magic link sent! Check your email.');
        console.log(chalk.dim('Click the link to complete login.'));
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'Unknown error';
        spinner.fail(`Login failed: ${msg}`);
        process.exit(1);
      }
    });

  program
    .command('logout')
    .description('Logout from Engram cloud sync')
    .action(async () => {
      const dataDir = join(homedir(), '.engram');
      const tokenPath = join(dataDir, 'auth.json');

      if (existsSync(tokenPath)) {
        const { unlinkSync } = await import('fs');
        unlinkSync(tokenPath);
        console.log(chalk.green('Logged out successfully'));
      } else {
        console.log(chalk.yellow('Not logged in'));
      }
    });

  program
    .command('sync')
    .description('Manually trigger cloud sync')
    .option('--push', 'Push local changes only')
    .option('--pull', 'Pull remote changes only')
    .action(async (options: { push?: boolean; pull?: boolean }) => {
      const spinner = ora('Syncing...').start();

      try {
        const dataDir = join(homedir(), '.engram');
        const tokenPath = join(dataDir, 'auth.json');

        if (!existsSync(tokenPath)) {
          spinner.fail('Not logged in. Run `engram login` first.');
          process.exit(1);
        }

        const authData = JSON.parse(readFileSync(tokenPath, 'utf-8'));
        const apiUrl =
          process.env.ENGRAM_API_URL || 'https://engram.vercel.app';

        if (!options.pull) {
          spinner.text = 'Pushing local changes...';
        }

        if (!options.push) {
          spinner.text = 'Pulling remote changes...';
          const res = await fetch(`${apiUrl}/api/sync/pull?cursor=0`, {
            headers: { Authorization: `Bearer ${authData.token}` },
          });

          if (!res.ok) {
            throw new Error('Pull failed');
          }

          const data = (await res.json()) as { events?: unknown[] };
          spinner.succeed(
            `Sync complete. ${data.events?.length || 0} events synced.`
          );
        } else {
          spinner.succeed('Push complete.');
        }
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'Unknown error';
        spinner.fail(`Sync failed: ${msg}`);
        process.exit(1);
      }
    });

  program
    .command('link')
    .description('Link a new device via QR code')
    .option('--show', 'Show QR code for another device to scan')
    .option('--code <code>', 'Enter code from another device')
    .action(async (options: { show?: boolean; code?: string }) => {
      const dataDir = join(homedir(), '.engram');
      const tokenPath = join(dataDir, 'auth.json');

      if (!existsSync(tokenPath)) {
        console.error(chalk.red('Not logged in. Run `engram login` first.'));
        process.exit(1);
      }

      const authData = JSON.parse(readFileSync(tokenPath, 'utf-8'));
      const apiUrl = process.env.ENGRAM_API_URL || 'https://engram.vercel.app';

      if (options.show) {
        const spinner = ora('Generating link code...').start();

        try {
          const res = await fetch(`${apiUrl}/api/devices/link`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${authData.token}`,
            },
            body: JSON.stringify({
              deviceName: `CLI-${process.platform}`,
              publicKey: 'placeholder',
            }),
          });

          if (!res.ok) {
            throw new Error('Failed to generate link code');
          }

          const data = (await res.json()) as {
            linkCode: string;
            expiresAt: string;
          };
          spinner.stop();

          console.log(chalk.bold('\nDevice Link Code:\n'));
          console.log(chalk.cyan.bold(`  ${data.linkCode}\n`));
          console.log(chalk.dim('Enter this code on your other device.'));
          console.log(
            chalk.dim(`Expires: ${new Date(data.expiresAt).toLocaleString()}`)
          );
        } catch (error) {
          const msg = error instanceof Error ? error.message : 'Unknown error';
          spinner.fail(`Link failed: ${msg}`);
          process.exit(1);
        }
      } else if (options.code) {
        const spinner = ora('Linking device...').start();

        try {
          const res = await fetch(`${apiUrl}/api/devices/link`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${authData.token}`,
            },
            body: JSON.stringify({
              deviceName: `CLI-${process.platform}`,
              publicKey: 'placeholder',
              linkCode: options.code,
            }),
          });

          if (!res.ok) {
            throw new Error('Invalid or expired link code');
          }

          spinner.succeed('Device linked successfully!');
        } catch (error) {
          const msg = error instanceof Error ? error.message : 'Unknown error';
          spinner.fail(`Link failed: ${msg}`);
          process.exit(1);
        }
      } else {
        console.log(
          chalk.yellow('Use --show to generate a code or --code <code> to link')
        );
      }
    });

  return program;
}

function getClaudeDesktopConfigPath(): string {
  const home = homedir();
  if (process.platform === 'darwin') {
    return join(
      home,
      'Library',
      'Application Support',
      'Claude',
      'claude_desktop_config.json'
    );
  } else if (process.platform === 'win32') {
    return join(
      home,
      'AppData',
      'Roaming',
      'Claude',
      'claude_desktop_config.json'
    );
  } else {
    return join(home, '.config', 'Claude', 'claude_desktop_config.json');
  }
}

function getCursorConfigPath(): string {
  const home = homedir();
  if (process.platform === 'darwin') {
    return join(home, '.cursor', 'mcp.json');
  } else if (process.platform === 'win32') {
    return join(home, '.cursor', 'mcp.json');
  } else {
    return join(home, '.cursor', 'mcp.json');
  }
}

function getClaudeCodeConfigPath(): string {
  return join(homedir(), '.claude.json');
}

function getEngramMcpConfig() {
  return {
    command: 'npx',
    args: ['-y', 'engram-core', 'server'],
    env: {
      ENGRAM_PATH: join(homedir(), '.engram', 'memory.db'),
      EMBEDDING_PROVIDER: 'local:onnx',
    },
  };
}

async function configureClients() {
  const configs = [
    {
      name: 'Claude Desktop',
      path: getClaudeDesktopConfigPath(),
    },
    {
      name: 'Cursor',
      path: getCursorConfigPath(),
    },
  ];

  // Configure Claude Desktop & Cursor (same format: { mcpServers: { engram: { ... } } })
  for (const config of configs) {
    const configDir = dirname(config.path);
    if (existsSync(configDir) || config.name === 'Cursor') {
      try {
        if (!existsSync(configDir)) {
          mkdirSync(configDir, { recursive: true });
        }

        let existing: { mcpServers?: Record<string, unknown> } = {};
        if (existsSync(config.path)) {
          existing = JSON.parse(readFileSync(config.path, 'utf-8'));
        }

        existing.mcpServers = existing.mcpServers ?? {};
        existing.mcpServers['engram'] = getEngramMcpConfig();

        writeFileSync(config.path, JSON.stringify(existing, null, 2));
        console.log(chalk.green(`✓ Configured ${config.name}`));
      } catch {
        console.log(chalk.yellow(`⚠ Could not configure ${config.name}`));
      }
    }
  }

  // Configure Claude Code (~/.claude.json uses top-level mcpServers with "type" field)
  try {
    const claudeCodePath = getClaudeCodeConfigPath();
    let existing: Record<string, unknown> = {};
    if (existsSync(claudeCodePath)) {
      existing = JSON.parse(readFileSync(claudeCodePath, 'utf-8'));
    }

    const mcpServers = (existing.mcpServers ?? {}) as Record<string, unknown>;
    mcpServers['engram'] = {
      type: 'stdio',
      ...getEngramMcpConfig(),
    };
    existing.mcpServers = mcpServers;

    writeFileSync(claudeCodePath, JSON.stringify(existing, null, 2));
    console.log(chalk.green('✓ Configured Claude Code'));
  } catch {
    console.log(chalk.yellow('⚠ Could not configure Claude Code'));
  }
}

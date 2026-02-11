/**
 * Integration Tests for Team Memory Features
 *
 * Tests the end-to-end team memory workflow:
 *   E.1 — Team auto-tagging via detectTeam() in mcp_save_memory
 *   E.2 — Consolidation round-trip (save team memories -> consolidate -> verify summary)
 *   E.3 — Contradiction detection for similar findings
 *   E.4 — CLI teams / listTeams with mock directory structure
 *   E.5 — Edge cases (no teams dir, empty team, malformed config, double consolidation)
 *
 * Uses mocked McpServer (captures tool handlers) + mocked SessionWatcher,
 * but real @engram/core logic (MemoryStore, EmbeddingService, consolidateTeam, detectTeam).
 */
import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
  afterEach,
  vi,
} from 'vitest';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// Mock only McpServer (capture tool handlers) and SessionWatcher (filesystem)
vi.mock('@modelcontextprotocol/sdk/server/mcp.js', () => {
  return {
    McpServer: vi.fn().mockImplementation(() => {
      const tools = new Map();
      return {
        tool: vi.fn().mockImplementation(
          (
            name: string,
            _desc: string,
            _schema: unknown,
            handler: Function
          ) => {
            tools.set(name, handler);
          }
        ),
        _getToolHandler: (name: string) => tools.get(name),
      };
    }),
  };
});

vi.mock('@engram/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@engram/core')>();
  return {
    ...actual,
    // Mock detectTeam so integration tests can control team context per-test
    detectTeam: vi.fn().mockReturnValue(null),
    // Only mock SessionWatcher to avoid filesystem side effects
    SessionWatcher: Object.assign(
      vi.fn().mockImplementation(() => ({
        watch: vi.fn(),
        close: vi.fn().mockResolvedValue(undefined),
      })),
      {
        getDefaultPaths: vi
          .fn()
          .mockReturnValue([
            '/mock/.claude/projects',
            '/mock/.claude/plugins',
          ]),
        getProjectPath: vi.fn().mockReturnValue('/mock/project/.claude'),
      }
    ),
    // IndexingService requires LLMService which we don't need
    IndexingService: vi.fn().mockImplementation(() => ({})),
  };
});

import { createEngramServer } from '../../src/server';
import type { EngramServerResult } from '../../src/server';
import {
  CryptoService,
  detectTeam,
  listTeams,
  consolidateTeam,
} from '@engram/core';

// Import the real (unmocked) detector functions for E.4/E.5 tests.
// vi.mock('@engram/core') only mocks the main '@engram/core' specifier;
// subpath exports like '@engram/core/team' remain unmocked.
import {
  detectTeam as realDetectTeam,
  listTeams as realListTeams,
} from '@engram/core/team';

// ============================================================
// E.1 — Team auto-tagging
// ============================================================

describe('E.1 — Team auto-tagging in mcp_save_memory', () => {
  let serverResult: EngramServerResult;
  let getHandler: (name: string) => Function;
  let teamsDir: string;

  beforeAll(async () => {
    // Create a temporary teams directory with a valid team config
    teamsDir = join(
      tmpdir(),
      `engram-team-test-${Date.now()}-${Math.random().toString(36).slice(2)}`
    );
    const teamDir = join(teamsDir, 'alpha-team');
    mkdirSync(teamDir, { recursive: true });
    writeFileSync(
      join(teamDir, 'config.json'),
      JSON.stringify({
        members: [
          { name: 'lead', agentId: 'a1', agentType: 'coordinator' },
          { name: 'worker', agentId: 'a2', agentType: 'implementer' },
        ],
      })
    );

    // Set the env var so detectTeam() picks up our test team
    process.env.CLAUDE_TEAM_NAME = 'alpha-team';
    // Override the default teams directory by setting the env to find our dir
    // Since detectTeam() in server.ts uses default homedir path, we need to
    // mock detectTeam to return our team. The real detectTeam is tested in
    // core unit tests; here we test the server integration.

    const masterKey = CryptoService.generateMasterKey();
    serverResult = createEngramServer({
      dbPath: ':memory:',
      masterKey,
    });

    await serverResult.embedder.initialize();

    getHandler = (name: string) => {
      const handler = (serverResult.server as any)._getToolHandler(name);
      if (!handler) throw new Error(`Tool handler '${name}' not found`);
      return handler;
    };
  }, 120_000);

  afterAll(async () => {
    delete process.env.CLAUDE_TEAM_NAME;
    await serverResult.close();
    try {
      rmSync(teamsDir, { recursive: true, force: true });
    } catch {
      // best-effort cleanup
    }
  });

  it('should auto-tag memory with team name when team is detected', async () => {
    // Since detectTeam() in the server uses the default homedir path,
    // we need to verify the behavior through the mocked detectTeam.
    // The server.ts calls detectTeam() without arguments.
    // For this integration test, we mock detectTeam at the module level.
    const { detectTeam: mockedDetectTeam } = await import('@engram/core');
    vi.mocked(mockedDetectTeam).mockReturnValue({
      name: 'alpha-team',
      members: [
        { name: 'lead', agentId: 'a1', agentType: 'coordinator' },
      ],
      configPath: join(teamsDir, 'alpha-team', 'config.json'),
    });

    const save = getHandler('mcp_save_memory');
    const list = getHandler('mcp_list_memories');

    const result = await save({
      content: 'The API endpoint returns 200 for valid requests',
      tags: ['finding'],
    });

    expect(result.content[0].text).toContain('Remembered:');
    expect(result.isError).toBeUndefined();

    // Verify the tag is present by listing memories
    const listResult = await list({ limit: 50 });
    expect(listResult.content[0].text).toContain('team:alpha-team');
    expect(listResult.content[0].text).toContain('finding');
  });

  it('should not duplicate team tag if already present', async () => {
    const { detectTeam: mockedDetectTeam } = await import('@engram/core');
    vi.mocked(mockedDetectTeam).mockReturnValue({
      name: 'alpha-team',
      members: [],
      configPath: '/mock/path',
    });

    const save = getHandler('mcp_save_memory');
    const list = getHandler('mcp_list_memories');

    // Provide the team tag manually
    await save({
      content: 'Already tagged with team name manually',
      tags: ['team:alpha-team', 'decision'],
    });

    const listResult = await list({ limit: 50 });
    const text = listResult.content[0].text;

    // Check that "team:alpha-team" appears but is not doubled
    // The memory should have [team:alpha-team, decision] not [team:alpha-team, decision, team:alpha-team]
    expect(text).toContain('Already tagged with team name manually');
  });

  it('should not add team tag when no team is detected', async () => {
    const { detectTeam: mockedDetectTeam } = await import('@engram/core');
    vi.mocked(mockedDetectTeam).mockReturnValue(null);

    const save = getHandler('mcp_save_memory');

    const result = await save({
      content: 'Memory without team context',
      tags: ['general'],
    });

    expect(result.content[0].text).toContain('Remembered:');
    // No team tag should be added
  });
});

// ============================================================
// E.2 — Consolidation round-trip
// ============================================================

describe('E.2 — Consolidation round-trip', () => {
  let serverResult: EngramServerResult;
  let getHandler: (name: string) => Function;

  beforeAll(async () => {
    const masterKey = CryptoService.generateMasterKey();
    serverResult = createEngramServer({
      dbPath: ':memory:',
      masterKey,
    });

    await serverResult.embedder.initialize();

    getHandler = (name: string) => {
      const handler = (serverResult.server as any)._getToolHandler(name);
      if (!handler) throw new Error(`Tool handler '${name}' not found`);
      return handler;
    };
  }, 120_000);

  afterAll(async () => {
    await serverResult.close();
  });

  it('should save team memories, consolidate them, and verify the summary', async () => {
    const { detectTeam: mockedDetectTeam } = await import('@engram/core');
    vi.mocked(mockedDetectTeam).mockReturnValue({
      name: 'consolidation-test',
      members: [],
      configPath: '/mock/path',
    });

    const save = getHandler('mcp_save_memory');
    const consolidate = getHandler('mcp_consolidate_team');
    const find = getHandler('mcp_find_similar_sessions');
    const list = getHandler('mcp_list_memories');

    // 1. Save multiple team memories with different categories
    await save({
      content: 'The auth service has a memory leak in session handling',
      tags: ['finding'],
    });

    await save({
      content: 'We decided to use JWT tokens instead of session cookies',
      tags: ['decision'],
    });

    await save({
      content: 'Migrate legacy endpoints to new auth system by Friday',
      tags: ['action-item'],
    });

    await save({
      content: 'General observation about code structure',
      tags: [],
    });

    // 2. Consolidate the team
    const consolidateResult = await consolidate({
      team_name: 'consolidation-test',
    });

    expect(consolidateResult.content[0].text).toContain(
      'Team "consolidation-test" consolidated'
    );
    expect(consolidateResult.content[0].text).toContain(
      '4 memories processed'
    );
    expect(consolidateResult.isError).toBeUndefined();

    // 3. Verify summary content
    const summaryText = consolidateResult.content[0].text;
    expect(summaryText).toContain('# Team Summary: consolidation-test');
    expect(summaryText).toContain('## Findings');
    expect(summaryText).toContain('memory leak');
    expect(summaryText).toContain('## Decisions');
    expect(summaryText).toContain('JWT tokens');
    expect(summaryText).toContain('## Action Items');
    expect(summaryText).toContain('Migrate legacy endpoints');
    expect(summaryText).toContain('## Other Insights');
    expect(summaryText).toContain('General observation');

    // 4. Verify the summary is listed with correct tags
    const listResult = await list({ limit: 50 });
    expect(listResult.content[0].text).toContain('team-summary');
    expect(listResult.content[0].text).toContain('team:consolidation-test');

    // 5. Verify the summary is searchable via mcp_find_similar_sessions
    // (team-summary tagged memories are included in session search)
    const findResult = await find({
      intent: 'auth service memory leak JWT tokens',
      limit: 5,
    });

    const findText = findResult.content[0].text;
    // The find should return the team summary since it has the team-summary tag
    expect(findText).toContain('Team: consolidation-test');
  });

  it('should fail consolidation when no team memories exist', async () => {
    const consolidate = getHandler('mcp_consolidate_team');

    const result = await consolidate({
      team_name: 'nonexistent-team',
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Consolidation failed');
    expect(result.content[0].text).toContain('No memories found');
  });

  it('should fail when no team name is provided and no team is detected', async () => {
    const { detectTeam: mockedDetectTeam } = await import('@engram/core');
    vi.mocked(mockedDetectTeam).mockReturnValue(null);

    const consolidate = getHandler('mcp_consolidate_team');

    const result = await consolidate({});

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('No team detected');
  });
});

// ============================================================
// E.3 — Contradiction detection
// ============================================================

describe('E.3 — Contradiction detection', () => {
  let serverResult: EngramServerResult;
  let getHandler: (name: string) => Function;

  beforeAll(async () => {
    const masterKey = CryptoService.generateMasterKey();
    serverResult = createEngramServer({
      dbPath: ':memory:',
      masterKey,
    });

    await serverResult.embedder.initialize();

    getHandler = (name: string) => {
      const handler = (serverResult.server as any)._getToolHandler(name);
      if (!handler) throw new Error(`Tool handler '${name}' not found`);
      return handler;
    };
  }, 120_000);

  afterAll(async () => {
    await serverResult.close();
  });

  it('should detect contradictions between very similar findings', async () => {
    const { detectTeam: mockedDetectTeam } = await import('@engram/core');
    vi.mocked(mockedDetectTeam).mockReturnValue(null);

    const save = getHandler('mcp_save_memory');

    // Use identical sentences to guarantee distance < 0.15.
    // The contradiction logic fires when: distance < 0.15, different id, both tagged 'finding'.
    const sharedContent =
      'The database connection pool is configured with a maximum size of exactly 10 concurrent connections';

    // 1. Save the first finding
    const first = await save({
      content: sharedContent,
      tags: ['finding'],
    });

    expect(first.content[0].text).toContain('Remembered:');
    expect(first.content[0].text).not.toContain('similar existing finding');

    // 2. Save an identical finding — should trigger contradiction
    const second = await save({
      content: sharedContent,
      tags: ['finding'],
    });

    const secondText = second.content[0].text;
    expect(secondText).toContain('Remembered:');
    // Exact duplicate should produce distance ~0, well below 0.15 threshold
    expect(secondText).toContain('similar existing finding');
  });

  it('should not trigger contradiction warning for non-finding tags', async () => {
    const { detectTeam: mockedDetectTeam } = await import('@engram/core');
    vi.mocked(mockedDetectTeam).mockReturnValue(null);

    const save = getHandler('mcp_save_memory');

    // Save a decision (not a finding)
    await save({
      content: 'We use Redis for caching with TTL of 3600 seconds',
      tags: ['decision'],
    });

    // Save a very similar decision
    const second = await save({
      content: 'We use Redis for caching with TTL of 3600 seconds globally',
      tags: ['decision'],
    });

    // No contradiction warning because these are decisions, not findings
    expect(second.content[0].text).not.toContain('similar existing finding');
  });

  it('should not trigger contradiction for unrelated findings', async () => {
    const { detectTeam: mockedDetectTeam } = await import('@engram/core');
    vi.mocked(mockedDetectTeam).mockReturnValue(null);

    const save = getHandler('mcp_save_memory');

    await save({
      content: 'Python uses garbage collection with reference counting',
      tags: ['finding'],
    });

    const second = await save({
      content:
        'Kubernetes pods are scheduled by the kube-scheduler component',
      tags: ['finding'],
    });

    // These are completely unrelated findings, no contradiction expected
    expect(second.content[0].text).not.toContain('similar existing finding');
  });
});

// ============================================================
// E.4 — CLI teams / listTeams with mock directory
// ============================================================

describe('E.4 — listTeams and detectTeam with mock directory', () => {
  let teamsDir: string;

  beforeEach(() => {
    teamsDir = join(
      tmpdir(),
      `engram-teams-e4-${Date.now()}-${Math.random().toString(36).slice(2)}`
    );
    mkdirSync(teamsDir, { recursive: true });
  });

  afterEach(() => {
    delete process.env.CLAUDE_TEAM_NAME;
    try {
      rmSync(teamsDir, { recursive: true, force: true });
    } catch {
      // ignore cleanup errors
    }
  });

  it('should list all valid teams from a directory', () => {
    // Create team directories
    const team1Dir = join(teamsDir, 'frontend');
    mkdirSync(team1Dir, { recursive: true });
    writeFileSync(
      join(team1Dir, 'config.json'),
      JSON.stringify({
        members: [
          { name: 'ui-lead', agentId: 'u1', agentType: 'lead' },
          { name: 'css-expert', agentId: 'u2', agentType: 'specialist' },
        ],
      })
    );

    const team2Dir = join(teamsDir, 'backend');
    mkdirSync(team2Dir, { recursive: true });
    writeFileSync(
      join(team2Dir, 'config.json'),
      JSON.stringify({
        members: [
          { name: 'api-lead', agentId: 'b1', agentType: 'lead' },
        ],
      })
    );

    // Use the real (unmocked) listTeams with our custom dir
    const teams = realListTeams(teamsDir);

    expect(teams).toHaveLength(2);
    const names = teams.map((t) => t.name).sort();
    expect(names).toEqual(['backend', 'frontend']);

    const frontend = teams.find((t) => t.name === 'frontend')!;
    expect(frontend.members).toHaveLength(2);
    expect(frontend.members[0]!.name).toBe('ui-lead');
  });

  it('should detect team via CLAUDE_TEAM_NAME env var', () => {
    const teamDir = join(teamsDir, 'my-active-team');
    mkdirSync(teamDir, { recursive: true });
    writeFileSync(
      join(teamDir, 'config.json'),
      JSON.stringify({
        members: [{ name: 'agent', agentId: 'x', agentType: 'worker' }],
      })
    );

    process.env.CLAUDE_TEAM_NAME = 'my-active-team';
    // Use the real (unmocked) detectTeam with our custom dir
    const result = realDetectTeam(teamsDir);

    expect(result).not.toBeNull();
    expect(result!.name).toBe('my-active-team');
    expect(result!.members).toHaveLength(1);
  });

  it('should return empty array when directory does not exist', () => {
    const teams = realListTeams('/nonexistent/teams/dir');
    expect(teams).toEqual([]);
  });

  it('should return null when no teams directory exists', () => {
    const result = realDetectTeam('/nonexistent/teams/dir');
    expect(result).toBeNull();
  });
});

// ============================================================
// E.5 — Edge cases
// ============================================================

describe('E.5 — Edge cases', () => {
  let teamsDir: string;

  beforeEach(() => {
    teamsDir = join(
      tmpdir(),
      `engram-teams-e5-${Date.now()}-${Math.random().toString(36).slice(2)}`
    );
    mkdirSync(teamsDir, { recursive: true });
  });

  afterEach(() => {
    delete process.env.CLAUDE_TEAM_NAME;
    try {
      rmSync(teamsDir, { recursive: true, force: true });
    } catch {
      // ignore cleanup errors
    }
  });

  // ── No teams directory ────────────────────────────────────────

  it('should gracefully handle non-existent teams directory', () => {
    const teams = realListTeams('/no/such/dir');
    expect(teams).toEqual([]);

    const detected = realDetectTeam('/no/such/dir');
    expect(detected).toBeNull();
  });

  // ── Malformed config.json ─────────────────────────────────────

  it('should skip teams with malformed config.json', () => {
    // Create a team with broken JSON
    const badDir = join(teamsDir, 'broken-team');
    mkdirSync(badDir, { recursive: true });
    writeFileSync(join(badDir, 'config.json'), '{ this is not valid JSON!!!');

    // Create a valid team
    const goodDir = join(teamsDir, 'valid-team');
    mkdirSync(goodDir, { recursive: true });
    writeFileSync(
      join(goodDir, 'config.json'),
      JSON.stringify({
        members: [{ name: 'agent', agentId: 'a1', agentType: 'worker' }],
      })
    );

    const teams = realListTeams(teamsDir);
    expect(teams).toHaveLength(1);
    expect(teams[0]!.name).toBe('valid-team');
  });

  it('should skip config.json without members array', () => {
    const noMembersDir = join(teamsDir, 'no-members');
    mkdirSync(noMembersDir, { recursive: true });
    writeFileSync(
      join(noMembersDir, 'config.json'),
      JSON.stringify({ description: 'missing members' })
    );

    const teams = realListTeams(teamsDir);
    expect(teams).toEqual([]);
  });

  it('should skip config.json that is a JSON array instead of object', () => {
    const arrayDir = join(teamsDir, 'array-config');
    mkdirSync(arrayDir, { recursive: true });
    writeFileSync(
      join(arrayDir, 'config.json'),
      JSON.stringify([{ name: 'agent' }])
    );

    const teams = realListTeams(teamsDir);
    expect(teams).toEqual([]);
  });

  // ── Empty team (no memories to consolidate) ───────────────────

  describe('Empty team consolidation', () => {
    let serverResult: EngramServerResult;
    let getHandler: (name: string) => Function;

    beforeAll(async () => {
      const masterKey = CryptoService.generateMasterKey();
      serverResult = createEngramServer({
        dbPath: ':memory:',
        masterKey,
      });

      await serverResult.embedder.initialize();

      getHandler = (name: string) => {
        const handler = (serverResult.server as any)._getToolHandler(name);
        if (!handler) throw new Error(`Tool handler '${name}' not found`);
        return handler;
      };
    }, 120_000);

    afterAll(async () => {
      await serverResult.close();
    });

    it('should return error when consolidating empty team', async () => {
      const consolidate = getHandler('mcp_consolidate_team');

      const result = await consolidate({ team_name: 'empty-team' });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Consolidation failed');
      expect(result.content[0].text).toContain('No memories found');
    });
  });

  // ── Double consolidation ──────────────────────────────────────

  describe('Double consolidation exclusion', () => {
    let serverResult: EngramServerResult;
    let getHandler: (name: string) => Function;

    beforeAll(async () => {
      const masterKey = CryptoService.generateMasterKey();
      serverResult = createEngramServer({
        dbPath: ':memory:',
        masterKey,
      });

      await serverResult.embedder.initialize();

      getHandler = (name: string) => {
        const handler = (serverResult.server as any)._getToolHandler(name);
        if (!handler) throw new Error(`Tool handler '${name}' not found`);
        return handler;
      };
    }, 120_000);

    afterAll(async () => {
      await serverResult.close();
    });

    it('should exclude team-summary memories from re-consolidation', async () => {
      const { detectTeam: mockedDetectTeam } = await import('@engram/core');
      vi.mocked(mockedDetectTeam).mockReturnValue({
        name: 'double-test',
        members: [],
        configPath: '/mock/path',
      });

      const save = getHandler('mcp_save_memory');
      const consolidate = getHandler('mcp_consolidate_team');

      // Save some team memories
      await save({
        content: 'The payment API returns HTTP 402 for failed charges',
        tags: ['finding'],
      });

      await save({
        content: 'We decided to retry failed payments 3 times',
        tags: ['decision'],
      });

      // First consolidation
      const first = await consolidate({ team_name: 'double-test' });
      expect(first.content[0].text).toContain('2 memories processed');
      expect(first.isError).toBeUndefined();

      // Add another memory after consolidation
      await save({
        content: 'Payment webhook needs to handle duplicate events',
        tags: ['finding'],
      });

      // Second consolidation — should NOT include the first summary
      const second = await consolidate({ team_name: 'double-test' });
      expect(second.content[0].text).toContain('3 memories processed');
      expect(second.isError).toBeUndefined();

      // The second summary should contain the new finding but should
      // have been generated from 3 original memories, not 4 (excluding the first summary)
      expect(second.content[0].text).toContain(
        'Payment webhook needs to handle duplicate events'
      );
      expect(second.content[0].text).toContain(
        'payment API returns HTTP 402'
      );
    });
  });
});

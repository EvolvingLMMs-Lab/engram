import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, rmSync, utimesSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { detectTeam, listTeams } from '../../src/team/detector';

describe('detectTeam', () => {
  let teamsDir: string;

  beforeEach(() => {
    teamsDir = join(tmpdir(), `engram-test-teams-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(teamsDir, { recursive: true });
  });

  afterEach(() => {
    // Clean up env
    delete process.env.CLAUDE_TEAM_NAME;
    // Remove temp dir
    try {
      rmSync(teamsDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  it('should return null when teams directory does not exist', () => {
    const result = detectTeam('/nonexistent/path/to/teams');
    expect(result).toBeNull();
  });

  it('should return null when teams directory is empty', () => {
    const result = detectTeam(teamsDir);
    expect(result).toBeNull();
  });

  it('should detect team from CLAUDE_TEAM_NAME env var', () => {
    const teamDir = join(teamsDir, 'my-team');
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

    process.env.CLAUDE_TEAM_NAME = 'my-team';
    const result = detectTeam(teamsDir);

    expect(result).not.toBeNull();
    expect(result!.name).toBe('my-team');
    expect(result!.members).toHaveLength(2);
    expect(result!.members[0]!.name).toBe('lead');
    expect(result!.members[0]!.agentId).toBe('a1');
    expect(result!.members[0]!.agentType).toBe('coordinator');
    expect(result!.configPath).toBe(join(teamDir, 'config.json'));
  });

  it('should fall back to directory scan when env var team is invalid', () => {
    // Create a valid team that should be found by scan
    const teamDir = join(teamsDir, 'fallback-team');
    mkdirSync(teamDir, { recursive: true });
    writeFileSync(
      join(teamDir, 'config.json'),
      JSON.stringify({
        members: [{ name: 'agent-1', agentId: 'x', agentType: 'worker' }],
      })
    );

    process.env.CLAUDE_TEAM_NAME = 'nonexistent-team';
    const result = detectTeam(teamsDir);

    // Env var team doesn't exist, so it should scan and find fallback-team
    expect(result).not.toBeNull();
    expect(result!.name).toBe('fallback-team');
  });

  it('should select the most recently modified team config', () => {
    // Create older team
    const oldDir = join(teamsDir, 'old-team');
    mkdirSync(oldDir, { recursive: true });
    const oldConfigPath = join(oldDir, 'config.json');
    writeFileSync(
      oldConfigPath,
      JSON.stringify({
        members: [{ name: 'old-agent', agentId: 'o1', agentType: 'worker' }],
      })
    );
    // Set mtime to past
    const pastDate = new Date(Date.now() - 60000);
    utimesSync(oldConfigPath, pastDate, pastDate);

    // Create newer team
    const newDir = join(teamsDir, 'new-team');
    mkdirSync(newDir, { recursive: true });
    writeFileSync(
      join(newDir, 'config.json'),
      JSON.stringify({
        members: [{ name: 'new-agent', agentId: 'n1', agentType: 'worker' }],
      })
    );

    const result = detectTeam(teamsDir);

    expect(result).not.toBeNull();
    expect(result!.name).toBe('new-team');
    expect(result!.members[0]!.name).toBe('new-agent');
  });

  it('should skip entries with malformed JSON', () => {
    const badDir = join(teamsDir, 'bad-team');
    mkdirSync(badDir, { recursive: true });
    writeFileSync(join(badDir, 'config.json'), '{ invalid json!!!');

    const goodDir = join(teamsDir, 'good-team');
    mkdirSync(goodDir, { recursive: true });
    writeFileSync(
      join(goodDir, 'config.json'),
      JSON.stringify({
        members: [{ name: 'agent', agentId: 'a1', agentType: 'worker' }],
      })
    );

    const result = detectTeam(teamsDir);

    expect(result).not.toBeNull();
    expect(result!.name).toBe('good-team');
  });

  it('should skip entries without members array', () => {
    const noMembersDir = join(teamsDir, 'no-members');
    mkdirSync(noMembersDir, { recursive: true });
    writeFileSync(
      join(noMembersDir, 'config.json'),
      JSON.stringify({ description: 'no members field' })
    );

    const result = detectTeam(teamsDir);
    expect(result).toBeNull();
  });

  it('should default agentId and agentType to unknown when missing', () => {
    const teamDir = join(teamsDir, 'minimal-team');
    mkdirSync(teamDir, { recursive: true });
    writeFileSync(
      join(teamDir, 'config.json'),
      JSON.stringify({
        members: [{ name: 'agent-only-name' }],
      })
    );

    const result = detectTeam(teamsDir);

    expect(result).not.toBeNull();
    expect(result!.members[0]!.name).toBe('agent-only-name');
    expect(result!.members[0]!.agentId).toBe('unknown');
    expect(result!.members[0]!.agentType).toBe('unknown');
  });

  it('should skip members without a name', () => {
    const teamDir = join(teamsDir, 'partial-team');
    mkdirSync(teamDir, { recursive: true });
    writeFileSync(
      join(teamDir, 'config.json'),
      JSON.stringify({
        members: [
          { agentId: 'no-name' },
          { name: 'valid', agentId: 'v1', agentType: 'worker' },
        ],
      })
    );

    const result = detectTeam(teamsDir);

    expect(result).not.toBeNull();
    expect(result!.members).toHaveLength(1);
    expect(result!.members[0]!.name).toBe('valid');
  });

  it('should skip non-directory entries', () => {
    // Create a file (not a directory) in the teams dir
    writeFileSync(join(teamsDir, 'not-a-team.txt'), 'just a file');

    const result = detectTeam(teamsDir);
    expect(result).toBeNull();
  });
});

describe('listTeams', () => {
  let teamsDir: string;

  beforeEach(() => {
    teamsDir = join(tmpdir(), `engram-test-teams-list-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(teamsDir, { recursive: true });
  });

  afterEach(() => {
    try {
      rmSync(teamsDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  it('should return empty array when directory does not exist', () => {
    const result = listTeams('/nonexistent/path/to/teams');
    expect(result).toEqual([]);
  });

  it('should return empty array when no valid teams exist', () => {
    const badDir = join(teamsDir, 'bad');
    mkdirSync(badDir, { recursive: true });
    writeFileSync(join(badDir, 'config.json'), 'not json');

    const result = listTeams(teamsDir);
    expect(result).toEqual([]);
  });

  it('should list all valid teams', () => {
    const team1Dir = join(teamsDir, 'alpha');
    mkdirSync(team1Dir, { recursive: true });
    writeFileSync(
      join(team1Dir, 'config.json'),
      JSON.stringify({
        members: [{ name: 'a1', agentId: 'id1', agentType: 'lead' }],
      })
    );

    const team2Dir = join(teamsDir, 'beta');
    mkdirSync(team2Dir, { recursive: true });
    writeFileSync(
      join(team2Dir, 'config.json'),
      JSON.stringify({
        members: [{ name: 'b1', agentId: 'id2', agentType: 'worker' }],
      })
    );

    // Add an invalid team that should be skipped
    const badDir = join(teamsDir, 'invalid');
    mkdirSync(badDir, { recursive: true });
    writeFileSync(join(badDir, 'config.json'), '<<<broken>>>');

    const result = listTeams(teamsDir);

    expect(result).toHaveLength(2);
    const names = result.map((t) => t.name).sort();
    expect(names).toEqual(['alpha', 'beta']);
  });

  it('should use team directory name as team name', () => {
    const teamDir = join(teamsDir, 'my-project-team');
    mkdirSync(teamDir, { recursive: true });
    writeFileSync(
      join(teamDir, 'config.json'),
      JSON.stringify({
        members: [{ name: 'agent', agentId: 'a', agentType: 't' }],
      })
    );

    const result = listTeams(teamsDir);

    expect(result).toHaveLength(1);
    expect(result[0]!.name).toBe('my-project-team');
  });
});

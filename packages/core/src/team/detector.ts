import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

/**
 * A member of a Claude Code agent team
 */
export interface TeamMember {
  name: string;
  agentId: string;
  agentType: string;
}

/**
 * Information about a detected team
 */
export interface TeamInfo {
  name: string;
  members: TeamMember[];
  configPath: string;
}

/**
 * Parse and validate a team config JSON object.
 * Returns a TeamInfo or null if the config is invalid.
 */
function parseTeamConfig(
  raw: unknown,
  teamName: string,
  configPath: string
): TeamInfo | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return null;
  }

  const obj = raw as Record<string, unknown>;

  if (!Array.isArray(obj.members)) {
    return null;
  }

  const members: TeamMember[] = [];
  for (const m of obj.members) {
    if (typeof m !== 'object' || m === null || Array.isArray(m)) {
      continue;
    }
    const member = m as Record<string, unknown>;
    if (typeof member.name !== 'string') {
      continue;
    }
    members.push({
      name: member.name,
      agentId: typeof member.agentId === 'string' ? member.agentId : 'unknown',
      agentType:
        typeof member.agentType === 'string' ? member.agentType : 'unknown',
    });
  }

  return {
    name: teamName,
    members,
    configPath,
  };
}

/**
 * Read and parse a single team config file.
 * Returns null if the file cannot be read or is malformed.
 */
function readTeamConfig(
  teamDir: string,
  teamName: string
): TeamInfo | null {
  const configPath = join(teamDir, 'config.json');
  try {
    const content = readFileSync(configPath, 'utf-8');
    const parsed: unknown = JSON.parse(content);
    return parseTeamConfig(parsed, teamName, configPath);
  } catch {
    return null;
  }
}

/**
 * Detect the currently active team.
 *
 * First checks the CLAUDE_TEAM_NAME environment variable.
 * If not set, scans the teams directory and returns the
 * most recently modified team (by config.json mtime).
 *
 * @param teamsDir - Override the default teams directory
 * @returns The detected team, or null if none found
 */
export function detectTeam(teamsDir?: string): TeamInfo | null {
  const dir = teamsDir ?? join(homedir(), '.claude', 'teams');

  // Check env var first
  const envTeamName = process.env.CLAUDE_TEAM_NAME;
  if (envTeamName) {
    const teamDir = join(dir, envTeamName);
    const info = readTeamConfig(teamDir, envTeamName);
    if (info) return info;
  }

  // Scan teams directory for the most recently modified team
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return null;
  }

  let bestTeam: TeamInfo | null = null;
  let bestMtime = 0;

  for (const entry of entries) {
    const teamDir = join(dir, entry);
    try {
      const dirStat = statSync(teamDir);
      if (!dirStat.isDirectory()) continue;
    } catch {
      continue;
    }

    const configPath = join(teamDir, 'config.json');
    let mtime: number;
    try {
      const configStat = statSync(configPath);
      mtime = configStat.mtimeMs;
    } catch {
      continue;
    }

    const info = readTeamConfig(teamDir, entry);
    if (info && mtime > bestMtime) {
      bestTeam = info;
      bestMtime = mtime;
    }
  }

  return bestTeam;
}

/**
 * List all valid teams found in the teams directory.
 *
 * @param teamsDir - Override the default teams directory
 * @returns Array of valid team info objects
 */
export function listTeams(teamsDir?: string): TeamInfo[] {
  const dir = teamsDir ?? join(homedir(), '.claude', 'teams');

  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return [];
  }

  const teams: TeamInfo[] = [];

  for (const entry of entries) {
    const teamDir = join(dir, entry);
    try {
      const dirStat = statSync(teamDir);
      if (!dirStat.isDirectory()) continue;
    } catch {
      continue;
    }

    const info = readTeamConfig(teamDir, entry);
    if (info) {
      teams.push(info);
    }
  }

  return teams;
}

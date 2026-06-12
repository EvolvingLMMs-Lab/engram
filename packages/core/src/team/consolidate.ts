import type { EmbeddingService } from '../embedding/service.js';
import type { MemoryStore } from '../memory/store.js';

/**
 * Result of consolidating a team's memories into a summary
 */
export interface ConsolidationResult {
  teamName: string;
  summary: string;
  memoryId: string;
  memoriesProcessed: number;
  categoryCounts: Record<string, number>;
}

/** Category labels used for sorting team memories */
const CATEGORIES = [
  'finding',
  'decision',
  'hypothesis',
  'blocker',
  'action-item',
] as const;

type Category = (typeof CATEGORIES)[number] | 'other';

/**
 * Categorize a memory by scanning its tags for known category labels.
 * Falls back to 'other' if no known category tag is found.
 */
function categorizeByTags(tags: string[]): Category {
  for (const tag of tags) {
    const lower = tag.toLowerCase();
    for (const cat of CATEGORIES) {
      if (lower === cat) {
        return cat;
      }
    }
  }
  return 'other';
}

/** Map category keys to human-readable markdown section headings */
const SECTION_HEADINGS: Record<Category, string> = {
  finding: 'Findings',
  decision: 'Decisions',
  hypothesis: 'Hypotheses',
  blocker: 'Blockers',
  'action-item': 'Action Items',
  other: 'Other Insights',
};

/**
 * Build a markdown summary from categorized memories.
 */
function buildMarkdown(
  teamName: string,
  categorized: Record<Category, string[]>,
  totalCount: number
): string {
  const lines: string[] = [];
  lines.push(`# Team Summary: ${teamName}`);
  lines.push('');

  const categoryOrder: Category[] = [
    'finding',
    'decision',
    'hypothesis',
    'blocker',
    'action-item',
    'other',
  ];

  for (const cat of categoryOrder) {
    const items = categorized[cat];
    if (items.length === 0) continue;

    lines.push(`## ${SECTION_HEADINGS[cat]}`);
    for (const item of items) {
      lines.push(`- ${item}`);
    }
    lines.push('');
  }

  lines.push('---');
  lines.push(
    `Consolidated from ${totalCount} team memories on ${new Date().toISOString().split('T')[0]}`
  );

  return lines.join('\n');
}

/**
 * Consolidate a team's memories into a single summary memory.
 *
 * Fetches all memories tagged with `team:{teamName}` (excluding existing
 * `team-summary` entries), categorizes them, generates a markdown summary,
 * embeds it, and saves it back to the store.
 *
 * @param teamName - The team name to consolidate
 * @param store - The memory store instance
 * @param embedder - The embedding service instance
 * @returns The consolidation result
 * @throws Error if no team memories are found
 */
export async function consolidateTeam(
  teamName: string,
  store: MemoryStore,
  embedder: EmbeddingService
): Promise<ConsolidationResult> {
  const teamTag = `team:${teamName}`;

  // Fetch all memories (large limit to get everything)
  const allMemories = store.list({ limit: 10000 });

  // Filter: must have team tag, must NOT have team-summary tag
  const teamMemories = allMemories.filter(
    (m) => m.tags.includes(teamTag) && !m.tags.includes('team-summary')
  );

  if (teamMemories.length === 0) {
    throw new Error(
      `No memories found for team "${teamName}". Nothing to consolidate.`
    );
  }

  // Categorize memories
  const categorized: Record<Category, string[]> = {
    finding: [],
    decision: [],
    hypothesis: [],
    blocker: [],
    'action-item': [],
    other: [],
  };

  const categoryCounts: Record<string, number> = {};

  for (const memory of teamMemories) {
    const category = categorizeByTags(memory.tags);
    categorized[category].push(memory.content);
    categoryCounts[category] = (categoryCounts[category] ?? 0) + 1;
  }

  // Build the summary markdown
  const summary = buildMarkdown(teamName, categorized, teamMemories.length);

  // Embed and save
  const vector = await embedder.embed(summary);
  const saved = store.create(
    {
      content: summary,
      tags: ['team-summary', teamTag],
      source: `team-consolidation:${teamName}`,
    },
    vector
  );

  return {
    teamName,
    summary,
    memoryId: saved.id,
    memoriesProcessed: teamMemories.length,
    categoryCounts,
  };
}

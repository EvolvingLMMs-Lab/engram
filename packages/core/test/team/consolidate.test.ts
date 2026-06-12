import { describe, it, expect, vi, beforeEach } from 'vitest';

import type { EmbeddingService } from '../../src/embedding/service';
import type { MemoryStore } from '../../src/memory/store';
import { consolidateTeam } from '../../src/team/consolidate';
import type { Memory } from '../../src/types';

function makeMemory(
  overrides: Partial<Memory> & { content: string; tags: string[] }
): Memory {
  return {
    id: overrides.id ?? `mem-${Math.random().toString(36).slice(2)}`,
    content: overrides.content,
    vector: overrides.vector ?? new Float32Array(384),
    tags: overrides.tags,
    source: overrides.source ?? null,
    confidence: overrides.confidence ?? 0.5,
    isVerified: overrides.isVerified ?? false,
    createdAt: overrides.createdAt ?? Date.now(),
    updatedAt: overrides.updatedAt ?? Date.now(),
  };
}

describe('consolidateTeam', () => {
  let mockStore: {
    list: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
  };
  let mockEmbedder: {
    embed: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    mockStore = {
      list: vi.fn().mockReturnValue([]),
      create: vi.fn().mockImplementation((input: { content: string; tags: string[] }, _vector: Float32Array) => ({
        id: 'summary-id-123',
        content: input.content,
        vector: new Float32Array(384),
        tags: input.tags,
        source: null,
        confidence: 0.5,
        isVerified: false,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      })),
    };
    mockEmbedder = {
      embed: vi.fn().mockResolvedValue(new Float32Array(384)),
    };
  });

  it('should throw when no team memories are found', async () => {
    mockStore.list.mockReturnValue([]);

    await expect(
      consolidateTeam(
        'test-team',
        mockStore as unknown as MemoryStore,
        mockEmbedder as unknown as EmbeddingService
      )
    ).rejects.toThrow('No memories found for team "test-team"');
  });

  it('should throw when only team-summary memories exist (no non-summary team memories)', async () => {
    mockStore.list.mockReturnValue([
      makeMemory({
        content: 'Old summary',
        tags: ['team:test-team', 'team-summary'],
      }),
    ]);

    await expect(
      consolidateTeam(
        'test-team',
        mockStore as unknown as MemoryStore,
        mockEmbedder as unknown as EmbeddingService
      )
    ).rejects.toThrow('No memories found for team "test-team"');
  });

  it('should categorize memories correctly and produce markdown', async () => {
    mockStore.list.mockReturnValue([
      makeMemory({
        content: 'The API returns 404 for missing users',
        tags: ['team:my-team', 'finding'],
      }),
      makeMemory({
        content: 'We decided to use REST over GraphQL',
        tags: ['team:my-team', 'decision'],
      }),
      makeMemory({
        content: 'Need to update the docs',
        tags: ['team:my-team', 'action-item'],
      }),
      makeMemory({
        content: 'Might be a caching issue',
        tags: ['team:my-team', 'hypothesis'],
      }),
      makeMemory({
        content: 'CI pipeline is broken',
        tags: ['team:my-team', 'blocker'],
      }),
      makeMemory({
        content: 'General observation about code quality',
        tags: ['team:my-team'],
      }),
    ]);

    const result = await consolidateTeam(
      'my-team',
      mockStore as unknown as MemoryStore,
      mockEmbedder as unknown as EmbeddingService
    );

    expect(result.teamName).toBe('my-team');
    expect(result.memoriesProcessed).toBe(6);
    expect(result.memoryId).toBe('summary-id-123');

    // Check category counts
    expect(result.categoryCounts['finding']).toBe(1);
    expect(result.categoryCounts['decision']).toBe(1);
    expect(result.categoryCounts['action-item']).toBe(1);
    expect(result.categoryCounts['hypothesis']).toBe(1);
    expect(result.categoryCounts['blocker']).toBe(1);
    expect(result.categoryCounts['other']).toBe(1);

    // Check markdown content
    expect(result.summary).toContain('# Team Summary: my-team');
    expect(result.summary).toContain('## Findings');
    expect(result.summary).toContain('- The API returns 404 for missing users');
    expect(result.summary).toContain('## Decisions');
    expect(result.summary).toContain('- We decided to use REST over GraphQL');
    expect(result.summary).toContain('## Action Items');
    expect(result.summary).toContain('- Need to update the docs');
    expect(result.summary).toContain('## Hypotheses');
    expect(result.summary).toContain('- Might be a caching issue');
    expect(result.summary).toContain('## Blockers');
    expect(result.summary).toContain('- CI pipeline is broken');
    expect(result.summary).toContain('## Other Insights');
    expect(result.summary).toContain(
      '- General observation about code quality'
    );
    expect(result.summary).toContain('Consolidated from 6 team memories on');
  });

  it('should exclude team-summary tagged memories from processing', async () => {
    mockStore.list.mockReturnValue([
      makeMemory({
        content: 'Old summary that should be excluded',
        tags: ['team:dev-team', 'team-summary'],
      }),
      makeMemory({
        content: 'Actual finding',
        tags: ['team:dev-team', 'finding'],
      }),
    ]);

    const result = await consolidateTeam(
      'dev-team',
      mockStore as unknown as MemoryStore,
      mockEmbedder as unknown as EmbeddingService
    );

    expect(result.memoriesProcessed).toBe(1);
    expect(result.summary).toContain('- Actual finding');
    expect(result.summary).not.toContain('Old summary that should be excluded');
  });

  it('should only include non-empty category sections', async () => {
    mockStore.list.mockReturnValue([
      makeMemory({
        content: 'Only a finding here',
        tags: ['team:sparse-team', 'finding'],
      }),
    ]);

    const result = await consolidateTeam(
      'sparse-team',
      mockStore as unknown as MemoryStore,
      mockEmbedder as unknown as EmbeddingService
    );

    expect(result.summary).toContain('## Findings');
    expect(result.summary).not.toContain('## Decisions');
    expect(result.summary).not.toContain('## Hypotheses');
    expect(result.summary).not.toContain('## Blockers');
    expect(result.summary).not.toContain('## Action Items');
    expect(result.summary).not.toContain('## Other Insights');
  });

  it('should filter memories from other teams', async () => {
    mockStore.list.mockReturnValue([
      makeMemory({
        content: 'My team finding',
        tags: ['team:target', 'finding'],
      }),
      makeMemory({
        content: 'Other team finding',
        tags: ['team:other', 'finding'],
      }),
    ]);

    const result = await consolidateTeam(
      'target',
      mockStore as unknown as MemoryStore,
      mockEmbedder as unknown as EmbeddingService
    );

    expect(result.memoriesProcessed).toBe(1);
    expect(result.summary).toContain('- My team finding');
    expect(result.summary).not.toContain('Other team finding');
  });

  it('should save consolidated memory with correct tags', async () => {
    mockStore.list.mockReturnValue([
      makeMemory({
        content: 'A finding',
        tags: ['team:proj', 'finding'],
      }),
    ]);

    await consolidateTeam(
      'proj',
      mockStore as unknown as MemoryStore,
      mockEmbedder as unknown as EmbeddingService
    );

    expect(mockStore.create).toHaveBeenCalledTimes(1);
    const createCall = mockStore.create.mock.calls[0];
    expect(createCall[0].tags).toEqual(['team-summary', 'team:proj']);
    expect(createCall[0].source).toBe('team-consolidation:proj');
  });

  it('should embed the summary text before saving', async () => {
    mockStore.list.mockReturnValue([
      makeMemory({
        content: 'A finding',
        tags: ['team:embed-test', 'finding'],
      }),
    ]);

    const fakeVector = new Float32Array(384).fill(0.42);
    mockEmbedder.embed.mockResolvedValue(fakeVector);

    await consolidateTeam(
      'embed-test',
      mockStore as unknown as MemoryStore,
      mockEmbedder as unknown as EmbeddingService
    );

    expect(mockEmbedder.embed).toHaveBeenCalledTimes(1);
    // The embed call should receive the summary markdown
    const embedArg = mockEmbedder.embed.mock.calls[0][0] as string;
    expect(embedArg).toContain('# Team Summary: embed-test');

    // The vector passed to create should be the one from embed
    const createCall = mockStore.create.mock.calls[0];
    expect(createCall[1]).toBe(fakeVector);
  });
});

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type Database from 'better-sqlite3';
import { initDatabase } from '../../src/memory/database';
import { MemoryStore } from '../../src/memory/store';
import { CryptoService } from '../../src/crypto/service';
import { EmbeddingService } from '../../src/embedding/service';

/**
 * Real Embedding Pipeline Integration Tests
 *
 * These tests load the actual ML model (Xenova/all-MiniLM-L6-v2).
 * First run downloads ~23 MB; subsequent runs use the cache.
 * beforeAll timeout is set to 120s for model loading.
 */
describe('Memory Pipeline Integration (real embeddings)', () => {
  let db: Database.Database;
  let crypto: CryptoService;
  let store: MemoryStore;
  let embedder: EmbeddingService;

  beforeAll(async () => {
    db = initDatabase(':memory:');
    const masterKey = CryptoService.generateMasterKey();
    crypto = new CryptoService(masterKey);
    store = new MemoryStore(db, crypto);

    embedder = new EmbeddingService();
    await embedder.initialize();
  }, 120_000); // 120s timeout for model loading

  afterAll(() => {
    db.close();
  });

  it('should embed text, store, and retrieve by ID', async () => {
    const text = 'TypeScript is a statically typed superset of JavaScript';
    const vector = await embedder.embed(text);

    expect(vector).toBeInstanceOf(Float32Array);
    expect(vector.length).toBe(384);

    const memory = store.create({ content: text, tags: ['programming'] }, vector);
    const fetched = store.get(memory.id);

    expect(fetched).not.toBeNull();
    expect(fetched!.content).toBe(text);
    expect(fetched!.tags).toContain('programming');
  });

  it('should return relevant results for semantic search', async () => {
    // Create memories with different topics
    const topics = [
      'TypeScript uses static types to catch errors at compile time',
      'React is a JavaScript library for building user interfaces',
      'PostgreSQL is a powerful relational database system',
      'Docker containers package applications with their dependencies',
      'Machine learning models learn patterns from data',
    ];

    for (const topic of topics) {
      const vec = await embedder.embed(topic);
      store.create({ content: topic }, vec);
    }

    // Search for something related to types/TypeScript
    const queryVec = await embedder.embed('static types and type checking');
    const results = store.search(queryVec, 3);

    expect(results.length).toBeGreaterThanOrEqual(1);
    // The TypeScript-related memory should be the top result
    expect(results[0].memory.content).toContain('TypeScript');
  });

  it('should rank semantically similar results higher', async () => {
    const memories = [
      'Vue.js is a progressive frontend JavaScript framework',
      'Angular is a platform for building mobile and desktop web applications',
      'MongoDB is a document-oriented NoSQL database',
    ];

    for (const m of memories) {
      const vec = await embedder.embed(m);
      store.create({ content: m }, vec);
    }

    const queryVec = await embedder.embed('frontend web framework');
    const results = store.search(queryVec, 3);

    // Frontend frameworks should rank higher than database
    const frontendResults = results.filter(
      r => r.memory.content.includes('Vue') || r.memory.content.includes('Angular'),
    );
    const dbResults = results.filter(r => r.memory.content.includes('MongoDB'));

    if (frontendResults.length > 0 && dbResults.length > 0) {
      // At least one frontend result should have lower distance (= more similar)
      const minFrontendDist = Math.min(...frontendResults.map(r => r.distance));
      const minDbDist = Math.min(...dbResults.map(r => r.distance));
      expect(minFrontendDist).toBeLessThan(minDbDist);
    }
  });

  it('should support hybrid search combining keywords and vectors', async () => {
    const vec1 = await embedder.embed('Kubernetes orchestrates containerized workloads');
    store.create({ content: 'Kubernetes orchestrates containerized workloads', tags: ['devops'] }, vec1);

    const vec2 = await embedder.embed('Terraform provisions infrastructure as code');
    store.create({ content: 'Terraform provisions infrastructure as code', tags: ['devops'] }, vec2);

    const vec3 = await embedder.embed('GraphQL is a query language for APIs');
    store.create({ content: 'GraphQL is a query language for APIs', tags: ['api'] }, vec3);

    const queryVec = await embedder.embed('container orchestration');
    const results = store.hybridSearch(queryVec, ['kubernetes'], 5);

    expect(results.length).toBeGreaterThanOrEqual(1);
    const k8sResult = results.find(r => r.memory.content.includes('Kubernetes'));
    expect(k8sResult).toBeDefined();
  });

  it('should handle DLP sanitization in the embedding pipeline', async () => {
    const fakeKey = 'sk-' + 'c'.repeat(48);
    const contentWithSecret = `My API key is ${fakeKey} and I use TypeScript`;

    const vec = await embedder.embed(contentWithSecret);
    const memory = store.create({ content: contentWithSecret }, vec);

    // Content should be sanitized
    expect(memory.content).toContain('{{SECRET:OPENAI_KEY}}');
    expect(memory.content).not.toContain(fakeKey);
    expect(memory.tags).toContain('dlp-redacted');

    // The memory should still be searchable
    const queryVec = await embedder.embed('API key TypeScript');
    const results = store.search(queryVec, 5);
    const found = results.find(r => r.memory.id === memory.id);
    expect(found).toBeDefined();
  });

  it('should embed and store a batch of texts', async () => {
    const texts = [
      'Redis is an in-memory data structure store',
      'Nginx is a high-performance HTTP server',
      'Prometheus monitors systems and services',
    ];

    const vectors = await embedder.embedBatch(texts);
    expect(vectors).toHaveLength(3);

    const memories = texts.map((text, i) =>
      store.create({ content: text }, vectors[i]),
    );

    expect(memories).toHaveLength(3);
    for (const m of memories) {
      const fetched = store.get(m.id);
      expect(fetched).not.toBeNull();
    }
  });

  it('should confirm embedding service is ready after initialization', () => {
    expect(embedder.isReady()).toBe(true);
    expect(embedder.isLoading()).toBe(false);
  });

  it('should produce normalized vectors (L2 norm ≈ 1)', async () => {
    const vec = await embedder.embed('Test normalization');
    let norm = 0;
    for (let i = 0; i < vec.length; i++) {
      norm += vec[i] * vec[i];
    }
    norm = Math.sqrt(norm);
    expect(norm).toBeCloseTo(1.0, 1);
  });
});

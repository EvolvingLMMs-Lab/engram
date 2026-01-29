import { describe, it, expect, beforeAll } from 'vitest';
import { EmbeddingService } from '../../src/embedding/service';

describe('EmbeddingService', () => {
  describe('initialization', () => {
    it('should report not ready before initialization', () => {
      const service = new EmbeddingService();
      expect(service.isReady()).toBe(false);
      expect(service.isLoading()).toBe(false);
    });

    it('should handle concurrent initialization calls', async () => {
      const service = new EmbeddingService();

      const promises = [
        service.initialize(),
        service.initialize(),
        service.initialize(),
      ];

      await Promise.all(promises);
      expect(service.isReady()).toBe(true);
    });
  });

  describe('embedding generation', () => {
    let service: EmbeddingService;

    beforeAll(async () => {
      service = new EmbeddingService();
      await service.initialize();
    }, 60000);

    it('should generate embeddings with correct dimensions', async () => {
      const embedding = await service.embed('Hello world');
      expect(embedding).toBeInstanceOf(Float32Array);
      expect(embedding.length).toBe(384);
    });

    it('should generate normalized embeddings', async () => {
      const embedding = await service.embed('Test sentence');
      const magnitude = Math.sqrt(
        embedding.reduce((sum, val) => sum + val * val, 0)
      );
      expect(magnitude).toBeCloseTo(1.0, 2);
    });

    it('should generate similar embeddings for similar texts', async () => {
      const emb1 = await service.embed('The cat sat on the mat');
      const emb2 = await service.embed('A cat was sitting on a mat');
      const emb3 = await service.embed('Quantum physics equations');

      const similarity12 = cosineSimilarity(emb1, emb2);
      const similarity13 = cosineSimilarity(emb1, emb3);

      expect(similarity12).toBeGreaterThan(0.7);
      expect(similarity13).toBeLessThan(0.5);
    });

    it('should handle batch embedding', async () => {
      const texts = ['First sentence', 'Second sentence', 'Third sentence'];
      const embeddings = await service.embedBatch(texts);

      expect(embeddings).toHaveLength(3);
      embeddings.forEach((emb) => {
        expect(emb).toBeInstanceOf(Float32Array);
        expect(emb.length).toBe(384);
      });
    });

    it('should handle empty string', async () => {
      const embedding = await service.embed('');
      expect(embedding).toBeInstanceOf(Float32Array);
      expect(embedding.length).toBe(384);
    });

    it('should handle long text', async () => {
      const longText = 'word '.repeat(1000);
      const embedding = await service.embed(longText);
      expect(embedding).toBeInstanceOf(Float32Array);
      expect(embedding.length).toBe(384);
    });

    it('should handle special characters', async () => {
      const specialText = '你好世界 🌍 <script>alert("xss")</script>';
      const embedding = await service.embed(specialText);
      expect(embedding).toBeInstanceOf(Float32Array);
      expect(embedding.length).toBe(384);
    });
  });
});

function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    const aVal = a[i] ?? 0;
    const bVal = b[i] ?? 0;
    dotProduct += aVal * bVal;
    normA += aVal * aVal;
    normB += bVal * bVal;
  }

  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

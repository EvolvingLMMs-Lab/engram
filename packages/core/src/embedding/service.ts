import { pipeline, env, type FeatureExtractionPipeline } from '@xenova/transformers';
import { existsSync, mkdirSync } from 'node:fs';

export class EmbeddingService {
  private extractor: FeatureExtractionPipeline | null = null;
  private modelName: string;
  private cacheDir: string;
  private isInitializing = false;
  private initPromise: Promise<void> | null = null;

  constructor(modelName = 'Xenova/all-MiniLM-L6-v2', cacheDir = './.cache/models') {
    this.modelName = modelName;
    this.cacheDir = cacheDir;
  }

  async initialize(): Promise<void> {
    if (this.extractor) return;
    if (this.initPromise) return this.initPromise;

    this.isInitializing = true;
    this.initPromise = this.loadModel();

    try {
      await this.initPromise;
    } finally {
      this.isInitializing = false;
    }
  }

  private async loadModel(): Promise<void> {
    if (!existsSync(this.cacheDir)) {
      mkdirSync(this.cacheDir, { recursive: true });
    }

    env.cacheDir = this.cacheDir;
    env.allowRemoteModels = true;

    this.extractor = await pipeline('feature-extraction', this.modelName);
  }

  async embed(text: string): Promise<Float32Array> {
    await this.initialize();

    if (!this.extractor) {
      throw new Error('Embedding model not initialized');
    }

    const output = await this.extractor(text, {
      pooling: 'mean',
      normalize: true,
    });

    return output.data as Float32Array;
  }

  async embedBatch(texts: string[]): Promise<Float32Array[]> {
    await this.initialize();

    if (!this.extractor) {
      throw new Error('Embedding model not initialized');
    }

    const results: Float32Array[] = [];
    for (const text of texts) {
      const output = await this.extractor(text, {
        pooling: 'mean',
        normalize: true,
      });
      results.push(output.data as Float32Array);
    }

    return results;
  }

  isReady(): boolean {
    return this.extractor !== null;
  }

  isLoading(): boolean {
    return this.isInitializing;
  }
}

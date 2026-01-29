import { EmbeddingService } from '../src/embedding/service';

interface BenchmarkResult {
  name: string;
  iterations: number;
  totalMs: number;
  avgMs: number;
  opsPerSec: number;
}

async function runBenchmark(
  name: string,
  fn: () => Promise<void>,
  iterations: number
): Promise<BenchmarkResult> {
  // Warmup
  for (let i = 0; i < 3; i++) {
    await fn();
  }

  const start = performance.now();
  for (let i = 0; i < iterations; i++) {
    await fn();
  }
  const totalMs = performance.now() - start;

  return {
    name,
    iterations,
    totalMs,
    avgMs: totalMs / iterations,
    opsPerSec: (iterations / totalMs) * 1000,
  };
}

function formatResult(result: BenchmarkResult): string {
  return `${result.name}:
  - Iterations: ${result.iterations}
  - Total time: ${result.totalMs.toFixed(2)}ms
  - Avg per op: ${result.avgMs.toFixed(2)}ms
  - Ops/sec: ${result.opsPerSec.toFixed(2)}`;
}

async function main() {
  console.log('Embedding Service Benchmark');
  console.log('===========================\n');

  const service = new EmbeddingService();

  console.log('Initializing model (first run downloads ~23MB)...');
  const initStart = performance.now();
  await service.initialize();
  const initTime = performance.now() - initStart;
  console.log(`Model initialized in ${initTime.toFixed(2)}ms\n`);

  const shortText = 'Hello world';
  const mediumText =
    'The quick brown fox jumps over the lazy dog. This is a medium length sentence that contains more tokens.';
  const longText =
    'Artificial intelligence and machine learning have transformed how we interact with technology. '.repeat(
      10
    );

  const results: BenchmarkResult[] = [];

  console.log('Running benchmarks...\n');

  results.push(
    await runBenchmark(
      'Short text (2 words)',
      async () => {
        await service.embed(shortText);
      },
      100
    )
  );

  results.push(
    await runBenchmark(
      'Medium text (~20 words)',
      async () => {
        await service.embed(mediumText);
      },
      100
    )
  );

  results.push(
    await runBenchmark(
      'Long text (~150 words)',
      async () => {
        await service.embed(longText);
      },
      50
    )
  );

  results.push(
    await runBenchmark(
      'Batch (10 texts)',
      async () => {
        await service.embedBatch(Array(10).fill(mediumText));
      },
      20
    )
  );

  console.log('Results');
  console.log('-------');
  results.forEach((r) => console.log(formatResult(r) + '\n'));

  console.log('\nSummary');
  console.log('-------');
  console.log(`Model: Xenova/all-MiniLM-L6-v2`);
  console.log(`Embedding dimensions: 384`);
  console.log(
    `Avg throughput (medium text): ${results[1]?.opsPerSec.toFixed(1)} embeddings/sec`
  );
}

main().catch(console.error);

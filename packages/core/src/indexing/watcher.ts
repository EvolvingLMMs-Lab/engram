import { FSWatcher } from 'chokidar';
import chokidar from 'chokidar';
import { basename } from 'node:path';
import type { IndexingService } from './service.js';

export class SessionWatcher {
  private watcher: FSWatcher | null = null;

  constructor(private indexer: IndexingService) {}

  watch(paths: string[]): void {
    if (this.watcher) {
      this.watcher.close();
    }

    this.watcher = chokidar.watch(paths, {
      // Only ignore entries whose own name starts with '.'
      // (the old regex matched full paths, breaking ~/.claude/projects/)
      ignored: (path: string) => basename(path).startsWith('.'),
      persistent: true,
      ignoreInitial: false, // Index existing files on startup
      depth: 3,
    });

    this.watcher
      .on('add', (path: string) => this.handleFile(path, 'add'))
      .on('change', (path: string) => this.handleFile(path, 'change'));

    console.log(`Watcher started on: ${paths.join(', ')}`);
  }

  async close(): Promise<void> {
    if (this.watcher) {
      await this.watcher.close();
      this.watcher = null;
    }
  }

  private async handleFile(path: string, event: 'add' | 'change'): Promise<void> {
    await this.indexer.ingestFile(path, event);
  }
}

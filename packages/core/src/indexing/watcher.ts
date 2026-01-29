import { FSWatcher } from 'chokidar';
import chokidar from 'chokidar';
import type { IndexingService } from './service.js';

export class SessionWatcher {
  private watcher: FSWatcher | null = null;

  constructor(private indexer: IndexingService) {}

  watch(paths: string[]): void {
    if (this.watcher) {
      this.watcher.close();
    }

    this.watcher = chokidar.watch(paths, {
      ignored: /(^|[\/\\])\../, // ignore dotfiles
      persistent: true,
      ignoreInitial: false, // Index existing files on startup
      depth: 2,
    });

    this.watcher
      .on('add', (path: string) => this.handleFile(path))
      .on('change', (path: string) => this.handleFile(path));

    console.log(`Watcher started on: ${paths.join(', ')}`);
  }

  async close(): Promise<void> {
    if (this.watcher) {
      await this.watcher.close();
      this.watcher = null;
    }
  }

  private async handleFile(path: string): Promise<void> {
    await this.indexer.ingestFile(path);
  }
}

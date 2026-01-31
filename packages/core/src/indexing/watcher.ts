import { homedir } from 'node:os';
import { basename, join } from 'node:path';

import type { FSWatcher } from 'chokidar';
import chokidar from 'chokidar';

import type { IndexingService } from './service.js';

export class SessionWatcher {
  private watcher: FSWatcher | null = null;
  private watchedPaths: Set<string> = new Set();

  constructor(private indexer: IndexingService) {}

  /**
   * Get default global watch paths
   */
  static getDefaultPaths(): string[] {
    const home = homedir();
    return [
      join(home, '.claude', 'projects'), // Claude Code session history
      join(home, '.claude', 'plugins'), // Global skills/agents/commands
    ];
  }

  /**
   * Get project-level .claude path for a given cwd
   */
  static getProjectPath(cwd: string): string {
    return join(cwd, '.claude');
  }

  /**
   * Start watching the specified paths
   */
  watch(paths: string[]): void {
    if (this.watcher) {
      void this.watcher.close();
    }

    this.watchedPaths = new Set(paths);

    this.watcher = chokidar.watch(paths, {
      // Only ignore entries whose own name starts with '.'
      ignored: (path: string) => basename(path).startsWith('.'),
      persistent: true,
      ignoreInitial: false, // Index existing files on startup
      depth: 5, // Increased depth to support skills/*/SKILL.md structure
    });

    this.watcher
      .on('add', (path: string) => void this.handleFile(path, 'add'))
      .on('change', (path: string) => void this.handleFile(path, 'change'));

    console.log(`[Watcher] Started on: ${paths.join(', ')}`);
  }

  /**
   * Dynamically add a path to watch (without restarting the watcher)
   */
  addPath(path: string): void {
    if (this.watchedPaths.has(path)) return;

    this.watchedPaths.add(path);
    if (this.watcher) {
      this.watcher.add(path);
      console.log(`[Watcher] Added path: ${path}`);
    }
  }

  /**
   * Remove a path from watching
   */
  removePath(path: string): void {
    if (!this.watchedPaths.has(path)) return;

    this.watchedPaths.delete(path);
    if (this.watcher) {
      this.watcher.unwatch(path);
      console.log(`[Watcher] Removed path: ${path}`);
    }
  }

  /**
   * Get currently watched paths
   */
  getWatchedPaths(): string[] {
    return Array.from(this.watchedPaths);
  }

  /**
   * Close the watcher
   */
  async close(): Promise<void> {
    if (this.watcher) {
      await this.watcher.close();
      this.watcher = null;
      this.watchedPaths.clear();
    }
  }

  private async handleFile(
    path: string,
    event: 'add' | 'change'
  ): Promise<void> {
    await this.indexer.ingestFile(path, event);
  }
}

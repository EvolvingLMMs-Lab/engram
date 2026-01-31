import { readFile } from 'node:fs/promises';
import { EventEmitter } from 'node:events';
import type Database from 'better-sqlite3';
import type { MemoryStore } from '../memory/store.js';
import type { EmbeddingService } from '../embedding/service.js';
import { LLMService } from '../llm/service.js';
import type { SessionMessage, EngramAbstract } from '../llm/service.js';
import { SkillAgentParser } from './skillAgentParser.js';

export interface IndexingResult {
  summary: string;
  metadata: Record<string, any>;
  path: string;
}

export interface SessionParser {
  canParse(path: string): boolean;
  parse(path: string, content: string): Promise<IndexingResult | null>;
}

export interface IndexingEvent {
  type: 'start' | 'parsed' | 'embedded' | 'stored' | 'skipped' | 'error';
  path: string;
  parserType?: string;
  summary?: string;
  memoryId?: string;
  error?: string;
  timestamp: number;
}

/**
 * Parser for Claude Code sessions
 * Parses JSONL files from ~/.claude/projects/<project>/<session-id>.jsonl
 *
 * Each line is a JSON object with fields:
 *   type: "user" | "assistant" | "summary" | "progress" | "file-history-snapshot"
 *   message?: { role: string, content: string | ContentBlock[] }
 *   sessionId?, cwd?, gitBranch?, version?
 */
export class ClaudeSessionParser implements SessionParser {
  canParse(path: string): boolean {
    return (
      path.endsWith('.jsonl') &&
      (path.includes('.claude/projects') || path.includes('claude-code'))
    );
  }

  async parse(path: string, content: string): Promise<IndexingResult | null> {
    try {
      const lines = content.split('\n').filter((l) => l.trim());
      if (lines.length === 0) return null;

      const entries: any[] = [];
      for (const line of lines) {
        try {
          entries.push(JSON.parse(line));
        } catch {
          // skip malformed lines
        }
      }

      // Extract messages (user + assistant entries with message field)
      const messages = entries.filter(
        (e) =>
          (e.type === 'user' || e.type === 'assistant') && e.message?.content
      );

      const messageCount = messages.length;
      if (messageCount === 0) return null;

      // Extract session metadata from first message entry
      const firstEntry = entries.find((e) => e.sessionId);
      const sessionId = firstEntry?.sessionId || 'unknown';
      const cwd = firstEntry?.cwd || '';
      const gitBranch = firstEntry?.gitBranch || '';

      // Derive project name from cwd or file path
      const project = cwd ? cwd.split('/').pop() : path.split('/').slice(-2, -1)[0] || 'unknown';

      // Find first user message as intent
      const firstUserMsg = messages.find((m) => m.type === 'user');
      const firstUserContent = this.extractTextContent(
        firstUserMsg?.message?.content
      );

      // Find last assistant text message
      const lastAssistantMsg = [...messages]
        .reverse()
        .find(
          (m) =>
            m.type === 'assistant' &&
            this.extractTextContent(m.message?.content)
        );
      const lastContext = this.extractTextContent(
        lastAssistantMsg?.message?.content
      );

      const summary = `Claude Session (${messageCount} msgs)\nProject: ${project}${gitBranch ? ` [${gitBranch}]` : ''}\nIntent: ${firstUserContent ? firstUserContent.substring(0, 200) : 'Unknown'}\nLast context: ${lastContext ? lastContext.substring(0, 100) : '...'}`;

      return {
        summary,
        metadata: {
          type: 'claude-session',
          messageCount,
          sessionId,
          project,
          gitBranch,
          timestamp: firstEntry?.timestamp
            ? new Date(firstEntry.timestamp).getTime()
            : Date.now(),
        },
        path,
      };
    } catch (e) {
      return null;
    }
  }

  /**
   * Extract plain text from Claude message content.
   * Content can be a string or an array of content blocks.
   */
  private extractTextContent(content: any): string {
    if (typeof content === 'string') return content;
    if (Array.isArray(content)) {
      const textBlock = content.find((b: any) => b.type === 'text');
      return typeof textBlock?.text === 'string' ? textBlock.text : '';
    }
    return '';
  }
}

/**
 * Parser for OpenCode sessions
 * Parses JSON files from ~/.opencode/history/
 */
export class OpenCodeSessionParser implements SessionParser {
  canParse(path: string): boolean {
    return (
      path.endsWith('.json') &&
      (path.includes('.opencode/history') || path.includes('opencode'))
    );
  }

  async parse(path: string, content: string): Promise<IndexingResult | null> {
    try {
      const session = JSON.parse(content);

      // OpenCode format: { messages: [...], metadata: {...} }
      const messages = session.messages || session.conversation || [];
      const messageCount = Array.isArray(messages) ? messages.length : 0;

      // Extract first user message as intent
      const firstUserMsg = messages.find(
        (m: any) => m.role === 'user' || m.type === 'human'
      );
      const intent =
        typeof firstUserMsg?.content === 'string'
          ? firstUserMsg.content.substring(0, 200)
          : 'Unknown';

      // Extract last assistant message for context
      const lastAssistantMsg = [...messages]
        .reverse()
        .find((m: any) => m.role === 'assistant' || m.type === 'ai');
      const lastContext =
        typeof lastAssistantMsg?.content === 'string'
          ? lastAssistantMsg.content.substring(0, 100)
          : '...';

      // Extract project/workspace info if available
      const project =
        session.metadata?.project ||
        session.workspace ||
        session.cwd ||
        'Unknown project';

      const summary = `OpenCode Session (${messageCount} msgs)\nProject: ${project}\nIntent: ${intent}\nLast context: ${lastContext}`;

      return {
        summary,
        metadata: {
          type: 'opencode-session',
          messageCount,
          project,
          timestamp:
            session.metadata?.timestamp || session.created_at || Date.now(),
        },
        path,
      };
    } catch (e) {
      return null;
    }
  }
}

/**
 * Parser for Cursor AI sessions
 * Parses from VS Code workspace storage
 */
export class CursorSessionParser implements SessionParser {
  canParse(path: string): boolean {
    return (
      (path.endsWith('.json') || path.endsWith('.log')) &&
      (path.includes('cursor') ||
        path.includes('workspaceStorage') ||
        path.includes('.cursor'))
    );
  }

  async parse(path: string, content: string): Promise<IndexingResult | null> {
    try {
      // Cursor stores conversations in various formats
      let session: any;

      try {
        session = JSON.parse(content);
      } catch {
        // If not JSON, try to parse as JSONL (line-delimited JSON)
        const lines = content.split('\n').filter((l) => l.trim());
        if (lines.length === 0) return null;
        session = { messages: lines.map((l) => JSON.parse(l)) };
      }

      const messages = session.messages || session.conversation || [];
      const messageCount = Array.isArray(messages) ? messages.length : 0;

      if (messageCount === 0) return null;

      const firstUserMsg = messages.find(
        (m: any) =>
          m.role === 'user' || m.type === 'human' || m.author === 'user'
      );
      const intent =
        typeof firstUserMsg?.content === 'string'
          ? firstUserMsg.content.substring(0, 200)
          : typeof firstUserMsg?.text === 'string'
            ? firstUserMsg.text.substring(0, 200)
            : 'Unknown';

      const lastMsg = messages[messages.length - 1];
      const lastContext =
        typeof lastMsg?.content === 'string'
          ? lastMsg.content.substring(0, 100)
          : typeof lastMsg?.text === 'string'
            ? lastMsg.text.substring(0, 100)
            : '...';

      const summary = `Cursor Session (${messageCount} msgs)\nIntent: ${intent}\nLast context: ${lastContext}`;

      return {
        summary,
        metadata: {
          type: 'cursor-session',
          messageCount,
          timestamp: session.timestamp || session.created_at || Date.now(),
        },
        path,
      };
    } catch (e) {
      return null;
    }
  }
}

/**
 * Parser for Codex CLI sessions
 * Parses from ~/.codex/history/
 */
export class CodexSessionParser implements SessionParser {
  canParse(path: string): boolean {
    return path.endsWith('.json') && path.includes('.codex');
  }

  async parse(path: string, content: string): Promise<IndexingResult | null> {
    try {
      const session = JSON.parse(content);

      const messages = session.messages || session.turns || [];
      const messageCount = Array.isArray(messages) ? messages.length : 0;

      if (messageCount === 0) return null;

      const firstUserMsg = messages.find((m: any) => m.role === 'user');
      const intent =
        typeof firstUserMsg?.content === 'string'
          ? firstUserMsg.content.substring(0, 200)
          : 'Unknown';

      const summary = `Codex Session (${messageCount} msgs)\nIntent: ${intent}`;

      return {
        summary,
        metadata: {
          type: 'codex-session',
          messageCount,
          timestamp: session.timestamp || Date.now(),
        },
        path,
      };
    } catch (e) {
      return null;
    }
  }
}

export class IndexingService extends EventEmitter {
  private parsers: SessionParser[] = [];
  private llmService: LLMService | null = null;
  private db: Database.Database | null = null;
  private progressMap: Map<string, IndexingEvent> = new Map();
  private recentEvents: IndexingEvent[] = [];
  private static readonly MAX_RECENT_EVENTS = 200;
  private insertEventStmt: Database.Statement | null = null;

  constructor(
    private store: MemoryStore,
    private embedder: EmbeddingService,
    llmService?: LLMService,
    db?: Database.Database
  ) {
    super();
    this.llmService = llmService ?? null;
    this.db = db ?? null;

    // Prepare statement for inserting events
    if (this.db) {
      try {
        this.insertEventStmt = this.db.prepare(`
          INSERT INTO indexing_events (path, type, parser_type, summary, memory_id, error, timestamp)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `);
      } catch {
        // Table might not exist yet in older databases
        this.insertEventStmt = null;
      }
    }

    // Register all session parsers
    this.parsers.push(new ClaudeSessionParser());
    this.parsers.push(new OpenCodeSessionParser());
    this.parsers.push(new CursorSessionParser());
    this.parsers.push(new CodexSessionParser());
    this.parsers.push(new SkillAgentParser());
  }

  /**
   * Set database connection for persisting indexing events
   */
  setDatabase(db: Database.Database): void {
    this.db = db;
    try {
      this.insertEventStmt = this.db.prepare(`
        INSERT INTO indexing_events (path, type, parser_type, summary, memory_id, error, timestamp)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);
    } catch {
      this.insertEventStmt = null;
    }
  }

  /**
   * Add a custom parser for other session formats
   */
  addParser(parser: SessionParser): void {
    this.parsers.push(parser);
  }

  /**
   * Set LLM service for enhanced session summarization
   */
  setLLMService(llmService: LLMService): void {
    this.llmService = llmService;
  }

  /**
   * Get current progress for all tracked files
   */
  getProgress(): Map<string, IndexingEvent> {
    return new Map(this.progressMap);
  }

  /**
   * Get recent indexing events (newest first)
   */
  getRecentEvents(limit = 50): IndexingEvent[] {
    return this.recentEvents.slice(-limit).reverse();
  }

  private emitEvent(event: IndexingEvent): void {
    this.progressMap.set(event.path, event);
    this.recentEvents.push(event);
    if (this.recentEvents.length > IndexingService.MAX_RECENT_EVENTS) {
      this.recentEvents = this.recentEvents.slice(-IndexingService.MAX_RECENT_EVENTS);
    }

    // Persist to database if available
    if (this.insertEventStmt) {
      try {
        this.insertEventStmt.run(
          event.path,
          event.type,
          event.parserType ?? null,
          event.summary ?? null,
          event.memoryId ?? null,
          event.error ?? null,
          event.timestamp
        );
      } catch (e) {
        // Silently ignore DB errors to not block indexing
        console.warn('[IndexingService] Failed to persist event:', e);
      }
    }

    this.emit('indexing', event);
  }

  async ingestFile(path: string, event: 'add' | 'change' = 'add'): Promise<boolean> {
    this.emitEvent({ type: 'start', path, timestamp: Date.now() });

    try {
      const content = await readFile(path, 'utf-8');

      for (const parser of this.parsers) {
        if (parser.canParse(path)) {
          const result = await parser.parse(path, content);
          if (result) {
            this.emitEvent({
              type: 'parsed',
              path,
              parserType: result.metadata.type,
              timestamp: Date.now(),
            });

            const existing = this.store.list({ source: path, limit: 1 });

            let finalSummary = result.summary;

            if (this.llmService?.isConfigured()) {
              try {
                const messages = this.extractMessagesForLLM(content);
                if (messages.length > 0) {
                  const abstract = await this.llmService.summarizeSession(
                    messages
                  );
                  finalSummary = this.formatEngramAbstract(
                    abstract,
                    result.metadata
                  );
                }
              } catch (llmError) {
                console.warn(
                  'LLM summarization failed, using basic summary:',
                  llmError
                );
              }
            }

            const vector = await this.embedder.embed(finalSummary);

            this.emitEvent({
              type: 'embedded',
              path,
              parserType: result.metadata.type,
              timestamp: Date.now(),
            });

            if (existing.length > 0) {
              if (event === 'change') {
                // Update existing memory with latest session content
                const existingMemory = existing[0]!;
                this.store.update(
                  existingMemory.id,
                  {
                    content: finalSummary,
                    tags: ['session-index', result.metadata.type],
                  },
                  vector
                );

                this.emitEvent({
                  type: 'stored',
                  path,
                  parserType: result.metadata.type,
                  memoryId: existingMemory.id,
                  summary: finalSummary.substring(0, 300),
                  timestamp: Date.now(),
                });
                return true;
              }
              // Already indexed on 'add' — skip duplicate
              this.emitEvent({
                type: 'skipped',
                path,
                parserType: result.metadata.type,
                timestamp: Date.now(),
              });
              return false;
            }

            const memory = this.store.create(
              {
                content: finalSummary,
                tags: ['session-index', result.metadata.type],
                source: path,
                confidence: this.llmService?.isConfigured() ? 0.9 : 0.7,
              },
              vector
            );

            this.emitEvent({
              type: 'stored',
              path,
              parserType: result.metadata.type,
              memoryId: memory.id,
              summary: finalSummary.substring(0, 300),
              timestamp: Date.now(),
            });

            return true;
          }
        }
      }
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : String(e);
      console.error(`Failed to ingest ${path}:`, e);
      this.emitEvent({
        type: 'error',
        path,
        error: errorMsg,
        timestamp: Date.now(),
      });
    }
    return false;
  }

  private extractMessagesForLLM(
    content: string
  ): SessionMessage[] {
    try {
      // Try JSONL format first (Claude Code sessions)
      const lines = content.split('\n').filter((l) => l.trim());
      if (lines.length > 1) {
        const entries: any[] = [];
        let isJsonl = false;
        for (const line of lines) {
          try {
            entries.push(JSON.parse(line));
            isJsonl = true;
          } catch {
            // not JSONL
          }
        }

        if (isJsonl && entries.length > 0) {
          return entries
            .filter(
              (e) =>
                (e.type === 'user' || e.type === 'assistant') &&
                e.message?.content
            )
            .slice(-20)
            .map((e) => {
              const role: 'user' | 'assistant' =
                e.type === 'user' ? 'user' : 'assistant';
              let text = '';
              if (typeof e.message.content === 'string') {
                text = e.message.content;
              } else if (Array.isArray(e.message.content)) {
                const textBlock = e.message.content.find(
                  (b: any) => b.type === 'text'
                );
                text = textBlock?.text || '';
              }
              return { role, content: text.slice(0, 2000) };
            })
            .filter((m) => m.content.length > 0);
        }
      }

      // Fall back to single JSON format (other session types)
      const session = JSON.parse(content);
      const messages = session.messages || session.conversation || [];

      if (!Array.isArray(messages)) return [];

      return messages
        .filter((m: any) => m.content && typeof m.content === 'string')
        .slice(-20)
        .map((m: any) => ({
          role: m.role === 'user' || m.type === 'human' ? 'user' : 'assistant',
          content:
            typeof m.content === 'string'
              ? m.content.slice(0, 2000)
              : String(m.content).slice(0, 2000),
        }));
    } catch {
      return [];
    }
  }

  private formatEngramAbstract(
    abstract: EngramAbstract,
    metadata: Record<string, any>
  ): string {
    const keyPointsList = abstract.keyPoints
      .map((p) => `- ${p}`)
      .join('\n');
    return `## Engram Abstract

**${abstract.title}**

${keyPointsList}

---

Session Type: ${metadata.type}
Messages: ${metadata.messageCount || 'unknown'}`;
  }
}

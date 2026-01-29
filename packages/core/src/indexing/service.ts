import { readFile } from 'node:fs/promises';
import type { MemoryStore } from '../memory/store.js';
import type { EmbeddingService } from '../embedding/service.js';
import { LLMService } from '../llm/service.js';
import type { SessionMessage, EngramAbstract } from '../llm/service.js';

export interface IndexingResult {
  summary: string;
  metadata: Record<string, any>;
  path: string;
}

export interface SessionParser {
  canParse(path: string): boolean;
  parse(path: string, content: string): Promise<IndexingResult | null>;
}

/**
 * Parser for Claude Code / Claude Desktop sessions
 * Parses JSON files from ~/.claude/sessions/
 */
export class ClaudeSessionParser implements SessionParser {
  canParse(path: string): boolean {
    return (
      path.endsWith('.json') &&
      (path.includes('.claude/sessions') || path.includes('claude-code'))
    );
  }

  async parse(path: string, content: string): Promise<IndexingResult | null> {
    try {
      const session = JSON.parse(content);

      const messageCount = Array.isArray(session.messages)
        ? session.messages.length
        : 0;
      const lastMessage =
        Array.isArray(session.messages) && messageCount > 0
          ? session.messages[messageCount - 1].content
          : 'No content';

      const firstUserMsg = Array.isArray(session.messages)
        ? session.messages.find((m: any) => m.role === 'user')?.content
        : '';

      const summary = `Claude Session (${messageCount} msgs)\nIntent: ${typeof firstUserMsg === 'string' ? firstUserMsg.substring(0, 200) : 'Unknown'}\nLast context: ${typeof lastMessage === 'string' ? lastMessage.substring(0, 100) : '...'}`;

      return {
        summary,
        metadata: {
          type: 'claude-session',
          messageCount,
          timestamp: session.updated_at || Date.now(),
        },
        path,
      };
    } catch (e) {
      return null;
    }
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

export class IndexingService {
  private parsers: SessionParser[] = [];
  private llmService: LLMService | null = null;

  constructor(
    private store: MemoryStore,
    private embedder: EmbeddingService,
    llmService?: LLMService
  ) {
    this.llmService = llmService ?? null;
    // Register all session parsers
    this.parsers.push(new ClaudeSessionParser());
    this.parsers.push(new OpenCodeSessionParser());
    this.parsers.push(new CursorSessionParser());
    this.parsers.push(new CodexSessionParser());
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

  async ingestFile(path: string): Promise<boolean> {
    try {
      const content = await readFile(path, 'utf-8');

      for (const parser of this.parsers) {
        if (parser.canParse(path)) {
          const result = await parser.parse(path, content);
          if (result) {
            const existing = this.store.list({ source: path, limit: 1 });
            if (existing.length > 0) {
              return false;
            }

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

            this.store.create(
              {
                content: finalSummary,
                tags: ['session-index', result.metadata.type],
                source: path,
                confidence: this.llmService?.isConfigured() ? 0.9 : 0.7,
              },
              vector
            );

            return true;
          }
        }
      }
    } catch (e) {
      console.error(`Failed to ingest ${path}:`, e);
    }
    return false;
  }

  private extractMessagesForLLM(
    content: string
  ): SessionMessage[] {
    try {
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

import type { MemoryScope } from '../types.js';

import type { IndexingResult, SessionParser } from './service.js';

/**
 * Frontmatter fields for skill/agent/command definitions
 */
interface SkillAgentFrontmatter {
  name?: string;
  description?: string;
  tools?: string;
  model?: string;
  color?: string;
  'argument-hint'?: string;
  'disable-model-invocation'?: boolean;
  'user-invocable'?: boolean;
  context?: string;
}

/**
 * Type of Claude Code definition file
 */
type DefinitionType = 'skill' | 'agent' | 'command';

/**
 * Parser for Claude Code skill, agent, and command definition files
 *
 * Parses Markdown files with YAML frontmatter from:
 *   Global plugins: ~/.claude/plugins/marketplaces/.../skills/{name}/SKILL.md
 *   Global plugins: ~/.claude/plugins/marketplaces/.../agents/{name}.md
 *   Global plugins: ~/.claude/plugins/marketplaces/.../commands/{name}.md
 *   Project-level: {project}/.claude/skills/{name}/SKILL.md
 *   Project-level: {project}/.claude/agents/{name}.md
 *   Project-level: {project}/.claude/commands/{name}.md
 */
export class SkillAgentParser implements SessionParser {
  canParse(path: string): boolean {
    if (!path.endsWith('.md')) return false;

    // Match skill files (SKILL.md in skills directory)
    if (path.includes('/skills/') && path.endsWith('SKILL.md')) return true;

    // Match agent files (*.md in agents directory)
    if (path.includes('/agents/') && !path.includes('/references/'))
      return true;

    // Match command files (*.md in commands directory)
    if (path.includes('/commands/') && !path.includes('/references/'))
      return true;

    return false;
  }

  parse(path: string, content: string): Promise<IndexingResult | null> {
    try {
      const { frontmatter, body } = this.parseMarkdownWithFrontmatter(content);

      // Need at least a description to be useful
      if (!frontmatter?.description) return Promise.resolve(null);

      const type = this.detectType(path);
      const name = frontmatter.name || this.extractNameFromPath(path, type);
      const plugin = this.extractPluginName(path);
      const { scope, projectPath } = this.detectScope(path);
      const summary = this.buildSummary(type, name, frontmatter, body, plugin);

      return Promise.resolve({
        summary,
        metadata: {
          type: `claude-${type}`,
          name,
          plugin,
          scope,
          projectPath,
          description: frontmatter.description,
          tools: frontmatter.tools
            ?.split(',')
            .map((t) => t.trim())
            .filter(Boolean),
          model: frontmatter.model,
          color: frontmatter.color,
          argumentHint: frontmatter['argument-hint'],
          disableModelInvocation: frontmatter['disable-model-invocation'],
          userInvocable: frontmatter['user-invocable'],
          context: frontmatter.context,
          timestamp: Date.now(),
        },
        path,
      });
    } catch {
      return Promise.resolve(null);
    }
  }

  /**
   * Parse Markdown content with YAML frontmatter
   */
  private parseMarkdownWithFrontmatter(content: string): {
    frontmatter: SkillAgentFrontmatter | null;
    body: string;
  } {
    const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
    if (!match) return { frontmatter: null, body: content };

    const yamlStr = match[1]!;
    const body = match[2]!;

    // Simple YAML parsing (handles basic key: value pairs)
    const frontmatter: SkillAgentFrontmatter = {};
    for (const line of yamlStr.split('\n')) {
      const colonIdx = line.indexOf(':');
      if (colonIdx > 0) {
        const key = line.slice(0, colonIdx).trim();
        let value: string | boolean = line.slice(colonIdx + 1).trim();

        // Handle boolean values
        if (value === 'true') value = true;
        else if (value === 'false') value = false;

        frontmatter[key as keyof SkillAgentFrontmatter] = value as never;
      }
    }

    return { frontmatter, body };
  }

  /**
   * Detect the type of definition based on path
   */
  private detectType(path: string): DefinitionType {
    if (path.includes('/skills/')) return 'skill';
    if (path.includes('/agents/')) return 'agent';
    if (path.includes('/commands/')) return 'command';
    return 'skill';
  }

  /**
   * Detect scope (global vs project) based on path
   */
  private detectScope(path: string): {
    scope: MemoryScope;
    projectPath?: string;
  } {
    // Global plugins: ~/.claude/plugins/
    if (path.includes('/.claude/plugins/')) {
      return { scope: 'global' };
    }

    // Project-level: /path/to/project/.claude/skills/ (or agents/, commands/)
    const match = path.match(/^(.+)\/\.claude\/(skills|agents|commands)\//);
    if (match) {
      return { scope: 'project', projectPath: match[1] };
    }

    return { scope: 'global' };
  }

  /**
   * Extract name from path when not specified in frontmatter
   */
  private extractNameFromPath(path: string, type: DefinitionType): string {
    const parts = path.split('/');

    if (type === 'skill') {
      // .../skills/skill-name/SKILL.md → skill-name
      const idx = parts.findIndex((p) => p === 'skills');
      const skillName = idx >= 0 ? parts[idx + 1] : undefined;
      return skillName ?? 'unknown';
    }

    // .../agents/code-reviewer.md → code-reviewer
    // .../commands/feature-dev.md → feature-dev
    const filename = parts[parts.length - 1] ?? 'unknown';
    return filename.replace('.md', '');
  }

  /**
   * Extract plugin name from path
   */
  private extractPluginName(path: string): string {
    // Match the plugin name that immediately precedes skills/agents/commands
    // e.g., .../plugins/test-plugin/skills/... → test-plugin
    // e.g., .../plugins/feature-dev/agents/... → feature-dev
    const match = path.match(/\/([^/]+)\/(skills|agents|commands)\//);
    return match?.[1] ?? 'custom';
  }

  /**
   * Build a searchable summary for the memory
   */
  private buildSummary(
    type: DefinitionType,
    name: string,
    frontmatter: SkillAgentFrontmatter,
    body: string,
    plugin: string
  ): string {
    const typeLabel = type.charAt(0).toUpperCase() + type.slice(1);
    const tools = frontmatter.tools || 'none';
    const model = frontmatter.model ? `\nModel: ${frontmatter.model}` : '';

    // Extract first 400 chars of body as preview
    const bodyPreview = body
      .trim()
      .slice(0, 400)
      .replace(/\n+/g, ' ')
      .replace(/#+\s*/g, '');

    return `Claude ${typeLabel}: ${name}
Plugin: ${plugin}
Description: ${frontmatter.description || 'No description'}
Tools: ${tools}${model}
Content: ${bodyPreview}`;
  }
}

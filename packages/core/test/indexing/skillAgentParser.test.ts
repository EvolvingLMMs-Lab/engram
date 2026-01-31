import { describe, it, expect } from 'vitest';
import { SkillAgentParser } from '../../src/indexing/skillAgentParser.js';

describe('SkillAgentParser', () => {
  const parser = new SkillAgentParser();

  describe('canParse', () => {
    it('should match skill files (SKILL.md in skills directory)', () => {
      expect(
        parser.canParse(
          '/home/user/.claude/plugins/marketplaces/official/plugins/feature-dev/skills/my-skill/SKILL.md'
        )
      ).toBe(true);
    });

    it('should match agent files in agents directory', () => {
      expect(
        parser.canParse(
          '/home/user/.claude/plugins/marketplaces/official/plugins/feature-dev/agents/code-reviewer.md'
        )
      ).toBe(true);
    });

    it('should match command files in commands directory', () => {
      expect(
        parser.canParse(
          '/home/user/.claude/plugins/marketplaces/official/plugins/feature-dev/commands/feature-dev.md'
        )
      ).toBe(true);
    });

    it('should match project-level skill files', () => {
      expect(
        parser.canParse('/path/to/project/.claude/skills/deploy/SKILL.md')
      ).toBe(true);
    });

    it('should not match other markdown files', () => {
      expect(parser.canParse('/path/to/README.md')).toBe(false);
      expect(parser.canParse('/path/to/docs/guide.md')).toBe(false);
    });

    it('should not match reference files', () => {
      expect(
        parser.canParse(
          '/home/user/.claude/plugins/skills/my-skill/references/patterns.md'
        )
      ).toBe(false);
    });

    it('should not match non-md files', () => {
      expect(parser.canParse('/path/to/skills/my-skill/SKILL.json')).toBe(
        false
      );
    });
  });

  describe('parse', () => {
    it('should parse skill with frontmatter', async () => {
      const content = `---
name: test-skill
description: A test skill for testing
tools: Read, Write, Bash
model: sonnet
---

# Test Skill

This is a test skill content.

## Usage

Use this skill for testing purposes.
`;

      const result = await parser.parse(
        '/home/user/.claude/plugins/marketplaces/official/plugins/test-plugin/skills/test-skill/SKILL.md',
        content
      );

      expect(result).not.toBeNull();
      expect(result?.metadata.type).toBe('claude-skill');
      expect(result?.metadata.name).toBe('test-skill');
      expect(result?.metadata.description).toBe('A test skill for testing');
      expect(result?.metadata.tools).toEqual(['Read', 'Write', 'Bash']);
      expect(result?.metadata.model).toBe('sonnet');
      expect(result?.metadata.scope).toBe('global');
      expect(result?.metadata.plugin).toBe('test-plugin');
    });

    it('should parse agent with frontmatter', async () => {
      const content = `---
name: code-reviewer
description: Reviews code for bugs and issues
tools: Glob, Grep, Read
model: sonnet
color: red
---

You are an expert code reviewer.

## Core Responsibilities

Review code for bugs and issues.
`;

      const result = await parser.parse(
        '/home/user/.claude/plugins/marketplaces/official/plugins/feature-dev/agents/code-reviewer.md',
        content
      );

      expect(result).not.toBeNull();
      expect(result?.metadata.type).toBe('claude-agent');
      expect(result?.metadata.name).toBe('code-reviewer');
      expect(result?.metadata.color).toBe('red');
      expect(result?.metadata.scope).toBe('global');
    });

    it('should parse command with frontmatter', async () => {
      const content = `---
description: Guided feature development workflow
argument-hint: Optional feature description
---

# Feature Development

This command helps with feature development.
`;

      const result = await parser.parse(
        '/home/user/.claude/plugins/marketplaces/official/plugins/feature-dev/commands/feature-dev.md',
        content
      );

      expect(result).not.toBeNull();
      expect(result?.metadata.type).toBe('claude-command');
      expect(result?.metadata.name).toBe('feature-dev');
      expect(result?.metadata.argumentHint).toBe('Optional feature description');
    });

    it('should detect project scope for project-level skills', async () => {
      const content = `---
name: deploy-prod
description: Deploy to production
tools: Bash
---

# Deploy to Production

Internal deployment script.
`;

      const result = await parser.parse(
        '/path/to/my-project/.claude/skills/deploy-prod/SKILL.md',
        content
      );

      expect(result).not.toBeNull();
      expect(result?.metadata.scope).toBe('project');
      expect(result?.metadata.projectPath).toBe('/path/to/my-project');
    });

    it('should return null for content without description', async () => {
      const content = `---
name: incomplete-skill
tools: Read
---

# Incomplete Skill

Missing description field.
`;

      const result = await parser.parse(
        '/path/skills/incomplete/SKILL.md',
        content
      );

      expect(result).toBeNull();
    });

    it('should return null for content without frontmatter', async () => {
      const content = `# Just a Markdown File

No frontmatter here.
`;

      const result = await parser.parse('/path/skills/no-fm/SKILL.md', content);

      expect(result).toBeNull();
    });

    it('should extract name from path when not in frontmatter', async () => {
      const content = `---
description: A skill without explicit name
tools: Read
---

# Skill Content
`;

      const result = await parser.parse(
        '/home/user/.claude/plugins/test/skills/extracted-name/SKILL.md',
        content
      );

      expect(result?.metadata.name).toBe('extracted-name');
    });

    it('should handle boolean values in frontmatter', async () => {
      const content = `---
name: user-only-skill
description: A skill that only users can invoke
tools: Bash
disable-model-invocation: true
---

# User Only Skill
`;

      const result = await parser.parse(
        '/path/.claude/plugins/test/skills/user-only/SKILL.md',
        content
      );

      expect(result?.metadata.disableModelInvocation).toBe(true);
    });

    it('should generate searchable summary', async () => {
      const content = `---
name: search-test
description: A skill for testing search
tools: Read, Grep
---

# Search Test Skill

Content that should appear in the summary.
`;

      const result = await parser.parse(
        '/home/user/.claude/plugins/test-plugin/skills/search-test/SKILL.md',
        content
      );

      expect(result?.summary).toContain('Claude Skill: search-test');
      expect(result?.summary).toContain('Plugin: test-plugin');
      expect(result?.summary).toContain('A skill for testing search');
      expect(result?.summary).toContain('Tools: Read, Grep');
    });
  });
});

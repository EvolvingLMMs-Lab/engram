// Common secret patterns for DLP
// These are used to sanitize input text before it is processed or stored

export interface SecretPattern {
  name: string;
  pattern: RegExp;
  redactLabel: string;
}

export const SECRET_PATTERNS: SecretPattern[] = [
  // OpenAI API Key
  {
    name: 'OpenAI API Key',
    pattern: /sk-[a-zA-Z0-9]{48}/g,
    redactLabel: 'OPENAI_KEY',
  },
  // OpenAI Project Key
  {
    name: 'OpenAI Project Key',
    pattern: /sk-proj-[a-zA-Z0-9\-_]{20,}/g,
    redactLabel: 'OPENAI_PROJECT_KEY',
  },
  // GitHub Fine-grained Token
  {
    name: 'GitHub Fine-grained Token',
    pattern: /github_pat_[a-zA-Z0-9_]{22,}/g,
    redactLabel: 'GITHUB_PAT',
  },
  // Database Connection String (Postgres/MySQL/Mongo)
  {
    name: 'Database URL',
    pattern:
      /(postgres|mysql|mongodb|redis):\/\/[a-zA-Z0-9_]+:[^@]+@[a-zA-Z0-9_\-\.]+/g,
    redactLabel: 'DB_CONNECTION_STRING',
  },
  // Anthropic API Key (Claude)
  {
    name: 'Anthropic API Key',
    pattern: /sk-ant-[a-zA-Z0-9\-_]{20,}/g, // Simplified pattern
    redactLabel: 'ANTHROPIC_KEY',
  },
  // Stripe Live Key
  {
    name: 'Stripe Live Key',
    pattern: /(?:sk|rk)_live_[0-9a-zA-Z]{24,}/g,
    redactLabel: 'STRIPE_LIVE_KEY',
  },
  // AWS Access Key ID
  {
    name: 'AWS Access Key ID',
    pattern:
      /(A3T[A-Z0-9]|AKIA|AGPA|AIDA|AROA|AIPA|ANPA|ANVA|ASIA)[A-Z0-9]{16}/g,
    redactLabel: 'AWS_ACCESS_KEY',
  },
  // GitHub Personal Access Token
  {
    name: 'GitHub Token',
    pattern: /ghp_[0-9a-zA-Z]{36}/g,
    redactLabel: 'GITHUB_TOKEN',
  },
  // Slack Token
  {
    name: 'Slack Token',
    pattern: /xox[baprs]-[0-9a-zA-Z]{10,48}/g,
    redactLabel: 'SLACK_TOKEN',
  },
  // Google API Key
  {
    name: 'Google API Key',
    pattern: /AIza[0-9A-Za-z\\-_]{35}/g,
    redactLabel: 'GOOGLE_API_KEY',
  },
  // RSA/Private Key
  {
    name: 'Private Key',
    pattern:
      /-----BEGIN [A-Z]+ PRIVATE KEY-----[\s\S]*?-----END [A-Z]+ PRIVATE KEY-----/g,
    redactLabel: 'PRIVATE_KEY_BLOCK',
  },
  // Generic Bearer Token (heuristic: "Bearer " followed by 32+ chars)
  {
    name: 'Generic Bearer Token',
    pattern: /Bearer [a-zA-Z0-9\-\._\~\+\/]{32,}/g,
    redactLabel: 'BEARER_TOKEN',
  },
];

export class DLPSanitizer {
  private patterns: SecretPattern[];

  constructor(customPatterns: SecretPattern[] = []) {
    this.patterns = [...SECRET_PATTERNS, ...customPatterns];
  }

  /**
   * Sanitizes text by replacing detected secrets with placeholders
   * @param text Input text potentially containing secrets
   * @returns Sanitized text and a list of detected secret types
   */
  public sanitize(text: string): { sanitized: string; detected: string[] } {
    if (!text) return { sanitized: text, detected: [] };

    let sanitized = text;
    const detected = new Set<string>();

    for (const p of this.patterns) {
      if (p.pattern.test(sanitized)) {
        detected.add(p.name);
        sanitized = sanitized.replace(p.pattern, `{{SECRET:${p.redactLabel}}}`);
      }
    }

    return {
      sanitized,
      detected: Array.from(detected),
    };
  }

  /**
   * Checks if text contains any secrets
   */
  public hasSecrets(text: string): boolean {
    for (const p of this.patterns) {
      if (p.pattern.test(text)) {
        return true;
      }
    }
    return false;
  }
}

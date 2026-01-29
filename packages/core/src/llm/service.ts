/**
 * LLM Abstraction Layer for Session Summarization
 * Supports OpenAI and Anthropic providers
 */

export interface LLMConfig {
  provider: 'openai' | 'anthropic';
  apiKey: string;
  model?: string; // defaults: gpt-4o-mini for openai, claude-3-haiku for anthropic
}

export interface SessionMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface EngramAbstract {
  title: string;
  keyPoints: string[];
  fullContent: string;
}

const SUMMARIZE_PROMPT = `You are summarizing a coding session for long-term memory storage.
Create a concise summary in the following JSON format:
{
  "title": "Brief descriptive title (5-10 words)",
  "keyPoints": [
    "Key semantic point 1",
    "Key semantic point 2", 
    "Key semantic point 3"
  ]
}

Focus on:
- What the user was trying to accomplish (intent)
- What was achieved (outcome)
- Key technical details (files, patterns, dependencies)

Be concise - this will be embedded for semantic search.`;

export class LLMService {
  private config: LLMConfig;

  constructor(config: LLMConfig) {
    this.config = config;
  }

  /**
   * Summarize session messages into Engram Abstract format
   */
  async summarizeSession(messages: SessionMessage[]): Promise<EngramAbstract> {
    if (!this.isConfigured()) {
      throw new Error('LLM service not configured - missing API key');
    }

    const formattedMessages = this.formatMessages(messages);

    if (this.config.provider === 'openai') {
      return this.summarizeWithOpenAI(formattedMessages);
    } else if (this.config.provider === 'anthropic') {
      return this.summarizeWithAnthropic(formattedMessages);
    } else {
      throw new Error(`Unknown LLM provider: ${this.config.provider}`);
    }
  }

  /**
   * Check if service is configured
   */
  isConfigured(): boolean {
    return !!this.config.apiKey;
  }

  private formatMessages(messages: SessionMessage[]): string {
    return messages
      .map((msg) => {
        const roleLabel = msg.role.toUpperCase();
        return `[${roleLabel}]\n${msg.content}`;
      })
      .join('\n\n');
  }

  private async summarizeWithOpenAI(formattedMessages: string): Promise<EngramAbstract> {
    const model = this.config.model || 'gpt-4o-mini';

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: SUMMARIZE_PROMPT },
          { role: 'user', content: formattedMessages },
        ],
        response_format: { type: 'json_object' },
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`OpenAI API error: ${response.status} - ${error}`);
    }

    const data = (await response.json()) as {
      choices: Array<{ message: { content: string } }>;
    };
    const content = data.choices[0]?.message?.content;

    if (!content) {
      throw new Error('No response from OpenAI API');
    }

    const parsed = JSON.parse(content) as {
      title: string;
      keyPoints: string[];
    };

    return {
      title: parsed.title,
      keyPoints: parsed.keyPoints,
      fullContent: formattedMessages,
    };
  }

  private async summarizeWithAnthropic(formattedMessages: string): Promise<EngramAbstract> {
    const model = this.config.model || 'claude-3-haiku-20240307';

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.config.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        max_tokens: 1024,
        messages: [
          {
            role: 'user',
            content: `${SUMMARIZE_PROMPT}\n\n${formattedMessages}`,
          },
        ],
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Anthropic API error: ${response.status} - ${error}`);
    }

    const data = (await response.json()) as {
      content: Array<{ type: string; text: string }>;
    };
    const textContent = data.content.find((c) => c.type === 'text')?.text;

    if (!textContent) {
      throw new Error('No response from Anthropic API');
    }

    // Extract JSON from response (may be wrapped in markdown code blocks)
    const jsonMatch = textContent.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('Could not parse JSON from Anthropic response');
    }

    const parsed = JSON.parse(jsonMatch[0]) as {
      title: string;
      keyPoints: string[];
    };

    return {
      title: parsed.title,
      keyPoints: parsed.keyPoints,
      fullContent: formattedMessages,
    };
  }
}

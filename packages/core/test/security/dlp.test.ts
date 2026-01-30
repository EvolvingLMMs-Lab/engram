import { describe, it, expect } from 'vitest';
import { DLPSanitizer } from '../../src/security/dlp';

describe('DLPSanitizer', () => {
  const sanitizer = new DLPSanitizer();

  it('should redact OpenAI keys', () => {
    const input =
      'My key is sk-1234567890abcdef1234567890abcdef1234567890abcdef.';
    const { sanitized, detected } = sanitizer.sanitize(input);

    expect(detected).toContain('OpenAI API Key');
    expect(sanitized).toBe('My key is {{SECRET:OPENAI_KEY}}.');
  });

  it('should redact Stripe live keys', () => {
    // Build key via concatenation to avoid triggering GitHub push protection
    const fakeKey = 'sk_live_' + 'FakeTestKey00000000000000';
    const input = `Payment failed with key ${fakeKey}.`;
    const { sanitized, detected } = sanitizer.sanitize(input);

    expect(detected).toContain('Stripe Live Key');
    expect(sanitized).toBe(
      'Payment failed with key {{SECRET:STRIPE_LIVE_KEY}}.'
    );
  });

  it('should redact AWS keys', () => {
    const input = 'Access key AKIAIOSFODNN7EXAMPLE used.';
    const { sanitized, detected } = sanitizer.sanitize(input);

    expect(detected).toContain('AWS Access Key ID');
    expect(sanitized).toBe('Access key {{SECRET:AWS_ACCESS_KEY}} used.');
  });

  it('should redact GitHub tokens', () => {
    const input = 'Token: ghp_1234567890abcdef1234567890abcdef36ch';
    const { sanitized, detected } = sanitizer.sanitize(input);

    expect(detected).toContain('GitHub Token');
    expect(sanitized).toBe('Token: {{SECRET:GITHUB_TOKEN}}');
  });

  it('should handle multiple secrets in one text', () => {
    const input =
      'AWS: AKIAIOSFODNN7EXAMPLE, OpenAI: sk-1234567890abcdef1234567890abcdef1234567890abcdef';
    const { sanitized, detected } = sanitizer.sanitize(input);

    expect(detected).toContain('AWS Access Key ID');
    expect(detected).toContain('OpenAI API Key');
    expect(sanitized).toContain('{{SECRET:AWS_ACCESS_KEY}}');
    expect(sanitized).toContain('{{SECRET:OPENAI_KEY}}');
  });

  it('should not false positive on normal text', () => {
    const input = 'This is a normal sentence with some random numbers 123456.';
    const { sanitized, detected } = sanitizer.sanitize(input);

    expect(detected).toHaveLength(0);
    expect(sanitized).toBe(input);
  });

  it('should handle empty input', () => {
    const { sanitized, detected } = sanitizer.sanitize('');
    expect(sanitized).toBe('');
    expect(detected).toHaveLength(0);
  });

  it('should redact Private Key blocks', () => {
    const input = `
-----BEGIN RSA PRIVATE KEY-----
MIIEpQIBAAKCAQEA3...
...
-----END RSA PRIVATE KEY-----
    `;
    const { sanitized, detected } = sanitizer.sanitize(input);
    expect(detected).toContain('Private Key');
    expect(sanitized).toContain('{{SECRET:PRIVATE_KEY_BLOCK}}');
  });
});

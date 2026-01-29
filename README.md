# Engram

> Biological memory fades. Digital memory leaks. We fixed both.

Every conversation with your AI starts from zero. You explain your preferences. Again. You paste your API keys. Again. You describe your project. Again.

The AI industry solved intelligence. It forgot about memory.

Engram is a **local-first, end-to-end encrypted memory layer** for Claude, Cursor, and any MCP-compatible AI. Think of it as Signal for AI memory - your data never leaves your device in plaintext, and we literally cannot read it even if we wanted to.

## Quick Start

```bash
npx engram-core init
```

That's it. Restart your AI client. It remembers you now.

## The Problem

AI assistants have a peculiar form of amnesia. They can write poetry, debug code, explain quantum mechanics - but they cannot remember that you prefer tabs over spaces.

This is not a technical limitation. It is a product decision. Cloud-based memory means:
- Your private thoughts live on someone else's server
- Your API keys travel across the internet
- Your context disappears when you switch apps

We rejected this tradeoff.

## The Architecture

```
Your Device                          Cloud
──────────────────────────────────────────────
Master Key ──────── X ──────────► NEVER sent
(lives in OS Keychain)

Plaintext ───► [AES-256] ───────► Ciphertext only
                                  (unreadable blob)
```

**Local-first**: SQLite + sqlite-vec on your machine. Works offline.

**Zero-knowledge sync**: When you enable cloud sync, the server only stores encrypted blobs. No plaintext. No metadata. No access.

**BIP39 recovery**: 24-word mnemonic phrase. Lose your device, keep your memories.

## How It Works

Engram exposes MCP tools that your AI assistant calls naturally:

```
User: Remember that I prefer functional TypeScript with Zod validation

Claude: [calls mcp_save_memory] Done.

--- 3 months later, new session ---

User: Write me a config parser

Claude: [calls mcp_read_memory] Based on your preferences, 
        here's a functional TypeScript implementation with Zod...
```

The AI doesn't need special prompts. It just remembers.

## MCP Tools

| Tool | What it does |
|------|--------------|
| `mcp_save_memory` | Store facts for future sessions |
| `mcp_read_memory` | Semantic search through memories |
| `mcp_get_secret` | Retrieve encrypted API keys |
| `mcp_set_secret` | Store new secrets |
| `mcp_find_similar_sessions` | Find past sessions to fork from |

## Security Stack

| Layer | Implementation |
|-------|----------------|
| Encryption | AES-256-GCM |
| Key derivation | PBKDF2-SHA256 (600k iterations) |
| Key exchange | RSA-4096 OAEP |
| Blind indexing | HMAC-SHA256 |
| Recovery | BIP39 mnemonic |

All crypto uses `node:crypto` (OpenSSL). No custom cryptography.

## Project Structure

```
engram/
├── packages/
│   ├── core/     # Crypto, embedding, sync engine
│   ├── server/   # MCP server
│   ├── cli/      # engram init, login, sync
│   └── web/      # Dashboard (optional)
└── supabase/     # E2EE sync backend
```

## Development

```bash
git clone https://github.com/EvolvingLMMs-Lab/engram.git
cd engram
pnpm install
pnpm -r build
pnpm test
```

## Why Not Just Use Claude Projects / ChatGPT Memory?

| | Engram | ChatGPT Memory | Claude Projects |
|---|---|---|---|
| Local-first | Yes | No | No |
| E2E Encrypted | Yes | No | No |
| Cross-app | Yes (MCP) | ChatGPT only | Claude only |
| Self-hostable | Yes | No | No |
| Open source | Yes | No | No |

## FAQ

**What if I lose my device?**

During `engram init`, you receive a 24-word recovery phrase. Write it down.

**Can you read my memories?**

No. Encryption keys are generated on your device and never transmitted.

**Does this work offline?**

Yes. Cloud sync is optional.

**What if Engram shuts down?**

Export anytime with `engram export`. It's just SQLite.

---

MIT License

Your AI should remember you. Not the other way around.

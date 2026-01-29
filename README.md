<p align="center">
  <img src="https://raw.githubusercontent.com/EvolvingLMMs-Lab/engram/main/packages/web/public/engram-logo.svg" width="100" alt="Engram">
</p>

<h1 align="center">Engram</h1>

<p align="center">
  <strong>Biological memory fades. Digital memory leaks. We fixed both.</strong>
</p>

<p align="center">
  <a href="#quick-start">Quick Start</a> -
  <a href="#the-problem">Why</a> -
  <a href="#architecture">Architecture</a> -
  <a href="#security">Security</a>
</p>

---

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

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              AI CLIENTS                                     │
│                                                                             │
│    ┌──────────────┐      ┌──────────────┐      ┌──────────────┐            │
│    │    Claude    │      │    Cursor    │      │   Claude     │            │
│    │   Desktop    │      │              │      │    Code      │            │
│    └──────┬───────┘      └──────┬───────┘      └──────┬───────┘            │
│           │                     │                     │                     │
│           └─────────────────────┼─────────────────────┘                     │
│                                 │                                           │
│                                 ▼                                           │
│                    ┌────────────────────────┐                               │
│                    │      MCP Protocol      │                               │
│                    └────────────┬───────────┘                               │
│                                 │                                           │
└─────────────────────────────────┼───────────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           ENGRAM SERVER                                     │
│                                                                             │
│    ┌──────────────┐      ┌──────────────┐      ┌──────────────┐            │
│    │   Memory     │      │   Secrets    │      │   Session    │            │
│    │   Store      │      │   Vault      │      │   Watcher    │            │
│    └──────────────┘      └──────────────┘      └──────────────┘            │
│                                                                             │
└─────────────────────────────────┬───────────────────────────────────────────┘
                                  │
                    ┌─────────────┴─────────────┐
                    │                           │
                    ▼                           ▼
          ┌─────────────────┐         ┌─────────────────┐
          │     SQLite      │         │    Supabase     │
          │   ~/.engram/    │         │    (E2EE)       │
          │                 │         │                 │
          │   LOCAL-FIRST   │         │  ZERO-KNOWLEDGE │
          └─────────────────┘         └─────────────────┘
```

## Security

### Zero-Knowledge Encryption

```
YOUR DEVICE                                         CLOUD
────────────────────────────────────────────────────────────────────

                    ┌─────────────┐
                    │ Master Key  │──────────── X ──────────► NEVER SENT
                    │ (Keychain)  │
                    └──────┬──────┘
                           │
                           ▼
┌──────────┐       ┌──────────────┐       ┌──────────────┐
│Plaintext │──────►│   AES-256    │──────►│  Ciphertext  │──────► Stored
│          │       │     GCM      │       │  (opaque)    │
└──────────┘       └──────────────┘       └──────────────┘

The server stores encrypted blobs. It cannot decrypt them. Ever.
```

### Multi-Device Sync

```
┌────────────────────┐                    ┌────────────────────┐
│      DEVICE A      │                    │      DEVICE B      │
│     (MacBook)      │                    │     (Desktop)      │
│                    │                    │                    │
│  ┌──────────────┐  │   RSA-4096 Key     │  ┌──────────────┐  │
│  │   Private    │  │    Exchange        │  │   Private    │  │
│  │     Key      │◄─┼────────────────────┼─►│     Key      │  │
│  └──────┬───────┘  │                    │  └──────┬───────┘  │
│         │          │                    │         │          │
│         ▼          │                    │         ▼          │
│  ┌──────────────┐  │                    │  ┌──────────────┐  │
│  │  Vault Key   │  │                    │  │  Vault Key   │  │
│  │  (Decrypted) │  │                    │  │  (Decrypted) │  │
│  └──────────────┘  │                    │  └──────────────┘  │
└─────────┬──────────┘                    └─────────┬──────────┘
          │                                         │
          └──────────────────┬──────────────────────┘
                             │
                             ▼
                   ┌───────────────────┐
                   │   CLOUD (E2EE)    │
                   │                   │
                   │  ┌─────────────┐  │
                   │  │  Encrypted  │  │
                   │  │    Blobs    │  │
                   │  └─────────────┘  │
                   │                   │
                   │  Server cannot    │
                   │  decrypt. Ever.   │
                   └───────────────────┘
```

### Encryption Stack

| Layer | Algorithm | Purpose |
|-------|-----------|---------|
| At Rest | AES-256-GCM | Memory & secrets encryption |
| Key Exchange | RSA-4096 OAEP | Multi-device vault key distribution |
| Key Derivation | PBKDF2-SHA256 | 600k iterations, brute-force resistant |
| Blind Indexing | HMAC-SHA256 | Search without exposing content |
| Recovery | BIP39 Mnemonic | 24-word phrase, recover anywhere |

All crypto uses `node:crypto` (OpenSSL). No custom cryptography.

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

### MCP Tools

| Tool | What it does |
|------|--------------|
| `mcp_save_memory` | Store facts for future sessions |
| `mcp_read_memory` | Semantic search through memories |
| `mcp_get_secret` | Retrieve encrypted API keys |
| `mcp_set_secret` | Store new secrets |
| `mcp_find_similar_sessions` | Find past sessions to fork from |

## Project Structure

```
engram/
├── packages/
│   ├── core/       # Crypto, embedding, sync engine
│   ├── server/     # MCP server implementation
│   ├── cli/        # engram init, login, sync
│   └── web/        # Dashboard (optional)
└── supabase/       # E2EE sync backend
```

## Development

```bash
git clone https://github.com/EvolvingLMMs-Lab/engram.git
cd engram
pnpm install
pnpm -r build
pnpm test
```

## Why Not Claude Projects / ChatGPT Memory?

```
                    Engram          ChatGPT Memory      Claude Projects
                    ──────          ──────────────      ───────────────
Local-first         ✓               ✗ Cloud only        ✗ Cloud only
E2E Encrypted       ✓               ✗                   ✗
Cross-app           ✓ Any MCP       ✗ ChatGPT only      ✗ Claude only
Self-hostable       ✓               ✗                   ✗
Open source         ✓               ✗                   ✗
```

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

<p align="center">
MIT License
</p>

<p align="center">
<strong>Your AI should remember you. Not the other way around.</strong>
</p>

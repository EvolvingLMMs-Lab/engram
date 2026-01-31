<p align="center">
  <img src="https://raw.githubusercontent.com/EvolvingLMMs-Lab/engram/main/assets/logo.svg" width="180" alt="Engram">
</p>

<p align="center">
  <strong>Biological memory fades. Digital memory leaks. We fixed both.</strong>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/engram-core"><img src="https://img.shields.io/npm/v/engram-core?color=blue" alt="npm"></a>
  <a href="https://github.com/EvolvingLMMs-Lab/engram/actions"><img src="https://img.shields.io/github/actions/workflow/status/EvolvingLMMs-Lab/engram/ci.yml?branch=main" alt="build"></a>
  <a href="https://github.com/EvolvingLMMs-Lab/engram/blob/main/LICENSE"><img src="https://img.shields.io/github/license/EvolvingLMMs-Lab/engram" alt="license"></a>
</p>

<p align="center">
  <a href="#quick-start">Quick Start</a> •
  <a href="#features">Features</a> •
  <a href="#the-problem">Why</a> •
  <a href="#architecture">Architecture</a> •
  <a href="#security">Security</a>
</p>

---

Every conversation with your AI starts from zero.

You explain your preferences. Again.

You paste your API keys. Again.

You describe your project. Again.

The AI industry solved intelligence. It forgot about memory.

Engram is a **local-first, end-to-end encrypted memory layer** for Claude, Cursor, and any MCP-compatible AI.

Think of it as Signal for AI memory - your data never leaves your device in plaintext.

<!-- TODO: Add demo GIF here -->
<!-- ![Demo](assets/demo.gif) -->
<!-- Show: engram init → Claude conversation using mcp_save_memory → later session using mcp_read_memory -->

## Quick Start

```bash
npx engram-core init
```

This single command:
1. Generates a master encryption key and 24-word recovery phrase
2. Auto-configures all detected AI clients:
   - **Claude Desktop** → `claude_desktop_config.json`
   - **Cursor** → `~/.cursor/mcp.json`
   - **Claude Code** → `~/.claude.json`
3. Creates the local database at `~/.engram/`

Restart your AI client. It remembers you now.

> Already initialized? Use `npx engram-core init --force` to reinitialize.

<!-- TODO: Add screenshot of terminal output after engram init -->
<!-- ![Init](assets/init-screenshot.png) -->

## Features

| | Feature | Description |
|:---:|---------|-------------|
| 🧠 | **Semantic Memory** | Vector search finds relevant context across sessions |
| 🔐 | **E2E Encryption** | AES-256-GCM encryption, keys never leave your device |
| 🔑 | **Secrets Vault** | Store API keys securely with encrypted sync |
| 📂 | **Session Indexing** | Automatically index and search past Claude Code sessions |
| 🛠️ | **Skill Discovery** | Index and search Claude Code skills/agents/commands |
| 🔄 | **Multi-Device Sync** | Encrypted sync across devices with Shamir recovery |
| 🏠 | **Local-First** | Works offline, your data stays on your disk |

## The Problem

AI assistants have a peculiar form of amnesia. They can write poetry, debug code, explain quantum mechanics - but they cannot remember that you prefer tabs over spaces.

This is not a technical limitation. It is a product decision. Cloud-based memory means:
- Your private thoughts live on someone else's server
- Your API keys travel across the internet
- Your context disappears when you switch apps

We rejected this tradeoff.

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

<!-- TODO: Add screenshot of actual Claude conversation -->
<!-- ![Memory Example](assets/memory-example.png) -->

### Session Indexing (Treasure Map)

Engram automatically indexes your Claude Code session history, enabling semantic search across past coding sessions:

```
User: How did we fix the websocket race condition last week?

Claude: [calls mcp_find_similar_sessions]
        Found a relevant session from 5 days ago where we fixed
        the race condition by implementing a mutex lock...
```

Build your session index manually:

```bash
npx engram-core build           # Index existing sessions
npx engram-core build --watch   # Watch for new sessions
```

<!-- TODO: Add screenshot showing session search results -->
<!-- ![Session Search](assets/session-search.png) -->

### Skill & Agent Discovery

Engram indexes your Claude Code skills and agents from `~/.claude/plugins/`, making them searchable:

```
User: What tools can help with code review?

Claude: [calls mcp_read_memory]
        Found: code-reviewer agent - Reviews code for bugs,
        suggests improvements, and checks for security issues.
        Tools: Glob, Grep, Read...
```

**Supported definitions:**
- Skills: `~/.claude/plugins/.../skills/*/SKILL.md`
- Agents: `~/.claude/plugins/.../agents/*.md`
- Commands: `~/.claude/plugins/.../commands/*.md`
- Project-level: `<project>/.claude/skills/`, `agents/`, `commands/`

> Project-level skills are scoped - only accessible when working in that project.

### MCP Tools

| Tool | What it does |
|------|--------------|
| `mcp_save_memory` | Store facts for future sessions |
| `mcp_read_memory` | Semantic search through memories |
| `mcp_delete_memory` | Delete a specific memory by ID |
| `mcp_list_memories` | List recent memories with optional filtering |
| `mcp_memory_status` | Get memory system status and embedding model state |
| `mcp_find_similar_sessions` | Find past sessions to fork from ("Treasure Map") |
| `mcp_get_secret` | Retrieve encrypted API keys |
| `mcp_set_secret` | Store new secrets in the encrypted vault |
| `mcp_authorize_device` | Authorize a new device for vault access |
| `mcp_list_devices` | List all authorized devices |
| `mcp_revoke_device` | Revoke a device's vault access |
| `mcp_create_recovery_kit` | Generate Shamir secret sharing recovery shares |

## Architecture

```
┌───────────────────────────────────────────────────────────────┐
│                          AI CLIENTS                           │
│                                                               │
│   ┌─────────────┐    ┌─────────────┐    ┌─────────────┐      │
│   │   Claude    │    │   Cursor    │    │   Claude    │      │
│   │   Desktop   │    │             │    │    Code     │      │
│   └──────┬──────┘    └──────┬──────┘    └──────┬──────┘      │
│          │                  │                  │              │
│          └──────────────────┼──────────────────┘              │
│                             │                                 │
│                             ▼                                 │
│                  ┌────────────────────┐                       │
│                  │    MCP Protocol    │                       │
│                  └─────────┬──────────┘                       │
│                            │                                  │
└────────────────────────────┼──────────────────────────────────┘
                             │
                             ▼
┌───────────────────────────────────────────────────────────────┐
│                        ENGRAM SERVER                          │
│                                                               │
│   ┌─────────────┐    ┌─────────────┐    ┌─────────────┐      │
│   │   Memory    │    │   Secrets   │    │   Session   │      │
│   │   Store     │    │   Vault     │    │   Indexer   │      │
│   └─────────────┘    └─────────────┘    └─────────────┘      │
│                                                               │
│   ┌─────────────┐    ┌─────────────┐    ┌─────────────┐      │
│   │  Embedding  │    │    DLP      │    │   Skill     │      │
│   │   Service   │    │  Sanitizer  │    │   Parser    │      │
│   └─────────────┘    └─────────────┘    └─────────────┘      │
│                                                               │
└────────────────────────────┬──────────────────────────────────┘
                             │
                             ▼
                  ┌─────────────────────┐
                  │       SQLite        │
                  │     ~/.engram/      │
                  │   + sqlite-vec      │
                  │                     │
                  │     LOCAL-FIRST     │
                  │   Your data stays   │
                  │     on YOUR disk    │
                  └─────────────────────┘
```

## Security

### Encryption Flow

```
┌───────────────┐       ┌───────────────┐       ┌───────────────┐
│  Master Key   │       │   AES-256     │       │   Encrypted   │
│  (Keychain)   │──────►│     GCM       │──────►│   SQLite DB   │
└───────────────┘       └───────────────┘       └───────────────┘
        │
        │ derived via PBKDF2-SHA256
        │ (600k iterations)
        ▼
┌───────────────┐
│  BIP39 Seed   │
│  (24 words)   │
│               │
│  Write this   │
│  down.        │
└───────────────┘
```

### Encryption Stack

| Layer | Algorithm | Purpose |
|-------|-----------|---------|
| At Rest | AES-256-GCM | Memory & secrets encryption |
| Key Derivation | PBKDF2-SHA256 | 600k iterations, brute-force resistant |
| Blind Indexing | HMAC-SHA256 | Search without exposing content |
| Recovery | BIP39 Mnemonic | 24-word phrase, recover anywhere |
| DLP | Pattern Matching | Auto-redact secrets before embedding |

All crypto uses `node:crypto` (OpenSSL). No custom cryptography.

### Data Privacy

| Data Type | Local Storage | Sync (if enabled) |
|-----------|---------------|-------------------|
| Memories | Plain text | E2E Encrypted |
| Secrets (API Keys) | AES-256-GCM | E2E Encrypted |
| Session Index | Plain text | E2E Encrypted |
| Skill/Agent Defs | Plain text (public) | Not synced |

## Project Structure

```
engram/
├── packages/
│   ├── core/       # Crypto, embedding, storage, indexing engine
│   ├── server/     # MCP server implementation
│   ├── cli/        # engram init, build, status, export
│   └── web/        # Dashboard UI (optional)
```

## CLI Commands

```bash
npx engram-core init              # Initialize Engram
npx engram-core init --force      # Reinitialize (reset keys)
npx engram-core build             # Build session index
npx engram-core build --watch     # Watch for new sessions
npx engram-core server            # Start MCP server manually
npx engram-core export            # Export memories to JSON
```

## Development

```bash
git clone https://github.com/EvolvingLMMs-Lab/engram.git
cd engram
pnpm install
pnpm build
pnpm test
```

## Why Not Claude Projects / ChatGPT Memory?

|                     | Engram | ChatGPT Memory | Claude Projects |
|---------------------|:------:|:--------------:|:---------------:|
| Local-first         | ✅ | ❌ Cloud only | ❌ Cloud only |
| E2E Encrypted       | ✅ | ❌ | ❌ |
| Cross-app           | ✅ Any MCP | ❌ ChatGPT only | ❌ Claude only |
| Session Indexing    | ✅ | ❌ | ❌ |
| Skill Discovery     | ✅ | ❌ | ❌ |
| Self-hostable       | ✅ | ❌ | ❌ |
| Open source         | ✅ | ❌ | ❌ |

## FAQ

**What if I lose my device?**
During `engram init`, you receive a 24-word recovery phrase. Write it down.

**Can you read my memories?**
No. Everything is encrypted locally. We have no server, no cloud, no access.

**Does this work offline?**
Yes. It's local-first. No internet required.

**What if Engram shuts down?**
Export anytime with `engram export`. It's just SQLite.

**Are my API keys safe?**
Yes. Secrets are encrypted with AES-256-GCM. Keys are stored in your system keychain (macOS Keychain, Windows Credential Vault, or Linux Secret Service).

**Does it index all my Claude Code sessions?**
Yes. Engram watches `~/.claude/projects/` and indexes sessions automatically when the server runs.

---

<p align="center">
MIT License
</p>

<p align="center">
<strong>Your AI should remember you. Not the other way around.</strong>
</p>

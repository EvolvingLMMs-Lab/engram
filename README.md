<p align="center">
  <img src="https://raw.githubusercontent.com/EvolvingLMMs-Lab/engram/main/packages/web/public/engram-logo.svg" width="120" alt="Engram Logo">
</p>

<h1 align="center">Engram</h1>

<p align="center">
  <strong>Your AI finally remembers you.</strong><br>
  Privacy-first memory layer for Claude, Cursor, and any MCP-compatible AI.
</p>

<p align="center">
  <a href="#quick-start">Quick Start</a> •
  <a href="#why-engram">Why Engram</a> •
  <a href="#features">Features</a> •
  <a href="#security">Security</a> •
  <a href="#usage">Usage</a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/encryption-AES--256--GCM-green" alt="Encryption">
  <img src="https://img.shields.io/badge/key--exchange-RSA--4096-blue" alt="Key Exchange">
  <img src="https://img.shields.io/badge/backup-Shamir--3--of--5-purple" alt="Backup">
  <img src="https://img.shields.io/badge/license-MIT-brightgreen" alt="License">
</p>

---

## The Problem

Every time you start a new conversation, your AI assistant forgets:
- Your coding preferences
- Your project context  
- Your API keys (forcing you to paste them again)
- Everything you've ever told it

You're stuck in an endless loop of re-explaining yourself.

## The Solution

**Engram** gives your AI a persistent, encrypted memory that follows you across sessions and devices.

```
"Signal for AI Memory"
- Your data stays on YOUR device
- End-to-end encrypted cloud sync
- Server never sees plaintext
- You own your memories forever
```

---

## Quick Start

```bash
# Install
npm install -g engram-core

# Initialize (generates encryption keys)
engram init

# That's it. Restart Claude Desktop.
```

After initialization, Claude can:
- **Remember** facts you tell it
- **Search** past conversations semantically  
- **Store** API keys securely (encrypted vault)
- **Find** relevant past sessions to fork from

---

## Why Engram?

### For Developers

| Pain Point | Engram Solution |
|------------|-----------------|
| Re-explaining project context every session | Persistent memory across all sessions |
| Pasting API keys repeatedly | Encrypted secrets vault with MCP access |
| Losing that perfect solution from last week | Semantic search across all past work |
| Starting from scratch on similar problems | Smart Forking - find and reuse past sessions |

### For Privacy-Conscious Users

| Concern | Engram Approach |
|---------|-----------------|
| "I don't trust cloud storage" | **Local-first** - SQLite on your device |
| "What if the server is hacked?" | **Zero-knowledge** - server only sees encrypted blobs |
| "How do I recover my data?" | **Shamir backup** - 3-of-5 recovery shares |
| "Can the company read my data?" | **Impossible** - keys never leave your device |

---

## Features

### 🧠 Persistent Memory
```
User: Remember that I prefer functional TypeScript with Zod validation

Claude: ✓ Saved to memory

[3 months later, new session]

User: Write me a config parser

Claude: Based on your preferences, here's a functional TypeScript 
        implementation with Zod validation...
```

### 🔐 Encrypted Secrets Vault
```bash
# Store secrets via CLI
engram secret set OPENAI_KEY sk-xxx

# Claude can access them securely
Claude: [Calls mcp_get_secret] 
        Using your OpenAI key to generate embeddings...
```

Secrets are:
- Encrypted with AES-256-GCM
- Stored in OS Keychain
- Never sent to any server
- Accessible only through MCP

### 🔍 Smart Forking (Treasure Map)
```
User: I need to fix a WebSocket race condition

Claude: [Calls mcp_find_similar_sessions]
        
        Found 2 relevant past sessions:
        
        1. "WebSocket reconnection handler" (87% match)
           Path: ~/.claude/sessions/abc123.json
           
        2. "Real-time sync race conditions" (73% match)  
           Path: ~/.claude/sessions/def456.json
        
        Want me to review these for applicable patterns?
```

### 🌐 Multi-Device Sync (E2EE)
```
┌──────────────┐                    ┌──────────────┐
│   MacBook    │                    │   Desktop    │
│              │                    │              │
│ ┌──────────┐ │   RSA-4096 Key     │ ┌──────────┐ │
│ │ Private  │ │   Distribution     │ │ Private  │ │
│ │   Key    │ │ ◄──────────────────│ │   Key    │ │
│ └──────────┘ │                    │ └──────────┘ │
│      │       │                    │      │       │
│      ▼       │                    │      ▼       │
│  [Decrypt]   │                    │  [Decrypt]   │
│      │       │                    │      │       │
│      ▼       │                    │      ▼       │
│  Vault Key   │                    │  Vault Key   │
└──────────────┘                    └──────────────┘
        │                                  │
        └──────────┬───────────────────────┘
                   │
                   ▼
         ┌─────────────────┐
         │  Cloud (E2EE)   │
         │                 │
         │  [Encrypted     │
         │   Blobs Only]   │
         │                 │
         │  Server cannot  │
         │  decrypt ever   │
         └─────────────────┘
```

---

## Security

### Encryption Stack

| Layer | Algorithm | Purpose |
|-------|-----------|---------|
| At Rest | AES-256-GCM | Memory & secrets encryption |
| Key Exchange | RSA-4096 OAEP | Multi-device vault key distribution |
| Key Derivation | PBKDF2-SHA256 | Master key from recovery phrase |
| Backup | Shamir Secret Sharing | 3-of-5 threshold recovery |

### Zero-Knowledge Architecture

```
YOUR DEVICE                         CLOUD
─────────────────────────────────────────────
                                    
Master Key ──────────X──────────►  NEVER sent
(OS Keychain)                       
                                    
Plaintext ───►[AES-256]───────►    Ciphertext
                                   (unreadable)
                                    
Vault Key ───►[RSA-4096]──────►    Encrypted Key
                                   (per device)
```

**The server literally cannot decrypt your data** - it only stores encrypted blobs.

### Audit Trail

- All crypto uses `node:crypto` (OpenSSL)
- Shamir implementation: `shamir-secret-sharing` (Cure53 audited)
- No custom cryptography
- [View the source](./packages/core/src/crypto/)

---

## Usage

### With Claude Desktop

Auto-configured during `engram init`. Just restart Claude Desktop.

**Available MCP Tools:**

| Tool | Description |
|------|-------------|
| `mcp_save_memory` | Store facts for future sessions |
| `mcp_read_memory` | Semantic search through memories |
| `mcp_get_secret` | Retrieve encrypted API keys |
| `mcp_set_secret` | Store new secrets |
| `mcp_find_similar_sessions` | Find past sessions to fork |

### With Cursor / Claude Code

Add to your project's `.mcp.json`:

```json
{
  "mcpServers": {
    "engram": {
      "command": "npx",
      "args": ["-y", "engram-core", "server"]
    }
  }
}
```

### CLI Commands

```bash
# Memory
engram search "authentication patterns"
engram find-fork "websocket fix"
engram export -o backup.json

# Secrets
engram secret set API_KEY value
engram secret list
engram secret get API_KEY

# Multi-device
engram login
engram link --show    # Generate link code
engram sync
```

### Web Dashboard

```bash
cd packages/web && pnpm dev
# Open http://localhost:4000
```

Features:
- **Neural Graph**: Force-directed memory visualization
- **Memory Stream**: Searchable timeline
- **Device Manager**: Manage authorized devices

---

## Architecture

```
┌────────────────────────────────────────────────────────────┐
│                     AI Assistants                          │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐        │
│  │   Claude    │  │   Cursor    │  │ Claude Code │        │
│  │   Desktop   │  │             │  │             │        │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘        │
│         └────────────────┼────────────────┘                │
│                          │ MCP Protocol                    │
│                          ▼                                 │
│  ┌──────────────────────────────────────────────────────┐ │
│  │              Engram MCP Server                        │ │
│  │  ┌────────────┐ ┌────────────┐ ┌────────────┐       │ │
│  │  │  Memory    │ │  Secrets   │ │  Session   │       │ │
│  │  │  Store     │ │  Vault     │ │  Watcher   │       │ │
│  │  └────────────┘ └────────────┘ └────────────┘       │ │
│  └──────────────────────────────────────────────────────┘ │
│                          │                                 │
│         ┌────────────────┴────────────────┐               │
│         ▼                                 ▼               │
│  ┌─────────────┐                  ┌─────────────┐        │
│  │   SQLite    │                  │  Supabase   │        │
│  │   Local     │                  │  (E2EE)     │        │
│  │ ~/.engram/  │                  │             │        │
│  └─────────────┘                  └─────────────┘        │
└────────────────────────────────────────────────────────────┘
```

---

## Comparison

| Feature | Engram | ChatGPT Memory | Claude Projects |
|---------|--------|----------------|-----------------|
| Local-first | ✅ | ❌ Cloud only | ❌ Cloud only |
| E2E Encrypted | ✅ | ❌ | ❌ |
| Open Source | ✅ | ❌ | ❌ |
| Cross-app | ✅ Any MCP app | ❌ ChatGPT only | ❌ Claude only |
| Secrets vault | ✅ | ❌ | ❌ |
| Self-hostable | ✅ | ❌ | ❌ |
| Multi-device | ✅ E2EE sync | ✅ Cloud sync | ✅ Cloud sync |

---

## Development

```bash
# Clone
git clone https://github.com/EvolvingLMMs-Lab/engram.git
cd engram

# Install
pnpm install

# Build all packages
pnpm -r build

# Run tests
pnpm test

# Development
pnpm dev
```

### Project Structure

```
engram/
├── packages/
│   ├── core/       # Crypto, memory, embedding, sync
│   ├── server/     # MCP server implementation
│   ├── cli/        # User-facing CLI
│   └── web/        # Next.js dashboard
└── supabase/       # E2EE sync backend
```

---

## FAQ

**Q: Is my data safe if I lose my device?**

A: Yes. During `engram init`, you receive a 24-word recovery phrase. You can also generate a Shamir 3-of-5 recovery kit for additional security.

**Q: Can you (the developers) read my memories?**

A: No. Encryption keys are generated on your device and never transmitted. We literally cannot decrypt your data.

**Q: Does this work offline?**

A: Yes. Engram is local-first. Cloud sync is optional and fully E2E encrypted.

**Q: What if Engram shuts down?**

A: Your data is yours. Export anytime with `engram export`. The SQLite database is standard and portable.

---

## Contributing

We welcome contributions! See [CONTRIBUTING.md](./CONTRIBUTING.md) for guidelines.

Areas we'd love help with:
- Additional MCP tool implementations
- Mobile app (React Native)
- Browser extension
- More embedding model options

---

## License

MIT License - see [LICENSE](./LICENSE)

---

<p align="center">
  <strong>Your AI should remember you. Not the other way around.</strong>
</p>

<p align="center">
  <a href="https://github.com/EvolvingLMMs-Lab/engram">GitHub</a> •
  <a href="https://github.com/EvolvingLMMs-Lab/engram/issues">Issues</a> •
  <a href="https://twitter.com/EvolvingLMMs">Twitter</a>
</p>

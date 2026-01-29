# Engram Usage Guide

Privacy-first AI memory layer - "Signal for AI Memory"

## Quick Start

### 1. Install & Initialize

```bash
# Install globally
npm install -g engram-core

# Or use directly with npx
npx engram-core init
```

This will:
- Generate a **recovery phrase** (save it securely!)
- Create `~/.engram/` directory with encrypted database
- Auto-configure Claude Desktop and Cursor

### 2. Verify Installation

```bash
engram status
```

Expected output:
```
Engram Status

Initialized: Yes
Memory count: 0
```

---

## Using with Claude Desktop

After `engram init`, your Claude Desktop config is auto-updated:

**Config location**: `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS)

```json
{
  "mcpServers": {
    "engram": {
      "command": "npx",
      "args": ["-y", "engram-core", "server"],
      "env": {
        "ENGRAM_PATH": "/Users/you/.engram/memory.db",
        "EMBEDDING_PROVIDER": "local:onnx"
      }
    }
  }
}
```

**Restart Claude Desktop** after init to load the MCP server.

### Available MCP Tools in Claude

| Tool | Description |
|------|-------------|
| `mcp_save_memory` | Store important facts for future conversations |
| `mcp_read_memory` | Search stored memories by semantic similarity |
| `mcp_list_memories` | Browse recent memories |
| `mcp_delete_memory` | Remove a specific memory |
| `mcp_memory_status` | Check memory system status |
| `mcp_find_similar_sessions` | Find relevant past coding sessions to fork |
| `mcp_get_secret` | Retrieve encrypted secrets (API keys) |
| `mcp_set_secret` | Store encrypted secrets with optional cloud sync |
| `mcp_authorize_device` | Authorize new device for vault access |
| `mcp_list_devices` | Show linked devices |
| `mcp_revoke_device` | Remove device access |
| `mcp_create_recovery_kit` | Generate Shamir recovery shares |

### Example Usage in Claude

```
User: Remember that my preferred coding style is functional with TypeScript

Claude: [Calls mcp_save_memory with content]
I've saved that preference to your memory.

---

User: What's my coding style preference?

Claude: [Calls mcp_read_memory with query "coding style"]
Based on my memory, you prefer functional programming with TypeScript.
```

---

## Using with Cursor / Claude Code

### Option 1: Global MCP Config (Cursor)

Create/edit `~/.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "engram": {
      "command": "npx",
      "args": ["-y", "engram-core", "server"],
      "env": {
        "ENGRAM_PATH": "/Users/you/.engram/memory.db"
      }
    }
  }
}
```

### Option 2: Project-specific (Claude Code)

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

---

## CLI Commands

### Memory Management

```bash
# Search memories
engram search "authentication patterns"

# Find sessions to fork (Smart Forking)
engram find-fork "websocket race condition fix"

# Export all memories
engram export -o backup.json

# Import memories
engram import backup.json --skip-duplicates
```

### Secrets Management

```bash
# Store a secret
engram secret set OPENAI_API_KEY sk-xxx -d "OpenAI API key"

# List secrets
engram secret list

# Get a secret value
engram secret get OPENAI_API_KEY

# Delete a secret
engram secret delete OPENAI_API_KEY
```

### Cloud Sync (Optional)

```bash
# Login to cloud sync
engram login

# Manual sync
engram sync

# Link another device
engram link --show        # Shows code on this device
engram link --code ABC123 # Enter code from another device
```

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Your AI Assistants                       │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐       │
│  │ Claude       │  │ Cursor       │  │ Claude Code  │       │
│  │ Desktop      │  │              │  │              │       │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘       │
│         │                 │                 │                │
│         └────────────────┬┴─────────────────┘                │
│                          │ MCP Protocol                      │
│                          ▼                                   │
│  ┌───────────────────────────────────────────────────────┐  │
│  │                 Engram MCP Server                      │  │
│  │  - Memory storage/retrieval                           │  │
│  │  - Semantic search (sqlite-vec)                       │  │
│  │  - E2EE secrets vault                                 │  │
│  │  - Session watching & indexing                        │  │
│  └───────────────────────────────────────────────────────┘  │
│                          │                                   │
│         ┌────────────────┴────────────────┐                 │
│         ▼                                 ▼                 │
│  ┌──────────────┐                 ┌──────────────┐         │
│  │ Local SQLite │                 │ Supabase     │         │
│  │ ~/.engram/   │                 │ (E2EE Sync)  │         │
│  │ memory.db    │                 │              │         │
│  └──────────────┘                 └──────────────┘         │
└─────────────────────────────────────────────────────────────┘
```

---

## Web Dashboard

```bash
cd packages/web
pnpm dev
```

Open http://localhost:4000 to view:
- **Neural Graph**: Force-directed visualization of memories
- **Memory Stream**: Chronological list with search/filter
- **Device Manager**: Manage authorized devices

---

## Data Locations

| Item | Path |
|------|------|
| Memory database | `~/.engram/memory.db` |
| Auth tokens | `~/.engram/auth.json` |
| Master key | OS Keychain (via keytar) |
| Claude config | `~/Library/Application Support/Claude/claude_desktop_config.json` |
| Cursor config | `~/.cursor/mcp.json` |

---

## Security Model

1. **Local-first**: All memories stored locally in SQLite
2. **E2EE**: AES-256-GCM encryption for secrets, RSA-4096 for device key distribution
3. **Zero-knowledge sync**: Server never sees plaintext
4. **Recovery**: 12-word BIP39 phrase or Shamir 3-of-5 shares

---

## Troubleshooting

### "Engram not initialized"

```bash
engram init
```

### MCP server not showing in Claude

1. Verify config exists: `cat ~/Library/Application\ Support/Claude/claude_desktop_config.json`
2. Restart Claude Desktop
3. Check MCP server logs in Claude's developer console

### Memory not persisting

Check database exists:
```bash
ls -la ~/.engram/memory.db
```

### Secrets vault disabled

Master key couldn't be retrieved from keychain. Re-run:
```bash
engram init --force
```

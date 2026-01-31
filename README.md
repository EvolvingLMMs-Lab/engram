<p align="center">
  <img src="https://raw.githubusercontent.com/EvolvingLMMs-Lab/engram/main/assets/logo.svg?v=4" width="420" alt="Engram">
</p>

<p align="center">
  <strong>Biological memory fades. Digital memory leaks. We fixed both.</strong>
</p>

<p align="center">
  <code>MEMORY</code> for AI · <code>PRIVACY</code> by design
</p>

<p align="center">
  <a href="https://engram.lmms-lab.com"><img src="https://img.shields.io/badge/website-engram.lmms--lab.com-black" alt="website"></a>
  <a href="https://github.com/EvolvingLMMs-Lab/engram/stargazers"><img src="https://img.shields.io/github/stars/EvolvingLMMs-Lab/engram" alt="stars"></a>
  <a href="https://github.com/EvolvingLMMs-Lab/engram/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-Polyform%20NC-blue" alt="license"></a>
</p>

<p align="center">
  <a href="https://engram.lmms-lab.com">Website</a> •
  <a href="#quick-start">Quick Start</a> •
  <a href="#features">Features</a> •
  <a href="#security">Security</a>
</p>

---

## What is Engram?

An **end-to-end encrypted** memory layer for AI assistants.

**YOU HOLD THE KEYS** - AES-256-GCM encryption. Keys never leave your device. 24-word recovery phrase, like a crypto wallet.

**ZERO-KNOWLEDGE SYNC** - Sync across devices if you want. Server only sees ciphertext. We can't read your data. Ever.

Works with Claude Desktop, Claude Code, Cursor, and any MCP-compatible client.

## Quick Start

```bash
npx engram-core init
```

Restart your AI client. It remembers you now.

<p align="center">
  <img src="assets/demo.gif" alt="Engram Demo" width="100%">
</p>

## Features

| Feature | Description |
|---------|-------------|
| **Semantic Memory** | Vector similarity search across all your past sessions |
| **E2E Encryption** | AES-256-GCM. Keys never leave your device. |
| **Secrets Vault** | Encrypted storage for API keys and credentials |
| **Session Search** | Find and resume past coding sessions instantly |
| **Zero-Knowledge Sync** | Sync across devices. Server sees only ciphertext. |
| **Offline Mode** | Works without internet. Your data, your control. |

## Security

All encryption uses `node:crypto` (OpenSSL). No custom cryptography.

| Layer | Algorithm |
|-------|-----------|
| At Rest | AES-256-GCM |
| Key Derivation | PBKDF2-SHA256 (600k iterations) |
| Search Index | HMAC-SHA256 (blind indexing) |
| Recovery | BIP39 Mnemonic (24 words) |

## Why Not Cloud Memory?

|                     | Engram | Cloud Memory |
|---------------------|:------:|:------------:|
| Who holds the keys? | You | They do |
| Can they read it?   | No | Yes |
| Cross-app           | Any MCP client | Locked to one app |
| Open source         | Yes | No |

## Philosophy

The AI industry solved intelligence. It forgot about sovereignty.

- Memory is infrastructure, not a feature
- Encryption is a right, not a premium tier
- If you can't export it, you don't own it

---

<p align="center">
<strong>Your AI should remember you. Not the other way around.</strong>
</p>

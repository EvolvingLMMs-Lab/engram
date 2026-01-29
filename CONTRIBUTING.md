# Contributing to Engram

Thank you for your interest in contributing to Engram! This document provides guidelines for contributing.

## Development Setup

```bash
# Clone the repository
git clone https://github.com/EvolvingLMMs-Lab/engram.git
cd engram

# Install dependencies
pnpm install

# Build all packages
pnpm -r build

# Run tests
pnpm test
```

## Project Structure

```
engram/
├── packages/
│   ├── core/       # Core library (crypto, memory, embedding, sync)
│   ├── server/     # MCP server implementation
│   ├── cli/        # Command-line interface
│   └── web/        # Next.js dashboard
└── supabase/       # Database migrations
```

## Making Changes

### 1. Fork and Branch

```bash
git checkout -b feature/your-feature-name
```

### 2. Code Style

- Use TypeScript for all new code
- Follow existing patterns in the codebase
- Run `pnpm lint` before committing

### 3. Testing

- Add tests for new functionality
- Ensure all tests pass: `pnpm test`

### 4. Commit Messages

Use conventional commits:

```
feat: add new MCP tool for memory export
fix: resolve race condition in sync engine
docs: update README with new examples
```

### 5. Pull Request

- Describe the change and motivation
- Link any related issues
- Ensure CI passes

## Areas for Contribution

### High Priority

- [ ] Additional MCP tools
- [ ] More embedding model options (OpenAI, Cohere)
- [ ] Browser extension for web-based AI assistants
- [ ] Mobile companion app

### Documentation

- Improve inline code documentation
- Add more usage examples
- Translate documentation

### Testing

- Increase test coverage
- Add integration tests
- Performance benchmarks

## Security

If you discover a security vulnerability, please email security@evolvinglmms.ai instead of opening a public issue.

## Code of Conduct

Be respectful and constructive. We're all here to build something useful together.

## Questions?

Open an issue or start a discussion on GitHub.

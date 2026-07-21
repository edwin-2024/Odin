# Odin Project Context

## Overview

Odin is a monorepo-based project that provides an AI agent framework with both terminal (TUI) and web interfaces. The project uses **Bun** as the package manager, **Turbo** for build orchestration across workspaces, and **TypeScript 5.x** throughout.

---

## Project Structure

### Root Level
- `package.json` - Monorepo configuration with Turborepo workspace setup
- `turbo.json` - Task definitions and dependencies between packages/apps
- `.env` - Environment variables (not committed)
- `bun.lock` - Bun lockfile for dependency management
- `node_modules/` - Dependencies cache

### Workspaces Configuration
```json
"workspaces": [
  "apps/*",
  "packages/*"
]
```

---

## Apps Layer (`apps/`)

### TUI Application
**Purpose**: Terminal User Interface for the AI agent  
**Package Name**: `tui`  
**Key Dependencies**:
- `@odin/runtime` - Runtime utilities and terminal management
- `@odin/tools` - Tool execution framework
- `@odin/agent` - Agent orchestration logic
- `@odin/ai` - AI message building and streaming

### Web Application
**Purpose**: Web-based interface for the AI agent  
*(Note: Directory exists but package.json not yet configured)*

---

## Packages Layer (`packages/`)

### Core Infrastructure Packages

#### 1. Agent Package (`@odin/agent`)
- **Purpose**: Main orchestrator of AI tasks and workflows
- **Key Files**: `agent-runner.ts`, `agent-executor.ts`, `conversation.ts`
- **Exports**: 
  - `AgentRunner` class for streaming event processing
  - Conversation management utilities

#### 2. AI Package (`@odin/ai`)
- **Purpose**: AI message building and provider integration
- **Key Files**: `chat-model.ts`, `event-stream.ts`, `message-builder.ts`
- **Providers**: Ollama-based LLM support via `ollama-provider.ts`
- **Exports**: 
  - `MessageBuilder` for constructing messages from streaming events
  - Event stream handling utilities

#### 3. Runtime Package (`@odin/runtime`)
- **Purpose**: System-level operations and permissions management
- **Key Modules**:
  - `cli-permission-manager.ts` - CLI permission controls
  - `permission-manager.ts` - Permission validation logic
  - `git/` - Git repository utilities
  - `terminal/` - Terminal interaction handling
  - `workspace/` - Workspace management

#### 4. Shared Package (`@odin/shared`)
- **Purpose**: Common types and utilities across the project
- **Key Types**: 
  - `AIEvent` interface for AI event streaming
  - `AssistantMessage` type definition
  - Message builder interfaces

### Configuration Packages

#### TypeScript Config (`@odin/typescript-config`)
**Purpose**: Shared TypeScript configuration  
*(Note: tsconfig.json exists but contents not yet reviewed)*

#### ESLint Config (`eslint-config`)
- **Purpose**: Shared ESLint rules and configurations  
*(Note: package structure confirmed, config files pending review)*

### Tools Package (`@odin/tools`)
- **Purpose**: Utility tools for the agent framework  
*(Note: Directory exists but contents not yet reviewed)*

---

## Technical Stack & Dependencies

### Root Level Dependencies
```json
{
  "fast-glob": "^3.3.3",      // File system globbing utilities
  "ollama": "^0.6.3"          // Ollama LLM client integration
}
```

### Development Tools
- **Package Manager**: Bun v1.3.3 (specified in `devEngines`)
- **Build Tool**: Turborepo v2.10.4
- **TypeScript**: 5.9.2
- **Linting**: Prettier + custom ESLint config

### Common Peer Dependencies
All packages require:
```json
{
  "typescript": "^5"
}
```

---

## Build & Development Commands

| Command | Description |
|---------|-------------|
| `bun run start` | Start TUI application (`apps/tui/index.ts`) |
| `bun run dev`   | Run all apps in development mode (Turbo) |
| `bun run build` | Build all packages/apps (Turbo with caching) |
| `bun run lint`  | Lint all codebases across workspaces |
| `bun run format` | Format TypeScript/TSX files with Prettier |
| `bun run check-types` | Type checking across all packages |

### Turbo Task Configuration
- **build**: Depends on parent builds, outputs `.next/**` (web app) and cache-aware
- **lint/check-types/dev**: Cache management configured appropriately

---

## Key Architectural Patterns

1. **Event Streaming Architecture**  
   The agent uses streaming events (`AIEvent`) to process AI responses in real-time through `AgentRunner`.

2. **Message Builder Pattern**  
   Messages are constructed incrementally from event streams using `MessageBuilder` before being finalized.

3. **Workspace-Aware Runtime**  
   The runtime package manages CLI permissions, workspace operations, and terminal interactions with Bun-specific APIs (`@types/bun`).

4. **Monorepo Organization**  
   Clear separation between:
   - Consumer apps (TUI, Web) that depend on packages
   - Shared libraries providing reusable functionality
   - Configuration packages for consistency

---

## Environment & Configuration Notes

- `.env` file exists but contents not reviewed (likely contains API keys, Ollama endpoints, etc.)
- `tsconfig.json` files exist in each package with TypeScript 5 configuration
- Web app's `package.json` needs to be configured similarly to TUI
- ESLint config and tools packages need content review

---

## Future Considerations

1. **Web App Setup**: Configure `apps/web/package.json` with proper dependencies on Odin packages
2. **TypeScript Configs**: Review and standardize tsconfig across all packages
3. **ESLint Rules**: Define shared linting rules in the eslint-config package
4. **Tools Package**: Implement utility functions for common operations (file ops, shell commands)

---

## Notes for Development

- All TypeScript files use ES modules (`"type": "module"` at root level)
- Workspaces are configured to resolve packages as `workspace:*` references
- Bun is the primary runtime and package manager throughout
- Ollama integration suggests local LLM deployment capability
- Permission management indicates security-conscious design for CLI operations

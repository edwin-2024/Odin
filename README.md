# Odin: Agentic Coding Assistant

Odin is a provider-agnostic, goal-driven AI software engineering agent featuring a real-time, responsive Terminal User Interface (TUI). Designed as a monorepo (Turborepo), Odin orchestrates complex coding tasks by decoupling the LLM planning phase from tool execution, mitigating context overflow and "runaway tool loops" common in standard ReAct agents.

## 🚀 Key Features

### 1. Goal-Driven Execution Architecture
- **Decoupled Planner & Executor**: Odin uses an explicit `LLMPlanner` to generate structured JSON execution plans. The `AgentExecutor` then runs each task in isolation by injecting explicit sub-task instructions ("CRITICAL INSTRUCTION: You MUST ONLY fulfill this specific task...").
- **Fast-Path Heuristics**: Custom request-classification algorithms (`isSimpleQuery`) bypass expensive LLM planning phases for conversational inputs, drastically reducing latency and improving UX.
- **Resilient Parsing Pipeline**: Robust fallback mechanisms safely extract execution plans from malformed LLM JSON outputs and markdown blocks.

### 2. High-Performance Terminal User Interface (TUI)
- **Responsive Animations**: A fluid, non-blocking TUI inspired by Claude Code, featuring animated spinners, dynamic state dashboards, and inline streaming text using `log-update`, `chalk`, and `cli-spinners`.
- **Event-Driven State Machine**: A Redux-style reducer pattern (`RuntimeState`) synchronizes concurrent background tool execution, telemetry tracking, and CLI rendering safely without race conditions.
- **Buffered Rendering Queue**: Prevents the animated spinner and live-streaming AI text from overwriting each other in the terminal.

### 3. Pluggable AI Integration & Security
- **Provider-Agnostic LLM Pipeline**: Features an extensible provider architecture built to easily swap between local LLMs (like Ollama) and cloud models, giving developers flexibility over privacy and cost.
- **CLI Permission Manager**: A path-based security sandbox intercepts the AI's tool calls, enforcing user-approval workflows before executing potentially destructive file system or bash operations.

## 🛠️ Tech Stack

- **Runtime**: [Bun](https://bun.sh/)
- **Language**: TypeScript
- **Architecture**: [Turborepo](https://turbo.build/) (Monorepo)
- **AI Provider**: Pluggable architecture (currently using [Ollama](https://ollama.com/) for local models, ready for cloud integration)
- **CLI Utilities**: `chalk`, `cli-spinners`, `log-update`, `fast-glob`

## 📦 Workspace Structure

```text
odin/
├── apps/
│   └── tui/              # The CLI application (entry point, renderer, state machine)
├── packages/
│   ├── agent/            # Core agent orchestration (Planner, Executor, Task Manager)
│   ├── ai/               # AI provider abstractions (Ollama, Event Streams)
│   ├── runtime/          # File system, Terminal, Git, and Permission Manager
│   ├── shared/           # Shared types, messages, and mutexes
│   └── tools/            # Tool Registry and Implementations (Bash, Read/Write File, etc)
```

## 🚀 Getting Started

1. **Install Dependencies**
   ```bash
   bun install
   ```

2. **Configure Environment**
   Create a `.env` file at the root and specify your Ollama model:
   ```env
   ODIN_MODEL=qwen3:4b-instruct-2507-q4_K_M
   ```

3. **Run Odin**
   ```bash
   bun run start
   ```

## 🤝 Architecture Notes for Interviewers

The hardest technical challenge in building Odin was the **Event Loop & TUI Rendering**. Because AI text streams in chunks asynchronously while tools are running in the background, naive `console.log` approaches resulted in corrupted terminal states. 

This was solved by:
1. Emitting strongly-typed events (`AgentEvent`) for every model chunk and tool phase.
2. Passing those events through a synchronous `reducer` to build an immutable `RuntimeState`.
3. Buffering stdout projections (`hasBufferedRenders`) during user prompts to ensure the terminal cursor and input line remained clean while the background spinner ticked.

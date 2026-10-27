# Odin: Campus Interview Preparation Guide (Infosys & Full-Stack Roles)
**Candidate:** Edwin G · **Role:** Full-Stack / Software Engineer · **Project:** Odin (AI-Powered CLI Coding Agent)

---

## Table of Contents
1. [Resume Claims Verification](#1-resume-claims-verification)
2. [A. Project in 60 Seconds](#a-project-in-60-seconds)
3. [B. Architecture Map & End-to-End Execution Flow](#b-architecture-map--end-to-end-execution-flow)
4. [C. Feature Deep Dives (10 Core Modules)](#c-feature-deep-dives-10-core-modules)
   - [1. LLM Planner (`LLMPlanner`)](#1-llm-planner-llmplanner)
   - [2. Agent Executor & Loop Guard (`AgentExecutor`)](#2-agent-executor--loop-guard-agentexecutor)
   - [3. Tool Calling & Parallel vs Serial Execution Engine (`ToolExecutor`)](#3-tool-calling--parallel-vs-serial-execution-engine-toolexecutor)
   - [4. Fast-Path Heuristic (`isSimpleQuery`)](#4-fast-path-heuristic-issimplequery)
   - [5. Pluggable AI Provider Layer (`OllamaProvider` & `OpenAIProvider`)](#5-pluggable-ai-provider-layer-ollamaprovider--openaiprovider)
   - [6. Resilient JSON Parsing & Markdown Stripping Pipeline](#6-resilient-json-parsing--markdown-stripping-pipeline)
   - [7. Event-Driven State Machine & Reducer (`RuntimeState`)](#7-event-driven-state-machine--reducer-runtimestate)
   - [8. Terminal UI (TUI) & Buffered Rendering Queue (`Renderer`)](#8-terminal-ui-tui--buffered-rendering-queue-renderer)
   - [9. CLI Permission Manager & Interactive Myers Diff Formatter](#9-cli-permission-manager--interactive-myers-diff-formatter)
   - [10. Telemetry Collector & Execution Profiling (`TelemetryCollector`)](#10-telemetry-collector--execution-profiling-telemetrycollector)
5. [D. Interview Q&A (25 High-Probability Questions)](#d-interview-qa-25-high-probability-questions)
6. [E. Tricky Follow-Up Questions (Deep Edge Cases)](#e-tricky-follow-up-questions-deep-edge-cases)
7. [F. Code I Must Be Able to Write or Explain Live](#f-code-i-must-be-able-to-write-or-explain-live)
8. [G. Core Concepts Glossary](#g-core-concepts-glossary)
9. [H. Honest Limitations & Future Improvements](#h-honest-limitations--future-improvements)
10. [I. Rapid-Fire Revision Round (20 Quick Q&As)](#i-rapid-fire-revision-round-20-quick-qas)

---

## 1. Resume Claims Verification

Below is an honest, line-by-line verification of the three resume bullets against the actual code in the repository.

### Resume Bullet 1
> *"Built a goal-driven AI coding agent using a decoupled Planner-Executor architecture to handle multi-step engineering tasks while preventing LLM context overflow and tool loops"*

- **Verdict: SUPPORTED**
- **Evidence in Code:**
  1. **Decoupled Planner-Executor:** Implemented as two distinct classes. `LLMPlanner` ([packages/agent/planning/llm-planner.ts](file:///d:/projects/odin/packages/agent/planning/llm-planner.ts#L9-L139)) generates an `ExecutionPlan` containing discrete sub-tasks with concrete objectives. `AgentExecutor` ([packages/agent/agent-executor.ts](file:///d:/projects/odin/packages/agent/agent-executor.ts#L13-L117)) executes each task sequentially in isolation, injecting an explicit boundary instruction (`CRITICAL INSTRUCTION: You MUST ONLY fulfill this specific task. Do NOT attempt subsequent steps...`).
  2. **Preventing LLM Context Overflow:** Handled in [packages/agent/compacting-context-manager.ts](file:///d:/projects/odin/packages/agent/compacting-context-manager.ts#L52-L380). It enforces three critical invariants:
     - *Invariant 1:* The System Prompt at index 0 is always preserved.
     - *Invariant 2:* Tool calls and tool result messages are kept atomically together so no tool message is ever orphaned.
     - *Invariant 3:* The last 4 conversational turns are kept completely verbatim.
     When token threshold (75% of 24k budget = 18k tokens) is exceeded, Stage 1 condenses large intermediate tool outputs (>300 tokens or >16 lines) to head and tail snippets. Stage 2 summarizes older conversational turns into a single structured continuity block. In addition, [packages/tools/git-diff.ts](file:///d:/projects/odin/packages/tools/git-diff.ts#L59-L79) truncates git diffs exceeding 50KB or 1,000 lines.
  3. **Preventing Tool Loops:** In `AgentExecutor.execute` ([packages/agent/agent-executor.ts](file:///d:/projects/odin/packages/agent/agent-executor.ts#L70-L78)), a `stepCount` loop guard aborts execution if an individual sub-task exceeds `maxStepsPerTask` (default 25 steps):
     ```ts
     stepCount++;
     if (stepCount > this.maxStepsPerTask) {
       const limitError = new Error(`Task "${task.title}" exceeded maximum allowed tool steps (25). Aborting to prevent runaway execution.`);
       context.taskManager.failTask(task.id, limitError);
       throw limitError;
     }
     ```
- **How to explain it in an interview:** State clearly: *"In traditional ReAct agents, the model plans and executes in one big loop, which easily gets trapped in repeating tool loops or running out of context tokens. In Odin, I decoupled planning into `LLMPlanner`, which generates a high-level plan, and `AgentExecutor`, which feeds tasks one-by-one with a strict 25-step loop guard and a dynamic token compaction manager."*

---

### Resume Bullet 2
> *"Integrated local LLMs via Ollama with fast-path heuristics to skip the planning phase for simple queries, reducing response latency"*

- **Verdict: SUPPORTED**
- **Evidence in Code:**
  1. **Ollama Integration:** Implemented in `OllamaProvider` ([packages/ai/providers/ollama-provider.ts](file:///d:/projects/odin/packages/ai/providers/ollama-provider.ts#L10-L109)) using the official `ollama` SDK. It converts messages and tools to Ollama format ([packages/ai/providers/mapper.ts](file:///d:/projects/odin/packages/ai/providers/mapper.ts#L3-L50)), streams thinking tokens (`chunk.message.thinking`), content tokens, and tool calls, and defaults to `qwen3:4b-instruct-2507-q4_K_M`.
  2. **Fast-Path Heuristics:** Implemented in `LLMPlanner.isSimpleQuery` ([packages/agent/planning/llm-planner.ts](file:///d:/projects/odin/packages/agent/planning/llm-planner.ts#L146-L162)). If the input is short ($\le 10$ words) and does not contain any of the 34 engineering action keywords (`find`, `create`, `write`, `read`, `refactor`, `fix`, `git`, `grep`, `edit`, `test`, etc.), it bypasses the LLM planning call completely.
  3. **Reducing Response Latency:** In `LLMPlanner.plan` ([packages/agent/planning/llm-planner.ts](file:///d:/projects/odin/packages/agent/planning/llm-planner.ts#L22-L33)), when `isSimpleQuery` returns `true`, it immediately constructs a single synthetic task (`Respond to user`) and returns synchronously without waiting for an LLM network round-trip or token generation.
- **How to explain it in an interview:** *"For simple conversational messages like 'Hello' or 'What is React?', invoking a 4-billion parameter model to produce a multi-step JSON engineering plan creates unnecessary 1–2 second latency. I wrote a fast-path classifier that checks message length and verb semantics. If it's conversational, it skips the planning call and sends the query directly to the executor."*

---

### Resume Bullet 3
> *"Developed a Terminal UI with animated spinners, streaming text output, and an event-driven state machine to safely manage concurrent tool execution without race conditions"*

- **Verdict: SUPPORTED**
- **Evidence in Code:**
  1. **Terminal UI with Animated Spinners & Streaming:** Built in `apps/tui/` using `cli-spinners` ("dots" animation interval), `log-update` for non-flicker re-rendering, and `chalk` for ANSI color styling. In [apps/tui/index.ts](file:///d:/projects/odin/apps/tui/index.ts#L202-L250), it streams `thinking` tokens in dimmed gray, AI text tokens directly to stdout, and dynamically animates active task and tool spinners.
  2. **Event-Driven State Machine:** Implemented as a Redux-style pure reducer in [apps/tui/state.ts](file:///d:/projects/odin/apps/tui/state.ts#L29-L74) receiving `AgentEvent` actions (`plan:set`, `tool`, `model`).
  3. **Safely Managing Concurrent Tool Execution Without Race Conditions:** Handled at three distinct layers:
     - *State machine layer:* In `apps/tui/state.ts`, `runningTools` is maintained as a `Map<string, ToolExecution>`. When multiple tools run concurrently, each start event adds to the map. On tool completion, the state machine only transitions back to `phase = "thinking"` when `nextState.runningTools.size === 0` ([apps/tui/state.ts](file:///d:/projects/odin/apps/tui/state.ts#L55-L58)). A fast-finishing parallel tool cannot prematurely reset the UI while sibling tools are still executing.
     - *Execution layer:* In `ToolExecutor.execute` ([packages/tools/tool-executor.ts](file:///d:/projects/odin/packages/tools/tool-executor.ts#L85-L115)), tools declare their mode (`parallel` vs `serial`). Read-only tools run simultaneously with `Promise.all`, while mutating tools run sequentially. Results are mapped back to their original index (`results[i] = res`), guaranteeing tool response message order matches tool call order.
     - *Permission & prompt synchronization:* In [packages/shared/mutex.ts](file:///d:/projects/odin/packages/shared/mutex.ts#L1-L24) and [packages/runtime/cli-permission-manager.ts](file:///d:/projects/odin/packages/runtime/cli-permission-manager.ts#L36-L37), interactive user approval requests are serialized through a promise-chaining `Mutex`. When a permission prompt appears, stdout writes are buffered into `stdoutQueue` ([apps/tui/index.ts](file:///d:/projects/odin/apps/tui/index.ts#L164-L170)) so background logs or streaming tokens never corrupt the terminal prompt.
- **How to explain it in an interview:** *"When multiple tools execute in parallel (like reading three files at once), updating terminal state naively causes race conditions—spinners clear prematurely, output lines interleave, and user approval prompts collide. I solved this by tracking in-flight executions in a Map inside a pure state reducer, synchronizing terminal prompts with a custom Promise Mutex, and buffering streaming stdout during user prompts."*

---

### Tech Stack Verification
- **TypeScript:** SUPPORTED. 100% TypeScript with strict compiler configs (`@repo/typescript-config`, strict type checks across all packages).
- **Node.js:** SUPPORTED. Standard Node APIs utilized throughout (`node:child_process`, `node:readline/promises`, `node:fs/promises`, `node:process`, `node:crypto`).
- **Bun:** SUPPORTED. Primary runtime and package manager (`bun@1.3.3`, `bun test`, `bun run start`, `bun.lock`).
- **Ollama:** SUPPORTED. Direct integration via `ollama` npm package and `OllamaProvider`.

---

### Significant Features in Code NOT on Edwin's Resume (Bonus Talking Points)

If an interviewer asks *"Is there anything else you built in this project that isn't highlighted on your resume?"*, mention these four features:

1. **Path-Based CLI Permission Manager with Interactive Myers Diff Formatter:**
   - Files: [packages/runtime/cli-permission-manager.ts](file:///d:/projects/odin/packages/runtime/cli-permission-manager.ts) & [packages/runtime/diff-formatter.ts](file:///d:/projects/odin/packages/runtime/diff-formatter.ts).
   - What it does: A security sandbox that intercepts tool calls (`edit_file`, `write_file`, `bash`). For file edits, it runs a full Myers diff algorithm with common affix trimming, detects Windows CRLF vs Unix LF endings, renders a box-bordered authorization card with line-numbered additions/deletions, and supports single-key actions: `[y]` Allow, `[n]` Deny, `[a]` Always Allow for session, and `[d]` Detailed full diff view.
2. **Provider-Agnostic LLM Architecture & Cloud Model Support:**
   - Files: [packages/ai/providers/factory.ts](file:///d:/projects/odin/packages/ai/providers/factory.ts) & [packages/ai/providers/openai-provider.ts](file:///d:/projects/odin/packages/ai/providers/openai-provider.ts).
   - What it does: While default config uses local Ollama, Odin includes a complete OpenAI-compatible streaming client with Server-Sent Events (SSE) parsing. It works out-of-the-box with OpenAI (`gpt-4o`), OpenRouter, Groq, and DeepSeek, automatically parsing streaming reasoning/thinking tokens (`delta.reasoning_content`) and accumulating partial tool-call JSON chunks.
3. **Resilient JSON Parsing & Markdown Recovery:**
   - File: [packages/agent/planning/llm-planner.ts](file:///d:/projects/odin/packages/agent/planning/llm-planner.ts#L80-L134).
   - What it does: Smaller local models often disobey instructions and wrap JSON in ````json ... ```` fences or output conversational filler. The planner strips markdown code fences, parses JSON safely with a fallback to a single task if the LLM output is malformed, and validates that `tasks` is an array with valid IDs and objectives.
4. **Execution Telemetry Collector:**
   - File: [packages/agent/telemetry.ts](file:///d:/projects/odin/packages/agent/telemetry.ts).
   - What it does: Measures wall-clock time vs accumulated tool CPU time, reasoning iterations, and model duration, rendering a clean profile summary in the TUI (e.g., `─ 3.2s total · 2 model calls (2.1s) · 3 tools (850ms)`).
5. **Git Operations Tool Suite:**
   - Files: [packages/tools/git-status.ts](file:///d:/projects/odin/packages/tools/git-status.ts), [packages/tools/git-diff.ts](file:///d:/projects/odin/packages/tools/git-diff.ts), [packages/tools/git-log.ts](file:///d:/projects/odin/packages/tools/git-log.ts), [packages/tools/git-commit.ts](file:///d:/projects/odin/packages/tools/git-commit.ts), and [packages/runtime/git/node-git.ts](file:///d:/projects/odin/packages/runtime/git/node-git.ts).
   - What it does: Provides native porcelain git operations with output size guards (diff capped at 50KB / 1,000 lines, log limited to max 50 entries with unit separator `%x1f` parsing).

---

## A. Project in 60 Seconds

> **Interview Pitch (Speakable in ~50 seconds):**
> 
> *"Odin is an autonomous CLI coding agent that I built using TypeScript, Bun, and Ollama. When developers use standard AI coding agents, they often hit two major problems: first, models get trapped in runaway tool loops or blow through their context windows; second, terminal interfaces become a mess when background tools and AI text try to render at the same time.*
> 
> *To solve this, I designed Odin around a decoupled Planner-Executor architecture. When a user enters a goal, an `LLMPlanner` first breaks it down into a structured JSON execution plan. Then, the `AgentExecutor` runs each task sequentially, feeding the LLM strict task boundaries, a 25-step loop guard, and a token compaction pipeline that summarizes old history and condenses large file outputs.*
> 
> *On the frontend, I built a non-blocking Terminal UI with animated spinners, streaming text, and a Redux-style event reducer that safely manages parallel and serial tool execution without race conditions. It also features a security permission manager with interactive Myers diff previews before any file or bash changes are applied. I am especially proud that all 79 unit and integration tests pass across the monorepo, and that it runs completely private, local models via Ollama."*

---

## B. Architecture Map & End-to-End Execution Flow

### 1. Monorepo Package Structure (Turborepo)

```text
odin/
├── apps/
│   └── tui/                       # CLI Terminal Application (Entry point & UI)
│       ├── index.ts               # App bootstrap, REPL loop, event listener & stdout router
│       ├── renderer.ts            # Log-update terminal renderer (Plan box, tool status, telemetry)
│       ├── state.ts               # Pure Redux-style reducer and RuntimeState definition
│       ├── spinner.ts             # Non-blocking terminal spinner wrapper (cli-spinners)
│       ├── theme.ts               # ANSI color palette, box-drawing characters, formatters
│       └── diff-formatter.ts      # TUI bindings for unified diff formatting
│
├── packages/
│   ├── agent/                     # Core Agent Orchestration & Intelligence
│   │   ├── agent.ts               # Agent façade (coordinates conversation, executor, manager)
│   │   ├── agent-executor.ts      # Sub-task execution loop, boundary injection, 25-step guard
│   │   ├── task-manager.ts        # Tracks active/completed/failed tasks; emits plan:set events
│   │   ├── conversation.ts        # In-memory message history buffer
│   │   ├── context-manager.ts     # ContextManager interface & options
│   │   ├── simple-context-manager.ts     # Window-slicing context manager (fallback)
│   │   ├── compacting-context-manager.ts # Token budgeting, tool condensing & continuity summary
│   │   ├── token-estimator.ts     # Heuristic character-based token estimator (3.8 chars/token)
│   │   ├── telemetry.ts           # Metrics collector (model duration, parallel wall-clock time)
│   │   └── planning/              # Planner subsystem
│   │       ├── planner.ts         # Planner interface
│   │       ├── execution-plan.ts  # ExecutionPlan & PlanTask data types
│   │       └── llm-planner.ts     # Fast-path heuristic & JSON plan generation/parsing
│   │
│   ├── ai/                        # AI Model & Streaming Abstractions
│   │   ├── chat-model.ts          # ChatModel interface (chat method returning EventStream)
│   │   ├── event-stream.ts        # AsyncIterable push-stream with FIFO queue & promise resolver
│   │   ├── message-builder.ts     # Reassembles streaming tokens/tool-calls into AssistantMessage
│   │   └── providers/
│   │       ├── factory.ts         # Provider factory (Ollama, OpenAI, Groq, DeepSeek)
│   │       ├── mapper.ts          # Normalizes messages & tools to Ollama format
│   │       ├── ollama-provider.ts # Local Ollama SDK integration (streaming thinking + tools)
│   │       └── openai-provider.ts # Universal OpenAI-compatible SSE streaming provider
│   │
│   ├── runtime/                   # System Operations & Security Sandbox
│   │   ├── permission-manager.ts  # PermissionManager interface & decision types
│   │   ├── cli-permission-manager.ts # Mutex-protected interactive terminal prompt & raw mode
│   │   ├── diff-formatter.ts      # Myers diff algorithm, line numbers, CRLF preservation
│   │   ├── workspace/             # File system abstractions (NodeWorkspace: read, write, edit, grep, glob)
│   │   ├── terminal/              # Child process spawner (NodeTerminal: streams stdout/stderr/exit)
│   │   └── git/                   # Git operations (NodeGit: status, diff, log, commit)
│   │
│   ├── shared/                    # Cross-cutting Types & Utilities
│   │   ├── messages.ts            # Canonical Message, ToolCall, Role types
│   │   ├── events.ts              # AIEvent definitions (text, thinking, tool-call, done, error)
│   │   └── mutex.ts               # Promise-chaining Mutex for serializing asynchronous actions
│   │
│   └── tools/                     # Tool Implementations & Registry
│       ├── tool.ts                # Tool interface & ExecutionMode ("parallel" | "serial")
│       ├── registry.ts            # ToolRegistry (register, get, list tools)
│       ├── tool-executor.ts       # Executes parallel tools with Promise.all & serial tools in order
│       ├── bash-tool.ts           # Shell execution tool (serial)
│       ├── read-file.ts           # Read file with line numbering & range support (parallel)
│       ├── write-file.ts          # Write file content (serial)
│       ├── edit-file.ts           # Exact string search-and-replace with CRLF handling (serial)
│       ├── list-directory.ts      # Directory listing tool (parallel)
│       ├── glob-tool.ts           # File pattern matching with ignore list & 100-file cap (parallel)
│       ├── grep-tool.ts           # Ripgrep text search with JSON parsing (parallel)
│       ├── git-status.ts          # Porcelain git status tool (parallel)
│       ├── git-diff.ts            # Git diff with 50KB / 1000-line truncation cap (parallel)
│       ├── git-log.ts             # Git log with custom delimiter parsing (parallel)
│       └── git-commit.ts          # Git add & commit with multi-paragraph support (serial)
```

---

### 2. End-to-End Execution Flow (Text Diagram)

```text
User Types Input: "Find all TODOs in src/ and save to todos.txt"
       │
       ▼
[ apps/tui/index.ts ] ─── Passes prompt to Agent.send(input)
       │
       ▼
[ packages/agent/planning/llm-planner.ts ]
   ├── Checks isSimpleQuery() ──> False (>10 words & contains "find", "save")
   ├── Sends system prompt ("Return JSON ONLY...") to ChatModel without tools
   └── Strips markdown code blocks & parses JSON into ExecutionPlan:
       Task 1: "Search for TODO comments in src/" (Objective: grep for TODO)
       Task 2: "Write matches to todos.txt"       (Objective: save results)
       │
       ▼
[ packages/agent/task-manager.ts ] ──> Emits "plan:set" event
       │
       ▼
[ apps/tui/state.ts & renderer.ts ] ──> Reducer stores plan; TUI draws Plan box with spinners
       │
       ▼
[ packages/agent/agent-executor.ts ] ──> Sub-task Loop (For each task in plan):
   │
   ├── 1. Injects boundary prompt to Conversation:
   │      "Execute Task: Search for TODO comments... CRITICAL INSTRUCTION: You MUST ONLY fulfill this task..."
   │
   ├── 2. Prepares messages via CompactingContextManager:
   │      - Validates token count via HeuristicTokenEstimator
   │      - Preserves system prompt at index 0
   │      - Protects atomic tool call/response pairs
   │      - Condenses older tool outputs if budget exceeded (>18,000 tokens)
   │
   ├── 3. Calls model.chat(messages, tools):
   │      - OllamaProvider streams thinking & tool-call events
   │      - MessageBuilder reassembles stream into AssistantMessage
   │      - Model calls: grep({ pattern: "TODO", path: "src" })
   │
   ├── 4. Passes tool call to ToolExecutor.execute():
   │      - Tool is marked executionMode = "parallel"
   │      - Checks CliPermissionManager: policy allows grep without prompt
   │      - Runs tool via NodeWorkspace.grep() -> runs ripgrep (`rg --json -n`)
   │      - Returns ToolMessage with results
   │      - Emits tool:end event -> TUI prints: "✓ grep (12ms) · 5 results"
   │
   ├── 5. Executor passes grep output back to model:
   │      - Model responds with plain text: "I have found 5 TODOs and completed this task."
   │      - Assistant toolCalls.length === 0 -> Task 1 marked COMPLETED!
   │
   └── 6. Executor moves to Task 2 ("Write matches to todos.txt"):
          - Model invokes write_file({ path: "todos.txt", content: "..." })
          - write_file is executionMode = "serial"
          - Intercepted by CliPermissionManager:
            * Mutex locks stdin/stdout
            * Diff engine generates unified diff of new file
            * Renders purple box Authorization Card
            * User presses 'y' (Accept)
          - NodeWorkspace.write() writes file to disk
          - Model responds with plain text confirmation
          - Task 2 marked COMPLETED!
       │
       ▼
[ apps/tui/renderer.ts ] ──> Freezes terminal UI, displays final Telemetry metrics:
   "─ 2.4s total · 3 model calls (1.8s) · 2 tools (320ms)"
```

---

### 3. Step-by-Step Walkthrough of One Real Request

Let's trace a concrete request: **`"Read package.json and summarize our dependencies"`**

1. **User input captured:** In [apps/tui/index.ts](file:///d:/projects/odin/apps/tui/index.ts#L110), `rl.question("> ")` receives the string.
2. **State & Telemetry initialization:** Lines 125–134 instantiate a fresh `createInitialState()`, `new TelemetryCollector()`, and `new Renderer()`. The renderer starts an animated dot spinner indicating the planning phase.
3. **Agent dispatch:** `agent.send(input, { onEvent })` is invoked in line 172.
4. **Planning phase:**
   - In `AgentExecutor.execute` ([packages/agent/agent-executor.ts](file:///d:/projects/odin/packages/agent/agent-executor.ts#L55)), `planner.plan(conversation)` is called.
   - `LLMPlanner.isSimpleQuery` ([packages/agent/planning/llm-planner.ts](file:///d:/projects/odin/packages/agent/planning/llm-planner.ts#L22)) checks the input. The word count is 6 words, but the word `"read"` is in `actionKeywords`. Therefore, `isSimpleQuery` returns `false`.
   - `LLMPlanner` constructs a system message requesting a JSON plan and calls `model.chat(messages, [])` (no tools passed during planning).
   - The model streams the JSON response. `MessageBuilder` reassembles the string.
   - `LLMPlanner` strips any markdown formatting and calls `JSON.parse`. It extracts:
     - Task 1: `"Read package.json"` (Objective: inspect dependencies)
     - Task 2: `"Summarize dependencies"` (Objective: explain packages)
   - `taskManager.loadPlan(plan)` emits `{ type: "plan:set", plan }`.
   - The reducer in `apps/tui/state.ts` updates `state.plan`. The renderer draws the box on the terminal:
     ```text
     ┌─ Plan ─────────────────────────────────────────────────┐
     │ ⠋ Read package.json                                    │
     │ ○ Summarize dependencies                               │
     └────────────────────────────────────────────────────────┘
     ```
5. **Executing Task 1:**
   - `taskManager.startTask("1")` sets Task 1 to `"running"`.
   - The sub-task instruction is appended to the conversation: `"Execute Task: Read package.json ... CRITICAL INSTRUCTION: You MUST ONLY fulfill this specific task..."`
   - `AgentExecutor.callModel` prepares the history via `CompactingContextManager.prepare(history)`. Token count is low (~300 tokens), so no compaction is needed.
   - `model.chat(messages, tools)` is invoked with all 11 registered tools.
   - `OllamaProvider.chat` streams tokens. It emits a `tool-call` event for `read_file` with `{ path: "package.json" }`.
   - The reducer switches `state.phase = "tool"`, `state.currentToolName = "read_file"`.
   - `ToolExecutor.executeSingle` is called:
     - It checks permissions. In `index.ts`, policy rule `{ tool: "read_file", matcher: () => true }` matches. Permission is granted automatically (`allow-always`).
     - `ReadFileTool.execute` calls `NodeWorkspace.read("package.json")`.
     - `NodeWorkspace` reads the file and prefixes line numbers (`1 | {`, `2 |   "name": "odin"...`).
     - Tool finishes. The TUI logs: `✓ read_file (4ms) · 35 results`.
   - The tool output is appended to conversation as a `ToolMessage`.
   - `AgentExecutor` loops again (`stepCount = 2`). It calls the model with the tool output.
   - The model responds with plain text: `"I have read package.json and found the dependencies."`
   - Since `assistant.toolCalls.length === 0`, Task 1 completes! `taskManager.completeTask("1")`.
6. **Executing Task 2:**
   - Task 2 starts. Instruction `"Execute Task: Summarize dependencies..."` is appended.
   - Model receives full conversation. Without needing any tools, it streams the final summary directly to the console in real-time.
   - `assistant.toolCalls.length === 0`, Task 2 completes!
7. **Cleanup & Profiling:**
   - `telemetry.turnFinished()` calculates final timings.
   - `renderer.freeze()` stops the spinner, preserves the output on the terminal, and prints:
     `─ 1.8s total · 3 model calls (1.6s) · 1 tools (4ms)`.

---

## C. Feature Deep Dives (10 Core Modules)

---

### 1. LLM Planner (`LLMPlanner`)
- **What it does & Why it exists:** In standard ReAct agents, the LLM is given the entire objective and a bunch of tools, and is expected to figure out multi-step engineering problems on the fly. This frequently causes the agent to lose direction or start modifying code before exploring the repo. The `LLMPlanner` enforces an upfront architectural phase: it takes the user's high-level goal and forces the LLM to output a structured JSON plan (3–10 distinct tasks with titles and concrete objectives) *before* any tools are executed.
- **Everyday Analogy:** Like an engineering manager who reviews a customer request and creates a Jira ticket checklist before handing it to a developer, rather than letting the developer start randomly editing production files.
- **Files & Functions:** [packages/agent/planning/llm-planner.ts](file:///d:/projects/odin/packages/agent/planning/llm-planner.ts) (`LLMPlanner.plan`).
- **Code Snippet:**
  ```ts
  // packages/agent/planning/llm-planner.ts (lines 64-75)
  const messages: Message[] = [systemPrompt, { role: "user", content: goalText }];

  // Call model without any tools to force pure planning
  const stream = await this.model.chat(messages, []);
  
  const builder = new MessageBuilder();
  for await (const event of stream) {
      builder.consume(event);
  }
  const response = builder.build();
  ```
  - *Line explanation:* The planner sends the user's goal along with a strict system prompt ("Return JSON ONLY... 3-10 tasks..."). Critically, it passes an empty array `[]` for tools, preventing the LLM from attempting tool calls during planning and forcing it to output a pure structured plan.
- **Trade-offs & Alternatives:**
  - *Alternative:* Dynamic planning where the plan updates after every single tool call.
  - *Why this choice:* Calling the model for replanning after every step doubles latency and token consumption. Static upfront planning with resilient fallback gives 90% of the benefit with half the token cost.

---

### 2. Agent Executor & Loop Guard (`AgentExecutor`)
- **What it does & Why it exists:** It is the engine that drives the execution of each sub-task in the plan. It prevents the two most notorious failure modes of AI coding agents: "scope creep" (the model tries to solve tasks 2 and 3 while working on task 1) and "runaway tool loops" (the model gets an error and retries the same broken command forever).
- **Everyday Analogy:** Like a senior engineer sitting next to a junior dev, saying: *"Only work on step 1 right now. Do not touch anything else. If you try 25 times and it still doesn't work, stop so we can re-evaluate."*
- **Files & Functions:** [packages/agent/agent-executor.ts](file:///d:/projects/odin/packages/agent/agent-executor.ts) (`AgentExecutor.execute`, `AgentExecutor.callModel`).
- **Code Snippet:**
  ```ts
  // packages/agent/agent-executor.ts (lines 64, 70-78)
  instruction += `\n\nCRITICAL INSTRUCTION: You MUST ONLY fulfill this specific task. Do NOT attempt subsequent steps. First, use your tools to achieve the objective. THEN, and only when the objective is fully achieved, you must provide a plain text response with NO tool calls (e.g. "I am done") to advance the system to the next task.`;

  context.conversation.addUser(instruction);

  let taskCompleted = false;
  let stepCount = 0;
  while (!taskCompleted) {
      stepCount++;
      if (stepCount > this.maxStepsPerTask) {
          const limitError = new Error(
              `Task "${task.title}" exceeded maximum allowed tool steps (${this.maxStepsPerTask}). Aborting to prevent runaway execution.`
          );
          context.taskManager.failTask(task.id, limitError);
          throw limitError;
      }
      // ... call model and execute tools
  ```
  - *Line explanation:* Line 64 injects an unambiguous boundary instruction so the LLM focuses exclusively on the active task. Lines 70–78 increment a step counter on every tool execution turn. If the model loops more than 25 times on a single task, it throws an error and halts execution immediately.
- **Trade-offs & Alternatives:**
  - *Trade-off:* 25 steps might be too small for very large refactors. However, in good engineering practice, if a single sub-task requires >25 tool calls, the task was poorly planned and should have been divided into smaller steps.

---

### 3. Tool Calling & Parallel vs Serial Execution Engine (`ToolExecutor`)
- **What it does & Why it exists:** When the LLM decides to call multiple tools at once (e.g. `read_file("a.ts")` and `read_file("b.ts")`), executing them serially wastes time. But executing mutating tools (like `edit_file` or `bash`) in parallel causes file corruption and race conditions. `ToolExecutor` categorizes tools by `executionMode`: read-only tools run simultaneously via `Promise.all`, while state-modifying tools run strictly one-by-one.
- **Everyday Analogy:** Like a restaurant kitchen: multiple chefs can read the order tickets at the same time (parallel reads), but only one chef can grill on the single burner at a time (serial writes).
- **Files & Functions:** [packages/tools/tool-executor.ts](file:///d:/projects/odin/packages/tools/tool-executor.ts) (`ToolExecutor.execute`, `ToolExecutor.executeSingle`), [packages/tools/tool.ts](file:///d:/projects/odin/packages/tools/tool.ts).
- **Code Snippet:**
  ```ts
  // packages/tools/tool-executor.ts (lines 85-115)
  async execute(calls: ToolCall[], context: ToolExecutionContext): Promise<ToolMessage[]> {
      const results: ToolMessage[] = new Array(calls.length);
      const parallelPromises: Promise<void>[] = [];

      // 1. Queue Parallel Calls
      for (let i = 0; i < calls.length; i++) {
          const call = calls[i]!;
          const tool = context.registry.get(call.name);
          if (tool?.executionMode === "parallel") {
              parallelPromises.push(
                  this.executeSingle(call, context).then(res => { results[i] = res; })
              );
          }
      }
      // 2. Await all Parallel Calls simultaneously
      await Promise.all(parallelPromises);

      // 3. Execute Serial Calls sequentially
      for (let i = 0; i < calls.length; i++) {
          const call = calls[i]!;
          const tool = context.registry.get(call.name);
          if (!tool || tool.executionMode !== "parallel") {
              results[i] = await this.executeSingle(call, context);
          }
      }
      return results;
  }
  ```
  - *Line explanation:* It creates a pre-sized array `results` matching the call count. Parallel tools are pushed into an array and resolved concurrently with `Promise.all`. Notice `results[i] = res`: storing by original index guarantees that the array order of tool responses matches the exact order expected by the LLM, avoiding index misalignment.
- **Trade-offs & Alternatives:**
  - *Alternative:* Make all tools serial.
  - *Why this choice:* Reading 5 files sequentially on a local model adds several hundred milliseconds of unnecessary latency. Splitting into parallel read and serial write gives both speed and safety.

---

### 4. Fast-Path Heuristic (`isSimpleQuery`)
- **What it does & Why it exists:** When a user says "hi", "who are you?", or "explain quicksort", generating a multi-step JSON plan is a waste of time and GPU cycles. The fast-path heuristic identifies conversational messages and skips the planning LLM call completely, dropping time-to-first-token to near zero.
- **Everyday Analogy:** Like an automated phone menu that connects you directly to an operator if you just say "Representative", without making you listen to the 5-minute options menu.
- **Files & Functions:** [packages/agent/planning/llm-planner.ts](file:///d:/projects/odin/packages/agent/planning/llm-planner.ts#L146-L162) (`LLMPlanner.isSimpleQuery`).
- **Code Snippet:**
  ```ts
  // packages/agent/planning/llm-planner.ts (lines 146-162)
  private isSimpleQuery(text: string): boolean {
      const words = text.trim().split(/\s+/);
      if (words.length <= 10) {
          const actionKeywords = [
              "find", "create", "write", "read", "list", "search", "analyze",
              "refactor", "fix", "add", "remove", "update", "modify", "edit",
              "build", "run", "test", "deploy", "install", "delete", "move",
              "rename", "copy", "grep", "glob", "commit", "push", "pull",
              "implement", "debug", "inspect", "trace", "summarize", "report",
          ];
          const lowerWords = new Set(text.toLowerCase().split(/\W+/));
          const hasAction = actionKeywords.some(kw => lowerWords.has(kw));
          if (!hasAction) return true;
      }
      return false;
  }
  ```
  - *Line explanation:* It splits the input into tokens. If the prompt is 10 words or fewer, it checks if any token exists in a pre-compiled set of 34 engineering verbs. If no action verb is present (e.g. "hello", "what is typescript?"), it flags the input as a simple query and returns a single default task.
- **Trade-offs & Alternatives:**
  - *Alternative:* Using a smaller classification model (like an embedding or lightweight classifier).
  - *Why this choice:* A regular expression / word set check runs in under 0.1 milliseconds with zero memory overhead and no external dependencies.

---

### 5. Pluggable AI Provider Layer (`OllamaProvider` & `OpenAIProvider`)
- **What it does & Why it exists:** Coding agents should not be locked into a single AI vendor. Odin abstracts models behind a uniform `ChatModel` interface with a factory. It provides first-class support for local LLMs via Ollama (for offline privacy and zero cost) while supporting any OpenAI-compatible cloud provider (OpenAI, OpenRouter, Groq, DeepSeek).
- **Everyday Analogy:** Like a universal power adapter: whether you plug into a 110V US wall socket (Ollama local) or a 220V European socket (OpenAI cloud), the laptop charger (Odin) receives standard DC power.
- **Files & Functions:** [packages/ai/chat-model.ts](file:///d:/projects/odin/packages/ai/chat-model.ts), [packages/ai/providers/factory.ts](file:///d:/projects/odin/packages/ai/providers/factory.ts) (`createProvider`), [packages/ai/providers/ollama-provider.ts](file:///d:/projects/odin/packages/ai/providers/ollama-provider.ts), [packages/ai/providers/openai-provider.ts](file:///d:/projects/odin/packages/ai/providers/openai-provider.ts).
- **Code Snippet:**
  ```ts
  // packages/ai/providers/factory.ts (lines 13-27)
  export function createProvider(config: ProviderConfig = {}): ChatModel {
    const provider = (config.provider || process.env.ODIN_PROVIDER || "ollama").toLowerCase();
    const model = config.model || process.env.ODIN_MODEL ||
      (provider === "ollama" ? "qwen3:4b-instruct-2507-q4_K_M" : "gpt-4o");

    if (provider === "ollama") {
      return new OllamaProvider(model);
    }
    // Handles openai, openrouter, groq, deepseek via OpenAIProvider
    return new OpenAIProvider({ model, apiKey, baseURL, temperature: config.temperature });
  }
  ```
  - *Line explanation:* Inspects environment variables or config options. If `ollama`, returns an instance of `OllamaProvider`. Otherwise, sets up standard endpoint URLs (`https://openrouter.ai/api/v1`, `https://api.groq.com/openai/v1`, `https://api.deepseek.com/v1`) and returns `OpenAIProvider`. Both return an `EventStream` conforming to `ChatModel`.
- **Trade-offs & Alternatives:**
  - *Alternative:* Using heavy third-party agent frameworks like LangChain or LlamaIndex.
  - *Why this choice:* Direct integration via native `fetch` and the lightweight `ollama` SDK eliminates hundreds of transitive dependencies, drastically speeds up startup time, and makes debugging streaming issues trivial.

---

### 6. Resilient JSON Parsing & Markdown Stripping Pipeline
- **What it does & Why it exists:** Smaller local models (such as 3B to 7B parameter models) frequently ignore instructions to return "raw JSON only". They often enclose the JSON inside ````json ... ```` markdown blocks, or prepend conversational greetings like "Sure! Here is the plan:". Without resilient extraction, `JSON.parse` crashes and breaks the agent.
- **Everyday Analogy:** Like opening a package that arrived in three layers of bubble wrap: instead of assuming the item is bare on top, you strip away the cardboard and packaging until you reach the actual contents.
- **Files & Functions:** [packages/agent/planning/llm-planner.ts](file:///d:/projects/odin/packages/agent/planning/llm-planner.ts#L80-L135).
- **Code Snippet:**
  ```ts
  // packages/agent/planning/llm-planner.ts (lines 80-104)
  let jsonText = response.content.trim();
  if (jsonText.startsWith("```json")) {
      jsonText = jsonText.replace(/^```json\n/, "").replace(/\n```$/, "");
  } else if (jsonText.startsWith("```")) {
      jsonText = jsonText.replace(/^```\n/, "").replace(/\n```$/, "");
  }

  let parsed: any;
  try {
      parsed = JSON.parse(jsonText);
  } catch (err) {
      // Fallback: If model completely failed to produce valid JSON, create a safe fallback task
      parsed = {
          goal: goalText,
          tasks: [{ id: randomUUID(), title: "Fulfill request", objective: "Address the user's prompt directly.", dependsOn: [] }]
      };
  }
  ```
  - *Line explanation:* It checks for markdown fences (````json` and ````) and cleanly strips them. If `JSON.parse` still fails due to malformed syntax, the `catch` block prevents an unhandled exception by synthesizing a single fallback task, allowing the agent to proceed gracefully instead of crashing.
- **Trade-offs & Alternatives:**
  - *Alternative:* Using Ollama's `format: "json"` constrained decoding schema.
  - *Why this choice:* Constrained decoding can sometimes force models into repetitive character loops on small quantizations. Markdown stripping combined with fallback parsing works reliably across all local and cloud backends.

---

### 7. Event-Driven State Machine & Reducer (`RuntimeState`)
- **What it does & Why it exists:** In a terminal agent, events arrive unpredictably from multiple sources: tool start events, streaming model tokens, background git commands, and user approval prompts. Updating terminal UI variables imperatively from callbacks causes flickering, state mismatches, and race conditions. Odin uses a Redux-style pure reducer `reducer(state, event)` to produce immutable state transitions.
- **Everyday Analogy:** Like a bank account ledger: instead of arbitrarily changing the balance number across multiple threads, every transaction is an immutable event (`deposit`, `withdraw`), and the ledger computes the exact current state predictably.
- **Files & Functions:** [apps/tui/state.ts](file:///d:/projects/odin/apps/tui/state.ts) (`createInitialState`, `reducer`), [apps/tui/renderer.ts](file:///d:/projects/odin/apps/tui/renderer.ts).
- **Code Snippet:**
  ```ts
  // apps/tui/state.ts (lines 39-60)
  case "tool": {
      const { phase, id, toolName } = event.payload;
      
      if (phase === "start") {
          nextState.runningTools = new Map(state.runningTools);
          nextState.runningTools.set(id, { id, toolName, startedAt: Date.now() });
          nextState.currentToolName = toolName;
          nextState.phase = "tool";
      } else if (phase === "end") {
          const execution = state.runningTools.get(id);
          if (execution) {
              nextState.runningTools = new Map(state.runningTools);
              nextState.runningTools.delete(id);
              nextState.completedTools = [...state.completedTools, { ...execution, finishedAt: Date.now() }];
          }
          if (nextState.runningTools.size === 0) {
              nextState.phase = "thinking";
              nextState.currentToolName = undefined;
          }
      }
      break;
  }
  ```
  - *Line explanation:* Notice how tool lifecycles are tracked using an immutable `Map`. When a tool finishes, it is removed from `runningTools`. Line 55 checks `if (nextState.runningTools.size === 0)`: only when *all* parallel tools have completed does the phase transition back to `"thinking"`. This eliminates the race condition where one fast tool would reset the spinner while another tool was still running.
- **Trade-offs & Alternatives:**
  - *Alternative:* Managing UI state with loose boolean flags (`let isToolRunning = false`).
  - *Why this choice:* Loose booleans fall apart with concurrent operations. A pure reducer makes state 100% deterministic, testable, and replayable in unit tests.

---

### 8. Terminal UI (TUI) & Buffered Rendering Queue (`Renderer`)
- **What it does & Why it exists:** When an agent is streaming markdown tokens and simultaneously animating a 10fps spinner via `log-update`, naive terminal writes overwrite each other, causing corrupted text and visual tearing. Odin solves this by cleanly separating the persistent log stream (stdout) from the ephemeral dashboard box (`logUpdate`), and buffering stdout writes whenever an interactive prompt is open.
- **Everyday Analogy:** Like a TV broadcast with a ticker at the bottom: the main video (streaming code) plays uninterrupted, while the scoreboard box at the bottom updates cleanly in place without glitching the video.
- **Files & Functions:** [apps/tui/renderer.ts](file:///d:/projects/odin/apps/tui/renderer.ts), [apps/tui/spinner.ts](file:///d:/projects/odin/apps/tui/spinner.ts), [apps/tui/index.ts](file:///d:/projects/odin/apps/tui/index.ts#L136-L170).
- **Code Snippet:**
  ```ts
  // apps/tui/index.ts (lines 136-157)
  permissions.onBeforePrompt = () => {
    isPrompting = true;
    renderer.stopSpinner();
    renderer.hide();
    process.stdout.write("\x1B[?25h"); // Show cursor
  };

  permissions.onAfterPrompt = () => {
    isPrompting = false;
    process.stdout.write("\n");
    if (stdoutQueue.length > 0) {
      logUpdate.clear();
      process.stdout.write(stdoutQueue.join(""));
      stdoutQueue.length = 0;
      renderer.render({ state, telemetry: telemetry.getMetrics() });
      renderer.startSpinner();
    }
  };
  ```
  - *Line explanation:* Before the user is asked for permission to run a tool, `onBeforePrompt` halts the spinner and hides the dynamic dashboard so the terminal cursor is restored. Any background logs that arrive while the user is reading the prompt are pushed to `stdoutQueue`. Once the user responds, `onAfterPrompt` flushes the queue cleanly and restarts the spinner.
- **Trade-offs & Alternatives:**
  - *Alternative:* Using full-screen TUI libraries like Ink (React for CLI) or Blessed.
  - *Why this choice:* Full-screen terminal libraries capture the alternate screen buffer, meaning when the CLI exits, your scrollback history is lost. Odin uses inline ANSI log-updating (like Claude Code and npm), preserving all output in the developer's normal terminal scrollback.

---

### 9. CLI Permission Manager & Interactive Myers Diff Formatter
- **What it does & Why it exists:** Giving an autonomous AI agent permission to run shell commands and write to files without human oversight is a major security risk. The `CliPermissionManager` acts as an intercepting proxy. Before any destructive tool (`write_file`, `edit_file`, `bash`) executes, it calculates the exact difference using a Myers diff algorithm and presents an authorization card with line numbers and syntax colors.
- **Everyday Analogy:** Like Git's `git diff` combined with a sudo prompt: before a pull request merges to master, you see the exact lines in red and green and must explicitly confirm the change.
- **Files & Functions:** [packages/runtime/cli-permission-manager.ts](file:///d:/projects/odin/packages/runtime/cli-permission-manager.ts), [packages/runtime/diff-formatter.ts](file:///d:/projects/odin/packages/runtime/diff-formatter.ts) (`computeUnifiedDiff`, `generateEditDiff`, `renderPermissionCard`).
- **Code Snippet:**
  ```ts
  // packages/runtime/cli-permission-manager.ts (lines 167-174, 274-288)
  const promise = this.mutex.lock(async () => {
    this.onBeforePrompt?.();

    // Renders box authorization card with Myers diff
    const card = renderPermissionCard({ tool: permission.tool, path: filePath, diff: diffPreview, ... });
    console.log(card);

    let chosenAction = await this.readKey(promptText, validKeys); // Reads 'y'/'n'/'a'/'d' in raw mode
    this.onAfterPrompt?.();

    switch (chosenAction) {
      case "a":
        if (filePath) this.allowedFiles.add(this.normalizePath(filePath));
        this.allowed.add(key);
        return "allow-always";
      case "y":
        this.allowed.add(key);
        return "allow-once";
      default:
        return "deny";
    }
  });
  ```
  - *Line explanation:* Wrapped in `this.mutex.lock`: if two tools request permission at the same instant, the mutex serializes them so only one prompt displays at a time. It uses raw terminal mode (`stdin.setRawMode(true)`) so the user can press a single key (`y`, `n`, `a`, or `d`) without needing to hit Enter.
- **Trade-offs & Alternatives:**
  - *Alternative:* Always prompting for every read and write.
  - *Why this choice:* Prompting for reading files breaks the autonomous workflow. Odin auto-allows read-only tools and pre-approved paths (`src/`), reserving interactive prompts only for unapproved mutating operations.

---

### 10. Telemetry Collector & Execution Profiling (`TelemetryCollector`)
- **What it does & Why it exists:** When an agent takes 5 seconds to complete a goal, developers want to know: *was the model slow, or did the tools take all that time?* The `TelemetryCollector` instruments the entire execution lifecycle, recording model latency, reasoning iterations, and parallel tool wall-clock time vs accumulated CPU time.
- **Everyday Analogy:** Like Chrome DevTools Network Tab: it breaks down total page load time into DNS lookup, TTFB (time to first byte), and asset download time.
- **Files & Functions:** [packages/agent/telemetry.ts](file:///d:/projects/odin/packages/agent/telemetry.ts) (`TelemetryCollector.modelStarted`, `toolStarted`, `toolFinished`, `turnFinished`).
- **Code Snippet:**
  ```ts
  // packages/agent/telemetry.ts (lines 51-71)
  toolStarted(id: string) {
      if (this.activeTools.size === 0) {
          this.toolPhaseStartTime = Date.now();
      }
      this.activeTools.set(id, Date.now());
      this.metrics.toolCalls++;
  }

  toolFinished(id: string) {
      const startTime = this.activeTools.get(id);
      if (startTime) {
          this.metrics.toolAccumulatedMs += (Date.now() - startTime);
          this.activeTools.delete(id);
      }
      if (this.activeTools.size === 0 && this.toolPhaseStartTime) {
          this.metrics.toolWallClockMs += (Date.now() - this.toolPhaseStartTime);
          this.toolPhaseStartTime = undefined;
      }
  }
  ```
  - *Line explanation:* Notice the difference between `toolAccumulatedMs` (sum of durations of all tools) and `toolWallClockMs` (elapsed real time). When 3 tools run in parallel for 100ms each, accumulated time is 300ms, but wall-clock time is only 100ms. This accurately reflects the speedup of parallel execution.
- **Trade-offs & Alternatives:**
  - *Alternative:* Sending telemetry to an external cloud service (like PostHog or Datadog).
  - *Why this choice:* Keeping telemetry in-memory and printing it directly to the developer's console maintains 100% privacy and zero network latency.

---

## D. Interview Q&A (25 High-Probability Questions)

### Group 1: Overview & Personal Pitch

#### Q1: Can you explain what Odin is and why you built it?
> **Answer:** *"I built Odin as an autonomous CLI coding agent that solves the reliability issues common in open-source AI assistants. When developers use standard agents, models often get stuck in repetitive tool loops or crash because they exceed the context window. I wanted to design an architecture that makes local models like Ollama truly dependable on real software engineering tasks by decoupling planning from execution and adding strict security controls."*
> - *Reference:* [README.md](file:///d:/projects/odin/README.md), [packages/agent/agent.ts](file:///d:/projects/odin/packages/agent/agent.ts).

#### Q2: What was your specific role in building this project?
> **Answer:** *"I designed and built the entire project from scratch—from the Turborepo monorepo setup to the core agent loop, tool abstractions, token management, and terminal UI. I wrote all 79 unit and integration tests across 11 test suites to ensure that file editing, git commands, and state transitions are completely bug-free."*
> - *Reference:* [package.json](file:///d:/projects/odin/package.json), [bun.lock](file:///d:/projects/odin/bun.lock).

---

### Group 2: Architecture & Design Decisions

#### Q3: Why did you decouple the Planner and the Executor into separate classes?
> **Answer:** *"In a standard ReAct agent, the model has to think about the big-picture architecture and the low-level tool parameters at the same time. This leads to hallucinations and early, uninformed file edits. In Odin, `LLMPlanner` only focuses on high-level strategy without any tools, outputting a clean JSON plan. Then `AgentExecutor` focuses strictly on one task at a time with injected boundaries. This separation of concerns made the agent dramatically more reliable."*
> - *Reference:* [packages/agent/planning/llm-planner.ts](file:///d:/projects/odin/packages/agent/planning/llm-planner.ts), [packages/agent/agent-executor.ts](file:///d:/projects/odin/packages/agent/agent-executor.ts).

#### Q4: Walk me through how the agent prevents infinite tool loops.
> **Answer:** *"I implemented a two-part defense. First, in `AgentExecutor.execute`, I added a hard `stepCount` limit defaulting to 25 steps per sub-task. If the model fails to finish within 25 tool calls, the task is marked failed and aborted immediately. Second, in each sub-task instruction, I explicitly instruct the model: 'You MUST ONLY fulfill this specific task. First use tools, then reply with a plain text message without tool calls to advance.' This explicit stopping criterion prevents the model from endlessly retrying."*
> - *Reference:* [packages/agent/agent-executor.ts](file:///d:/projects/odin/packages/agent/agent-executor.ts#L64-L78).

#### Q5: How does your CompactingContextManager prevent context window overflow?
> **Answer:** *"I built `CompactingContextManager` based on three strict invariants. Invariant 1 always preserves the initial system prompt. Invariant 2 ensures that tool calls and their results are kept together atomically so the model never sees an orphaned tool message. Invariant 3 keeps the most recent 4 conversation turns completely untouched. When token usage exceeds 75% of the 24,000-token budget, Stage 1 condenses large tool outputs (like 100-line file reads) to head and tail snippets. If still over budget, Stage 2 summarizes older turns into a single continuity summary block."*
> - *Reference:* [packages/agent/compacting-context-manager.ts](file:///d:/projects/odin/packages/agent/compacting-context-manager.ts#L83-L159).

---

### Group 3: Features & Tool Execution

#### Q6: How do you handle parallel versus serial tool execution safely?
> **Answer:** *"Every tool in Odin implements a `Tool` interface specifying an `executionMode`: either `parallel` or `serial`. In `ToolExecutor.execute`, all parallel tools—which are strictly read-only tools like `read_file`, `list_directory`, and `grep`—are launched concurrently using `Promise.all`. Then, serial mutating tools like `write_file`, `edit_file`, and `bash` run sequentially. The results are stored by their original call index so the response order perfectly matches what the LLM expects."*
> - *Reference:* [packages/tools/tool-executor.ts](file:///d:/projects/odin/packages/tools/tool-executor.ts#L85-L115), [packages/tools/tool.ts](file:///d:/projects/odin/packages/tools/tool.ts#L5-L12).

#### Q7: How does your fast-path heuristic work, and what problem does it solve?
> **Answer:** *"When a user inputs a conversational query like 'Hello' or 'Who created you?', calling an LLM to generate a complex multi-step execution plan adds unnecessary latency. In `LLMPlanner.isSimpleQuery`, I check if the input is 10 words or fewer and doesn't contain any of 34 engineering verbs like 'find', 'write', 'fix', or 'commit'. If so, it skips the planning LLM call completely and immediately returns a single task to address the user directly."*
> - *Reference:* [packages/agent/planning/llm-planner.ts](file:///d:/projects/odin/packages/agent/planning/llm-planner.ts#L146-L162).

#### Q8: What happens if the LLM returns invalid JSON or wraps it in markdown code fences?
> **Answer:** *"Local models frequently wrap JSON responses in markdown fences like ````json ... ````. In `LLMPlanner.plan`, I first strip those markdown fences using regular expressions. Then I wrap `JSON.parse` in a try-catch block. If parsing fails because the model output conversational text instead of JSON, the catch block automatically constructs a safe fallback task titled 'Fulfill request'. The system never crashes from a JSON parse error."*
> - *Reference:* [packages/agent/planning/llm-planner.ts](file:///d:/projects/odin/packages/agent/planning/llm-planner.ts#L80-L104).

#### Q9: How does file editing work in Odin, and how do you handle Windows CRLF vs Unix LF line endings?
> **Answer:** *"In `NodeWorkspace.edit`, the agent performs exact search-and-replace. Small local models often output literal escaped `\n` characters instead of real newlines, so my code unescapes them. Then, it detects whether the target file contains `\r\n`. If it's Windows CRLF, it normalizes both search and replace strings to CRLF before matching. It also enforces that the search string matches exactly once in the file to avoid accidental mass replacements."*
> - *Reference:* [packages/runtime/workspace/node-workspace.ts](file:///d:/projects/odin/packages/runtime/workspace/node-workspace.ts#L60-L105).

#### Q10: How does your Permission Manager keep the user's system safe?
> **Answer:** *"Odin uses a path-based security sandbox in `CliPermissionManager`. Safe read-only operations and pre-configured paths (like files inside `src/`) are allowed automatically. But any shell command or file edit outside the policy triggers an interactive prompt. For file changes, it runs a Myers diff algorithm and displays a box-styled card with red and green line-numbered diffs. The user can choose to Accept, Deny, Always Allow for the session, or inspect a Detailed full diff view."*
> - *Reference:* [packages/runtime/cli-permission-manager.ts](file:///d:/projects/odin/packages/runtime/cli-permission-manager.ts#L143-L289).

---

### Group 4: Terminal UI & Event-Driven State Machine

#### Q11: Why did you use an event-driven Redux-style reducer for the Terminal UI?
> **Answer:** *"In a multi-turn agent with streaming LLM tokens, parallel tools, and terminal spinners, managing state with ad-hoc booleans creates race conditions. For example, if two tools run in parallel and one finishes early, an ad-hoc flag might tell the UI that tools are done while the second tool is still running. In `apps/tui/state.ts`, I use a pure reducer with a `Map` of running tools. The UI only switches back to thinking when the map size reaches zero."*
> - *Reference:* [apps/tui/state.ts](file:///d:/projects/odin/apps/tui/state.ts#L29-L74).

#### Q12: How do you prevent the animated spinner and streaming AI text from overwriting each other?
> **Answer:** *"I separated stdout into two distinct layers. Streaming AI tokens and tool completion logs write directly to standard `process.stdout`. The animated dashboard box uses `log-update`, which rewrites only the bottom lines in place. When an interactive permission prompt is triggered, my code stops the spinner, clears the dashboard, restores the terminal cursor, and buffers any arriving logs in a queue until the prompt is resolved."*
> - *Reference:* [apps/tui/index.ts](file:///d:/projects/odin/apps/tui/index.ts#L136-L170), [apps/tui/renderer.ts](file:///d:/projects/odin/apps/tui/renderer.ts#L20-L53).

#### Q13: What is the purpose of the custom Mutex class in packages/shared/mutex.ts?
> **Answer:** *"The `Mutex` uses a promise chain to enforce serial execution of critical sections. In Odin, if two concurrent background tasks request user authorization at the exact same moment, running them without synchronization would cause both prompts to print on top of each other and scramble keyboard input. The Mutex guarantees that the second permission card only renders after the first has been answered."*
> - *Reference:* [packages/shared/mutex.ts](file:///d:/projects/odin/packages/shared/mutex.ts#L1-L24).

---

### Group 5: Tech Stack & Ecosystem Choices

#### Q14: Why did you choose Bun instead of standard Node.js?
> **Answer:** *"I chose Bun primarily for three reasons: first, its native TypeScript execution means I don't need compilation build steps like `ts-node` or `tsx` during development; second, its built-in test runner `bun test` is orders of magnitude faster than Jest, running our 79 tests in under 5 seconds; and third, Bun has first-class package workspace support that integrates cleanly with Turborepo."*
> - *Reference:* [package.json](file:///d:/projects/odin/package.json), [bun.lock](file:///d:/projects/odin/bun.lock).

#### Q15: Why did you structure this project as a Monorepo using Turborepo?
> **Answer:** *"Separating concerns into distinct packages (`@odin/agent`, `@odin/ai`, `@odin/runtime`, `@odin/tools`, `@odin/shared`, and `tui`) prevents tight coupling. For instance, the `@odin/agent` orchestration logic has zero dependency on terminal UI rendering or specific LLM SDKs. This means I could swap the CLI frontend for a web-based React frontend in the future without changing a single line of agent or tool code."*
> - *Reference:* [turbo.json](file:///d:/projects/odin/turbo.json), [packages/](file:///d:/projects/odin/packages/).

#### Q16: Why did you focus on local models with Ollama rather than just relying on OpenAI APIs?
> **Answer:** *"For enterprise software development, data privacy is paramount. Many organizations prohibit sending proprietary source code to third-party cloud APIs. Integrating local models via Ollama allows Odin to run completely offline on developer laptops with zero subscription or token costs. However, I kept the architecture provider-agnostic so switching to cloud models only requires changing one environment variable."*
> - *Reference:* [packages/ai/providers/ollama-provider.ts](file:///d:/projects/odin/packages/ai/providers/ollama-provider.ts), [packages/ai/providers/factory.ts](file:///d:/projects/odin/packages/ai/providers/factory.ts).

#### Q17: Why TypeScript instead of plain JavaScript or Python?
> **Answer:** *"In an agentic system, tool schemas, message roles, and streaming event payloads pass across several layers. TypeScript's strict type checking caught dozens of potential bugs early—such as ensuring tool inputs match their JSON schemas and handling every branch of our discriminated union types like `AIEvent` and `Message`. It makes the codebase robust and self-documenting."*
> - *Reference:* [packages/shared/messages.ts](file:///d:/projects/odin/packages/shared/messages.ts), [packages/shared/events.ts](file:///d:/projects/odin/packages/shared/events.ts).

---

### Group 6: Security, Performance & Telemetry

#### Q18: What security protections exist against malicious prompt injection in user repos?
> **Answer:** *"Odin treats LLM outputs as untrusted data. First, the model cannot execute arbitrary shell commands without passing through `CliPermissionManager`, which halts execution and requests user approval. Second, file editing is restricted to exact string matches within the designated workspace root, preventing directory traversal attacks. Third, bash commands run through a dedicated child process with explicit exit-code monitoring rather than arbitrary string evaluation."*
> - *Reference:* [packages/runtime/cli-permission-manager.ts](file:///d:/projects/odin/packages/runtime/cli-permission-manager.ts), [packages/runtime/workspace/node-workspace.ts](file:///d:/projects/odin/packages/runtime/workspace/node-workspace.ts).

#### Q19: How do you measure and profile agent performance?
> **Answer:** *"I built an in-memory `TelemetryCollector` class. It tracks total turn duration, model reasoning latency, number of reasoning iterations, tool call counts, and parallel tool wall-clock time versus accumulated CPU time. When a query finishes, the TUI prints a concise summary showing exactly where the time was spent."*
> - *Reference:* [packages/agent/telemetry.ts](file:///d:/projects/odin/packages/agent/telemetry.ts), [apps/tui/renderer.ts](file:///d:/projects/odin/apps/tui/renderer.ts#L98-L108).

#### Q20: How do you ensure large tool outputs (like git diffs or file searches) don't crash the agent?
> **Answer:** *"I placed size caps at both the tool level and context level. For example, `GitDiffTool` truncates outputs exceeding 50KB or 1,000 lines. `GlobTool` caps file search results at 100 matches. And in `CompactingContextManager`, any intermediate tool output exceeding 300 tokens has its middle lines omitted, preserving only the head and tail lines alongside the original tool call ID."*
> - *Reference:* [packages/tools/git-diff.ts](file:///d:/projects/odin/packages/tools/git-diff.ts#L59-L79), [packages/tools/glob-tool.ts](file:///d:/projects/odin/packages/tools/glob-tool.ts#L44-L55), [packages/agent/compacting-context-manager.ts](file:///d:/projects/odin/packages/agent/compacting-context-manager.ts#L280-L299).

---

### Group 7: Testing & Debugging Challenges

#### Q21: What was the hardest bug you encountered while building Odin, and how did you fix it?
> **Answer:** *"The most challenging issue was terminal text corruption during parallel tool execution. When two tools finished at nearly the same millisecond, both callbacks triggered console updates while the animated spinner interval was running, causing line overwrites and orphaned ANSI escape codes. I resolved this by introducing a pure state reducer that tracks in-flight executions in a Map, and refactoring terminal output to use a buffered queue whenever the UI is in an interactive or prompting state."*
> - *Reference:* [apps/tui/state.ts](file:///d:/projects/odin/apps/tui/state.ts), [apps/tui/index.ts](file:///d:/projects/odin/apps/tui/index.ts#L161-L170).

#### Q22: How do you test asynchronous streaming and LLM tool calling without incurring API costs?
> **Answer:** *"I wrote comprehensive unit and integration tests using mock implementations and deterministic fixtures. For example, in `packages/agent/context-compaction.test.ts` and `planning.test.ts`, I test token budget estimation, markdown stripping, and tool pair retention with known message arrays without calling a live LLM. For git tools in `packages/tools/git-tools.test.ts`, tests initialize a real temporary git repository on disk and verify porcelain status and diff operations end-to-end."*
> - *Reference:* [packages/agent/context-compaction.test.ts](file:///d:/projects/odin/packages/agent/context-compaction.test.ts), [packages/tools/git-tools.test.ts](file:///d:/projects/odin/packages/tools/git-tools.test.ts).

#### Q23: How do you verify that your Myers diff algorithm accurately reflects file edits?
> **Answer:** *"In `apps/tui/diff-formatter.test.ts`, I wrote 10 targeted test cases covering additions, deletions, multiline edits, line number offsets, and Windows CRLF preservation. The tests verify that replacing strings in files with CRLF produces accurate unified diff hunks without corrupting the file's original line endings."*
> - *Reference:* [apps/tui/diff-formatter.test.ts](file:///d:/projects/odin/apps/tui/diff-formatter.test.ts).

---

### Group 8: Evaluation & Future Improvements

#### Q24: What are the current limitations of Odin?
> **Answer:** *"Currently, the planning phase is static—it creates a plan at the start, but if an unforeseen error occurs midway, it does not dynamically re-plan remaining steps. Second, our token estimator uses a character-based heuristic (3.8 characters per token) rather than a native BPE tokenizer like tiktoken. Third, while we support local Ollama and OpenAI-compatible models, we haven't yet implemented native Anthropic or Google Gemini SDK providers."*
> - *Reference:* [packages/agent/token-estimator.ts](file:///d:/projects/odin/packages/agent/token-estimator.ts), [packages/agent/agent-executor.ts](file:///d:/projects/odin/packages/agent/agent-executor.ts).

#### Q25: If you had another month to work on Odin, what major feature would you build?
> **Answer:** *"I would implement dynamic replanning with a feedback loop: if a tool execution fails repeatedly, the executor would trigger `LLMPlanner.replan` to revise the remaining tasks based on the error. I would also add semantic codebase indexing using tree-sitter AST parsing and vector embeddings, enabling the agent to navigate large repositories with thousands of files without relying solely on ripgrep."*
> - *Reference:* [packages/agent/planning/planner.ts](file:///d:/projects/odin/packages/agent/planning/planner.ts).

---

## E. Tricky Follow-Up Questions (Deep Edge Cases)

### Category 1: Planner & Fast-Path

#### F1: What if a user gives an ambiguous prompt like "Make it better"?
- **What the code does:** `isSimpleQuery` sees 3 words and no action keyword, so it classifies it as a conversational query and bypasses planning. The prompt goes straight to the executor. The model will reply in plain text asking for clarification.
- **What it doesn't do:** It does not initiate an interactive questionnaire to clarify requirements upfront.
- **How to answer honestly:** *"Right now, `isSimpleQuery` treats 'Make it better' as conversational because it contains no engineering action verbs. The agent forwards it to the executor, and the LLM responds asking for clarification. In the future, I plan to add an intent disambiguation step for short, ambiguous prompts."*

#### F2: What if the model outputs valid JSON, but the task list is completely empty (`tasks: []`)?
- **What the code does:** In `LLMPlanner.plan` ([packages/agent/planning/llm-planner.ts](file:///d:/projects/odin/packages/agent/planning/llm-planner.ts#L114-L121)), it explicitly guards against this:
  ```ts
  if (rawTasks.length === 0) {
      rawTasks.push({ id: randomUUID(), title: "Fulfill request", objective: "Address the user's prompt directly.", dependsOn: [] });
  }
  ```
- **How to answer:** *"I accounted for this edge case. If the model returns an empty tasks array, my code detects `rawTasks.length === 0` and injects a default fallback task with a generated UUID, guaranteeing that the executor always has at least one executable task."*

---

### Category 2: Executor & Context Overflow

#### F3: What if an intermediate tool result has 10,000 lines? Does it crash the context window?
- **What the code does:** In `CompactingContextManager.condenseContent` ([packages/agent/compacting-context-manager.ts](file:///d:/projects/odin/packages/agent/compacting-context-manager.ts#L281-L299)), any tool result in older intermediate turns exceeding 300 tokens is condensed to 8 head lines, a placeholder indicating omitted lines, and 8 tail lines.
- **What it doesn't do:** If the huge output happens on the *very latest* turn (within the last 4 turns), Invariant 3 preserves it verbatim. If a single tool output is larger than the total model context window, the model API will reject the request.
- **How to answer honestly:** *"If the 10,000-line output occurred in an older turn, my `CompactingContextManager` condenses it down to 16 lines. However, if a tool outputs 10,000 lines on the current turn, it is currently kept verbatim to prevent loss of recent context. To fix this completely, I also added hard truncation caps at the tool layer—like `GitDiffTool`, which caps output at 50KB or 1,000 lines before returning."*

#### F4: How do you prevent an orphaned tool response if the context window slices between an assistant tool call and its response?
- **What the code does:** `CompactingContextManager.groupIntoTurns` ([packages/agent/compacting-context-manager.ts](file:///d:/projects/odin/packages/agent/compacting-context-manager.ts#L166-L240)) groups an assistant message and all its associated tool response messages into an atomic `ConversationalTurn`. They are never separated.
- **How to answer:** *"Most naive context trimmers slice messages by a simple array index, which can discard an assistant message while keeping its tool response. OpenAI and Ollama reject requests with orphaned tool messages. In Odin, `groupIntoTurns` matches every tool response to its parent assistant `tool_calls` by ID and binds them into an atomic turn. Slicing only occurs at turn boundaries."*

---

### Category 3: Tool Execution & File System

#### F5: What if the model tries to edit a file that has two identical code blocks?
- **What the code does:** In `NodeWorkspace.edit` ([packages/runtime/workspace/node-workspace.ts](file:///d:/projects/odin/packages/runtime/workspace/node-workspace.ts#L96-L98)):
  ```ts
  if (count > 1) {
      throw new Error(`Found ${count} matches for search text in ${path}. Matches must be unique.`);
  }
  ```
  It throws an explicit error and refuses to edit.
- **How to answer:** *"If a search target matches more than once, modifying it could corrupt code in unexpected places. `NodeWorkspace.edit` counts matches and throws an error if `count > 1`, forcing the model to provide more surrounding context to achieve a unique match."*

#### F6: What if the model attempts a path traversal attack like `edit_file("../../../etc/passwd")`?
- **What the code does:** In `NodeWorkspace.resolve`, it runs `path.resolve(this.root, file)`. However, the code does not explicitly check `if (!resolved.startsWith(this.root))`.
- **How to answer honestly:** *"Currently, `NodeWorkspace` uses `path.resolve` relative to the workspace root, and `CliPermissionManager` intercepts the path and displays it to the user for approval. However, the code currently lacks an explicit `startsWith(root)` assertion to strictly jail paths. That is an important security enhancement I would add by introducing a canonical path sandbox check."*

---

## F. Code I Must Be Able to Write or Explain Live

Here are the 6 most essential architectural modules. For each, study the simplified version so you can write it on a whiteboard or in a live coding test.

---

### 1. Promise-Chaining Mutex (`Mutex`)
- **Real File:** [packages/shared/mutex.ts](file:///d:/projects/odin/packages/shared/mutex.ts)
- **Simplified Version (Whiteboard Ready - 16 lines):**
  ```ts
  export class Mutex {
    private queue = Promise.resolve();

    async lock<T>(fn: () => Promise<T>): Promise<T> {
      const previous = this.queue;
      let release: () => void;
      
      this.queue = new Promise<void>((resolve) => {
        release = resolve;
      });

      await previous;
      try {
        return await fn();
      } finally {
        setTimeout(release!, 0); // Yield to event loop
      }
    }
  }
  ```
- **Spoken Explanation:**
  1. *"We maintain a private promise `queue` initialized to a resolved promise.*
  2. *Whenever `lock()` is called, we swap `queue` with a new unsettled promise and wait for the previous one to finish.*
  3. *In the `finally` block, we call `release()` inside `setTimeout(..., 0)` so any queued micro-tasks and UI updates complete before the next operation acquires the lock."*

---

### 2. Fast-Path Heuristic (`isSimpleQuery`)
- **Real File:** [packages/agent/planning/llm-planner.ts](file:///d:/projects/odin/packages/agent/planning/llm-planner.ts#L146-L162)
- **Simplified Version (Whiteboard Ready - 18 lines):**
  ```ts
  function isSimpleQuery(text: string): boolean {
    const words = text.trim().split(/\s+/);
    if (words.length > 10) return false;

    const actionKeywords = new Set([
      "find", "create", "write", "read", "list", "search",
      "refactor", "fix", "add", "edit", "build", "run",
      "test", "deploy", "delete", "grep", "glob", "commit"
    ]);

    const lowerTokens = text.toLowerCase().split(/\W+/);
    const hasAction = lowerTokens.some(token => actionKeywords.has(token));
    return !hasAction;
  }
  ```
- **Spoken Explanation:**
  1. *"First, we check if the user query is 10 words or fewer; longer messages are almost always complex instructions.*
  2. *Second, we tokenize the message and check against a Set of common software engineering verbs.*
  3. *If no action verb is present, we return true, allowing the caller to bypass the expensive planning LLM call."*

---

### 3. Parallel vs Serial Tool Executor
- **Real File:** [packages/tools/tool-executor.ts](file:///d:/projects/odin/packages/tools/tool-executor.ts#L85-L115)
- **Simplified Version (Whiteboard Ready - 25 lines):**
  ```ts
  async function executeTools(calls: ToolCall[], registry: ToolRegistry): Promise<ToolResult[]> {
    const results = new Array(calls.length);
    const parallelOps: Promise<void>[] = [];

    // 1. Run all parallel read-only tools concurrently
    for (let i = 0; i < calls.length; i++) {
      const tool = registry.get(calls[i].name);
      if (tool?.mode === "parallel") {
        parallelOps.push(
          tool.execute(calls[i].input).then(res => { results[i] = res; })
        );
      }
    }
    await Promise.all(parallelOps);

    // 2. Run mutating tools strictly sequentially
    for (let i = 0; i < calls.length; i++) {
      const tool = registry.get(calls[i].name);
      if (tool?.mode !== "parallel") {
        results[i] = await tool.execute(calls[i].input);
      }
    }

    return results;
  }
  ```
- **Spoken Explanation:**
  1. *"We pre-allocate a results array matching the length of incoming tool calls.*
  2. *We execute all read-only tools marked parallel simultaneously using `Promise.all`, placing results into their exact index.*
  3. *Then we iterate through mutating tools sequentially, ensuring state-changing operations never race or interleave."*

---

### 4. Step-Guarded Sub-Task Loop (`AgentExecutor`)
- **Real File:** [packages/agent/agent-executor.ts](file:///d:/projects/odin/packages/agent/agent-executor.ts#L58-L116)
- **Simplified Version (Whiteboard Ready - 28 lines):**
  ```ts
  async function executePlan(plan: ExecutionPlan, executor: (task: PlanTask) => Promise<void>) {
    const MAX_STEPS = 25;

    for (const task of plan.tasks) {
      task.status = "running";
      let stepCount = 0;
      let isTaskDone = false;

      while (!isTaskDone) {
        stepCount++;
        if (stepCount > MAX_STEPS) {
          task.status = "failed";
          throw new Error(`Task "${task.title}" exceeded maximum steps (${MAX_STEPS}).`);
        }

        const assistant = await callModelForTask(task);
        if (assistant.toolCalls.length === 0) {
          // Model returned plain text with no tool calls -> Task complete
          isTaskDone = true;
          break;
        }

        const toolResponses = await executeToolCalls(assistant.toolCalls);
        appendToolResponses(toolResponses);
      }

      task.status = "completed";
    }
  }
  ```
- **Spoken Explanation:**
  1. *"We iterate through each task in the plan sequentially, updating its status to running.*
  2. *Inside the while loop, we increment a step counter on every model-tool iteration to abort if the model loops more than 25 times.*
  3. *When the model returns a response with zero tool calls, it signals that the objective is achieved, and we advance to the next task."*

---

### 5. Resilient Markdown Stripping & JSON Extraction
- **Real File:** [packages/agent/planning/llm-planner.ts](file:///d:/projects/odin/packages/agent/planning/llm-planner.ts#L80-L104)
- **Simplified Version (Whiteboard Ready - 20 lines):**
  ```ts
  function parseJSONPlan(llmOutput: string, defaultGoal: string) {
    let clean = llmOutput.trim();

    // Strip markdown code fences if present
    if (clean.startsWith("```json")) {
      clean = clean.replace(/^```json\n?/, "").replace(/\n?```$/, "");
    } else if (clean.startsWith("```")) {
      clean = clean.replace(/^```\n?/, "").replace(/\n?```$/, "");
    }

    try {
      const parsed = JSON.parse(clean);
      if (Array.isArray(parsed.tasks) && parsed.tasks.length > 0) {
        return parsed;
      }
    } catch {
      // Ignore JSON parse errors and proceed to fallback
    }

    return {
      goal: defaultGoal,
      tasks: [{ id: "1", title: "Fulfill request", objective: clean }]
    };
  }
  ```
- **Spoken Explanation:**
  1. *"We sanitize the LLM response by stripping leading and trailing markdown code fences.*
  2. *We wrap `JSON.parse` in a try-catch block to handle syntax errors from models that output conversational text.*
  3. *If parsing fails or the tasks array is empty, we return a fallback plan containing a single task so the agent never crashes."*

---

### 6. TUI State Machine Reducer (`RuntimeState`)
- **Real File:** [apps/tui/state.ts](file:///d:/projects/odin/apps/tui/state.ts#L29-L73)
- **Simplified Version (Whiteboard Ready - 26 lines):**
  ```ts
  interface State {
    phase: "idle" | "planning" | "thinking" | "tool";
    runningTools: Map<string, string>;
  }

  function reducer(state: State, event: { type: string; payload?: any }): State {
    const next = { ...state };

    switch (event.type) {
      case "tool:start": {
        next.runningTools = new Map(state.runningTools);
        next.runningTools.set(event.payload.id, event.payload.name);
        next.phase = "tool";
        break;
      }
      case "tool:end": {
        next.runningTools = new Map(state.runningTools);
        next.runningTools.delete(event.payload.id);
        if (next.runningTools.size === 0) {
          next.phase = "thinking";
        }
        break;
      }
    }

    return next;
  }
  ```
- **Spoken Explanation:**
  1. *"The reducer is a pure function that returns a new state object for every dispatched event.*
  2. *We track active tools in an immutable Map by their unique ID.*
  3. *On `tool:end`, we only transition back to `thinking` when `runningTools.size === 0`, ensuring parallel tools don't cause UI race conditions."*

---

## G. Core Concepts Glossary

- **LLM Context Window:** The maximum number of tokens (words/sub-words) a language model can process across both input and output in a single API call (e.g., 32,768 tokens in our Ollama config). Exceeding it causes the API to reject the request.
- **Tool / Function Calling:** A protocol where an LLM returns a structured JSON object containing a function name and arguments (e.g. `read_file({ path: "index.ts" })`) instead of conversational text. The client executes the function on the computer and feeds the output back to the model.
- **Planner vs Executor:** An architectural pattern that separates decision-making into two phases: the *Planner* determines high-level goals and steps without executing tools; the *Executor* takes each step and calls tools to accomplish it.
- **State Machine / Reducer:** A predictable state management pattern where state can only change by dispatching explicit *actions* (events) to a pure function (`reducer(state, action) => newState`), preventing unpredictable UI glitches.
- **Race Condition:** A flaw where the timing or order of execution of concurrent operations causes unexpected bugs—such as two parallel tools finishing out of order and corrupting the terminal display.
- **Streaming (SSE / AsyncIterable):** Delivering LLM response tokens one by one as they are generated, rather than waiting for the entire paragraph to finish, providing immediate visual feedback to the user.
- **ANSI Escape Codes:** Standard invisible character sequences (e.g. `\x1b[31m` for red text or `\x1b[?25h` to show the cursor) used to control colors, formatting, and cursor positioning in terminal emulators.
- **Event-Driven Architecture:** A design where components communicate asynchronously by emitting and subscribing to events (e.g., `model:thinking`, `tool:start`), decoupling the UI from backend business logic.
- **Monorepo:** A repository structure where multiple related packages and applications live together in a single Git repo with shared tooling and cross-package linking.
- **Bun vs Node.js:** Node.js is the traditional JavaScript server runtime built on Google's V8 engine. Bun is a modern, high-performance alternative written in Zig that includes native TypeScript execution, a faster package manager, and a built-in test runner.

---

## H. Production Hardening & Scalability Upgrades

In our production readiness milestone (v0.2.0), we implemented the solutions to the earlier prototype limitations, elevating Odin to an enterprise-grade agent.

### Hardened Production Upgrades (Implemented & Tested)
1. **Strict In-Process Path Jailing (`NodeWorkspace.resolveSafe`):**
   - Path traversal attacks (e.g. `../../etc/passwd`) and symlink escapes are actively blocked by canonical realpath verification. Any path escaping the workspace boundary throws a `SecurityViolationError`.
2. **Process Timeouts & Dangerous Command Guards (`NodeTerminal`):**
   - Commands default to a 30,000ms execution timeout with automatic `SIGTERM` / `SIGKILL` termination, returning exit code 124.
   - Destructive command patterns (`rm -rf /`, `format C:`, `mkfs`, fork bombs, raw disk writes) are intercepted and blocked with exit code 126.
3. **Dynamic Replanning & Two-Tier Self-Healing (`LLMPlanner.replan` & `AgentExecutor`):**
   - *Tier 1 (Local Retries):* Compiler and tool errors are fed back to the LLM for up to 3 local retry steps within the sub-task.
   - *Tier 2 (Global Replanning):* If a task exhausts its step limit (25 steps) or encounters unrecoverable errors, `LLMPlanner.replan()` is triggered to analyze the failure log, preserve completed work, and dynamically restructure the remaining plan.
4. **Automated Post-Edit Verification Hook:**
   - The executor automatically executes configurable project verification commands (`bun check-types` / `bun test`) after code edits, injecting compiler errors back into the context so the model self-heals before completing.
5. **Session Persistence via Native SQLite (`SessionStore`):**
   - Backed by Bun's native `bun:sqlite` (`.odin/odin.db`), conversation turns, tool messages, execution plans, and telemetry are durably stored. Supports `/sessions` to list past sessions and `/resume <id>` to seamlessly resume previous conversations.
6. **Multi-Match Edit Disambiguation:**
   - `NodeWorkspace.edit` supports an optional `occurrence?: number` parameter, allowing the model to target a specific occurrence when a code snippet appears multiple times in a file.
7. **Ripgrep Pure JS Fallback:**
   - If `rg` is not installed on the host machine, `NodeWorkspace.grep` automatically falls back to an in-memory glob + regex search using `fast-glob`, ensuring 100% portability.

---

### Remaining Future Roadmap (Next Milestones)
1. **AST-Based Semantic Code Search:** Integrate Tree-sitter parsers to allow semantic code navigation by syntax tree rather than text regex.
2. **Token-Exact BPE Tokenizer:** Integrate a WebAssembly build of tiktoken to achieve byte-exact tokenization without estimation drift.
3. **Native Cloud Providers:** Implement native SDK clients for Anthropic Claude (with prompt caching) and Google Gemini (with structured outputs).
4. **Sandboxed Docker Execution:** Run bash commands and test suites inside ephemeral Docker containers for multi-tenant isolation.
5. **Git Checkpoint Rollbacks:** Automatically create a temporary Git commit checkpoint before every sub-task so failed tasks can be rolled back cleanly.

---

### How to Talk Confidently About Architecture in an Interview
> *"When interviewers ask about limitations or production readiness, describe how you designed the system with clear separation of concerns, identified the weak spots, and implemented concrete defenses: path jailing, two-tier error recovery with dynamic replanning, automated verification loops, and SQLite persistence."*
>
> **Example Answer to memorize:**
> *"When I first built Odin, planning was static and path resolution was relative to the workspace. However, in production, coding agents face runaway loops and malicious prompt injections. I hardened the architecture by introducing canonical path containment assertions, process execution timeouts, a two-tier self-healing loop with dynamic replanning (`LLMPlanner.replan`), and durable session storage using Bun's native SQLite driver. This expanded our test suite to 89 automated tests with zero failures."*

---

## I. Rapid-Fire Revision Round (20 Quick Q&As)

1. **What is Odin?** An autonomous CLI coding agent with decoupled planning, execution, terminal rendering, and SQLite persistence.
2. **What runtime does it use?** Bun (v1.3.3) with TypeScript.
3. **What monorepo tool manages the workspace?** Turborepo with npm/bun workspaces.
4. **What is the default local LLM?** `qwen3:4b-instruct-2507-q4_K_M` running through Ollama.
5. **How does Odin stop infinite tool loops?** A hard limit of 25 steps per sub-task in `AgentExecutor` with dynamic replanning fallback.
6. **How does the fast-path heuristic work?** It skips planning if input has $\le 10$ words and no action verbs.
7. **Which tools run in parallel?** Read-only tools (`read_file`, `list_directory`, `glob`, `grep`, `git_status`, `git_diff`, `git_log`).
8. **Which tools run serially?** Mutating tools (`write_file`, `edit_file`, `bash`, `git_commit`).
9. **How does the TUI state machine avoid race conditions?** It tracks active tools in a Map and only returns to "thinking" when `runningTools.size === 0`.
10. **How does Odin prevent directory traversal attacks?** `NodeWorkspace.resolveSafe` asserts canonical path containment using `fs.realpathSync`.
11. **What does the Mutex do in this project?** It serializes asynchronous CLI prompts so concurrent permission cards never collide.
12. **How does context compaction work?** It preserves system prompt and recent turns, while condensing intermediate tool outputs and summarizing older history.
13. **How does dynamic replanning work?** `LLMPlanner.replan()` analyzes the failed task and error logs, keeping completed work and generating revised tasks.
14. **How does self-healing verification work?** The executor runs a verification command after code edits and feeds compiler errors back to the model.
15. **Where is session history stored?** In `.odin/odin.db` using native `bun:sqlite` with zero external npm dependencies.
16. **What does `NodeWorkspace.edit` do if search matches multiple times?** It requires disambiguation via an `occurrence?: number` parameter.
17. **What is the cap on git diff output?** 50KB or 1,000 lines, whichever is reached first.
18. **What happens if a shell command hangs?** `NodeTerminal` terminates the process after 30s with exit code 124.
19. **How many automated tests are in the repo?** 89 tests across 12 files, all passing on `bun test`.
20. **Can Odin use cloud models?** Yes, it includes an OpenAI-compatible provider supporting OpenAI, OpenRouter, Groq, and DeepSeek.

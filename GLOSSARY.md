# Odin Domain Glossary

Odin is an autonomous, goal-driven CLI coding agent built with TypeScript, Bun, and local/cloud LLMs. This document defines the canonical domain language used across architecture, code, and documentation.

## Language

**Agent**:
The top-level façade that binds the conversation history, tool registry, permission manager, and task manager together, exposing the user-facing `send()` interface.
_Avoid_: Bot, assistant, runner

**Planner**:
The decoupled component (`LLMPlanner`) responsible for transforming a high-level user goal into an ordered sequence of discrete sub-tasks with concrete objectives before execution starts.
_Avoid_: Prompt generator, router, analyzer

**Execution Plan**:
The structured schema (`ExecutionPlan`) containing the user's overall goal and an ordered array of `PlanTask` items with statuses (`pending`, `running`, `completed`, `failed`).
_Avoid_: Checklist, todo list, task queue

**Sub-Task**:
An atomic unit of work within an Execution Plan executed in isolation by the Executor with injected boundaries and loop guards.
_Avoid_: Step, job, action

**Executor**:
The execution engine (`AgentExecutor`) that drives individual sub-tasks to completion by iteratively prompting the model, executing tool calls, and enforcing step limits.
_Avoid_: Dispatcher, task runner, agent loop

**Tool**:
A typed capability registered in the `ToolRegistry` with a JSON schema and an explicit `ExecutionMode` (`parallel` for read-only operations, `serial` for state-mutating operations).
_Avoid_: Function, plugin, skill

**Permission Manager**:
The security boundary (`CliPermissionManager`) that intercepts tool calls before execution to enforce automated policies, path jailing, and interactive human-in-the-loop approvals.
_Avoid_: Guard, middleware, validator

**Context Manager**:
The token-budgeting subsystem (`CompactingContextManager`) responsible for estimating tokens, preserving invariant turns (system prompt, recent turns, atomic tool pairs), and compacting older payloads.
_Avoid_: Memory, history cleaner, summarizer

**Runtime State**:
The deterministic, immutable representation of the TUI (`RuntimeState`) managed through an event-driven Redux-style reducer.
_Avoid_: UI state, app state, terminal context

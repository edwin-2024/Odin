import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { randomUUID } from "node:crypto";
import path from "node:path";

import {
  Agent,
  CompactingContextManager,
  SimpleContextManager,
  TelemetryCollector,
  SessionStore,
} from "@odin/agent";
import { createProvider } from "@odin/ai";
import {
  BashTool,
  ReadFileTool,
  ToolRegistry,
  WriteFileTool,
  EditFileTool,
  GitStatusTool,
  GitDiffTool,
  GitLogTool,
  GitCommitTool,
  ListDirectoryTool,
  GlobTool,
  GrepTool,
} from "@odin/tools";
import {
  CliPermissionManager,
  type PermissionRule,
  NodeWorkspace,
  NodeTerminal,
  NodeGit,
} from "@odin/runtime";
import type { TerminalEvent } from "@odin/runtime/terminal/events";
import { config } from "dotenv";
import chalk from "chalk";

import { Renderer } from "./renderer";
import { createInitialState, reducer } from "./state";
import { c, horizontalRule, formatDuration, GUTTER } from "./theme";
import logUpdate from "log-update";

config({ path: path.join(__dirname, "../../.env") });

async function main() {
  const terminal = new NodeTerminal(process.cwd());
  const workspace = new NodeWorkspace(process.cwd(), terminal);
  const git = new NodeGit(terminal);

  const registry = new ToolRegistry();
  registry.register(new ReadFileTool(workspace));
  registry.register(new WriteFileTool(workspace));
  registry.register(new EditFileTool(workspace));
  registry.register(new ListDirectoryTool(workspace));
  registry.register(new GlobTool(workspace));
  registry.register(new GrepTool(workspace));
  registry.register(new BashTool(terminal));
  registry.register(new GitStatusTool(git));
  registry.register(new GitDiffTool(git));
  registry.register(new GitLogTool(git));
  registry.register(new GitCommitTool(git));

  const providerName = (process.env.ODIN_PROVIDER || "ollama").toLowerCase();
  const modelName =
    process.env.ODIN_MODEL ||
    (providerName === "ollama" ? "qwen3:4b-instruct-2507-q4_K_M" : "gpt-4o");

  const provider = createProvider({
    provider: providerName,
    model: modelName,
  });

  const rl = createInterface({
    input: stdin,
    output: stdout,
  });

  const policies: PermissionRule[] = [
    {
      tool: "read_file",
      matcher: () => true,
    },
    {
      tool: "write_file",
      matcher: (input: any) =>
        typeof input?.path === "string" && input.path.includes("src/"),
    },
    {
      tool: "edit_file",
      matcher: (input: any) =>
        typeof input?.path === "string" && input.path.includes("src/"),
    },
  ];

  const permissions = new CliPermissionManager(rl, policies, {
    workspace,
    workspaceRoot: process.cwd(),
  });

  const agent = new Agent(
    provider,
    registry,
    permissions,
    new CompactingContextManager(),
    {
      terminal,
      verificationCommand: process.env.ODIN_VERIFY_CMD,
    },
  );

  const sessionStore = new SessionStore(path.join(process.cwd(), ".odin/odin.db"));
  let currentSessionId: string = randomUUID();

  // ── Welcome Banner ─────────────────────────────────────────
  console.log("");
  console.log(
    `  ${c.bold(c.accent("⬡"))} ${c.bold("Odin")} ${c.dim(`· [${providerName}] ${modelName}`)}`,
  );
  console.log(c.dim(`  Type 'exit' to quit, '/clear' to reset, '/sessions' to list, '/resume <id>' to resume.`));
  console.log("");

  while (true) {
    let input: string;
    try {
      input = await rl.question(c.accent("> "));
    } catch {
      break;
    }

    if (input.trim() === "exit") {
      break;
    }

    if (input.trim() === "/clear") {
      agent.clear();
      currentSessionId = randomUUID();
      console.log(
        `  ${c.success("✓")} ${c.dim("Conversation memory cleared. New session started.")}\n`,
      );
      continue;
    }

    if (input.trim() === "/sessions") {
      const sessions = sessionStore.listSessions(10);
      console.log(`\n  ${c.bold("Recent Sessions in .odin/odin.db:")}`);
      if (sessions.length === 0) {
        console.log(c.dim("    No saved sessions found."));
      } else {
        for (const s of sessions) {
          const dateStr = new Date(s.updatedAt).toLocaleString();
          console.log(
            `  ${c.cyan(s.id.slice(0, 8))} · ${c.bold(s.goal.slice(0, 40))} ${c.dim(`(${dateStr}) [${s.status}]`)}`,
          );
        }
      }
      console.log(c.dim(`\n  Use '/resume <id>' to continue a previous session.\n`));
      continue;
    }

    if (input.trim().startsWith("/resume")) {
      const targetId = input.trim().split(/\s+/)[1];
      if (!targetId) {
        console.log(c.error("  Usage: /resume <sessionId>\n"));
        continue;
      }
      const sessions = sessionStore.listSessions(50);
      const match = sessions.find(
        (s) => s.id === targetId || s.id.startsWith(targetId),
      );
      if (!match) {
        console.log(c.error(`  Session '${targetId}' not found.\n`));
        continue;
      }
      const savedMessages = sessionStore.getMessages(match.id);
      const savedPlan = sessionStore.getPlan(match.id);
      currentSessionId = match.id;
      agent.restoreSession(savedMessages, savedPlan ?? undefined);
      console.log(
        `  ${c.success("✓")} ${c.dim(`Resumed session ${match.id.slice(0, 8)} (${savedMessages.length} messages loaded).`)}\n`,
      );
      continue;
    }

    try {
      let state = createInitialState();
      const telemetry = new TelemetryCollector();
      const renderer = new Renderer();

      let isPrompting = false;
      let hasBufferedRenders = false;

      // Ensure session is tracked in SQLite
      if (!sessionStore.getSession(currentSessionId)) {
        sessionStore.createSession({
          id: currentSessionId,
          goal: input.slice(0, 100),
          provider: providerName,
          model: modelName,
        });
      }
      sessionStore.saveMessage(currentSessionId, { role: "user", content: input });

      // Start the spinner immediately (planning phase)
      renderer.render({ state, telemetry: telemetry.getMetrics() });
      renderer.startSpinner();

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
        } else if (hasBufferedRenders) {
          renderer.render({ state, telemetry: telemetry.getMetrics() });
          renderer.startSpinner();
        }
        hasBufferedRenders = false;
      };

      let isAssistantSpeaking = false;
      let isThinking = false;
      const stdoutQueue: string[] = [];
      const toolBuffers = new Map<string, string[]>();

      const safeWrite = (text: string) => {
        if (isPrompting) {
          stdoutQueue.push(text);
        } else {
          process.stdout.write(text);
        }
      };

      await agent.send(input, {
        onEvent(event) {
          // 1. State reducer
          state = reducer(state, event);

          // 2. Telemetry
          if (event.type === "model") {
            if (
              event.payload.type === "thinking" ||
              event.payload.type === "text"
            ) {
              if (!isAssistantSpeaking && !isThinking) {
                telemetry.modelStarted();
              }
            } else if (
              event.payload.type === "done" ||
              event.payload.type === "error" ||
              event.payload.type === "tool-call"
            ) {
              telemetry.modelFinished();
            }
          } else if (event.type === "tool") {
            if (event.payload.phase === "start")
              telemetry.toolStarted(event.payload.id);
            else if (event.payload.phase === "end")
              telemetry.toolFinished(event.payload.id);
          }

          let redrawDashboard = false;

          // 3. Stdout projection
          if (event.type === "model") {
            const payload = event.payload;

            if (payload.type === "thinking") {
              if (!isThinking) {
                renderer.stopSpinner();
                logUpdate.clear();
                safeWrite(`\n  ${c.dim("💭 Thinking...")}\n`);
                isThinking = true;
              }
              safeWrite(c.dim(payload.delta));
              redrawDashboard = false;
            } else if (payload.type === "text") {
              if (isThinking) {
                safeWrite("\n\n");
                isThinking = false;
              }
              if (!isAssistantSpeaking) {
                renderer.stopSpinner();
                logUpdate.clear();
                safeWrite(`\n`);
                isAssistantSpeaking = true;
              }
              safeWrite(payload.delta);
              redrawDashboard = false;
            } else if (payload.type === "done" || payload.type === "error") {
              if (isThinking) {
                safeWrite("\n");
                isThinking = false;
              }
              if (isAssistantSpeaking) {
                safeWrite("\n");
                isAssistantSpeaking = false;
              }
              redrawDashboard = true;
            } else if (payload.type === "tool-call") {
              if (isThinking) {
                safeWrite("\n");
                isThinking = false;
              }
              if (isAssistantSpeaking) {
                safeWrite("\n");
                isAssistantSpeaking = false;
              }
            }
          } else if (event.type === "tool") {
            const { phase, id, toolName } = event.payload;

            if (phase === "start") {
              toolBuffers.set(id, []);
              renderer.startSpinner();
              redrawDashboard = true;
            } else if (phase === "event") {
              const data = (event.payload as any)?.payload?.data;
              if (data) {
                const lines = toolBuffers.get(id) || [];
                lines.push(data.trim());
                toolBuffers.set(id, lines);
              }
            } else if (phase === "end") {
              renderer.stopSpinner();
              if (!isPrompting) logUpdate.clear();

              // 1-line summary
              const lines = toolBuffers.get(id) || [];
              const execution = state.completedTools.find((t) => t.id === id);
              const duration =
                execution?.finishedAt && execution?.startedAt
                  ? formatDuration(execution.finishedAt - execution.startedAt)
                  : "";
              const durationStr = duration ? c.dim(` (${duration})`) : "";

              let summary = "";
              if (lines.length === 0) {
                summary = c.dim("done");
              } else if (lines.length === 1) {
                summary = c.dim(lines[0]!.substring(0, 60));
              } else {
                summary = c.dim(`${lines.length} results`);
              }

              safeWrite(
                `  ${c.success("✓")} ${c.cyan(toolName)}${durationStr} ${c.dim("·")} ${summary}\n`,
              );

              toolBuffers.delete(id);
              redrawDashboard = true;
            }
          } else if (event.type === "plan:set") {
            if (!isAssistantSpeaking) {
              redrawDashboard = true;
            }
          }

          if (isPrompting) {
            hasBufferedRenders = true;
          } else if (redrawDashboard) {
            renderer.render({ state, telemetry: telemetry.getMetrics() });
          }
        },
      });

      if (isAssistantSpeaking || isThinking) {
        process.stdout.write("\n");
      }

      telemetry.turnFinished();
      renderer.render({ state, telemetry: telemetry.getMetrics() });
      renderer.freeze();

      // Persist full conversation history, plan, telemetry, and status to SQLite
      sessionStore.syncMessages(currentSessionId, agent.getHistory());
      if (state.plan) {
        sessionStore.savePlan(currentSessionId, state.plan);
      }
      sessionStore.saveTelemetry(currentSessionId, telemetry.getMetrics());
      sessionStore.updateSessionStatus(currentSessionId, "completed");

      console.log("");
    } catch (err) {
      sessionStore.updateSessionStatus(currentSessionId, "failed");
      console.error(c.error(`\n  Error: ${err}`));
    }
  }

  sessionStore.close();
  await rl.close();
  console.log(c.dim("\n  Goodbye.\n"));
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

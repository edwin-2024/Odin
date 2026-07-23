import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";

import { Agent, SimpleContextManager, TelemetryCollector } from "@odin/agent";
import { OllamaProvider } from "@odin/ai";
import { BashTool, ReadFileTool, ToolRegistry, WriteFileTool, EditFileTool, GitStatusTool, ListDirectoryTool, GlobTool, GrepTool } from "@odin/tools";
import { CliPermissionManager, type PermissionRule, NodeWorkspace, NodeTerminal, NodeGit } from "@odin/runtime";
import type { TerminalEvent } from "@odin/runtime/terminal/events";
import { config } from "dotenv";
import path from "node:path";
import { Renderer } from "./renderer";
import { createInitialState, reducer } from "./state";
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


  const modelName = process.env.ODIN_MODEL || "qwen3:4b-instruct-2507-q4_K_M";

  const provider = new OllamaProvider(modelName);

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
      matcher: (input: any) => typeof input?.path === "string" && input.path.includes("src/"),
    },
    {
      tool: "edit_file",
      matcher: (input: any) => typeof input?.path === "string" && input.path.includes("src/"),
    },
  ];

  const permissions = new CliPermissionManager(rl, policies);

  const agent = new Agent(provider, registry, permissions, new SimpleContextManager(20));

  console.log("🤖 Odin");
  console.log("Type 'exit' to quit.");

  while (true) {
    const input = await rl.question("> ");

    if (input.trim() === "exit") {
      break;
    }

    if (input.trim() === "/clear") {
      agent.clear();
      console.log("✨ Conversation memory cleared.\n");
      continue;
    }

    try {
      let state = createInitialState();
      const telemetry = new TelemetryCollector();
      const renderer = new Renderer();

      let isPrompting = false;
      let hasBufferedRenders = false;

      permissions.onBeforePrompt = () => {
        isPrompting = true;
        renderer.hide();
        process.stdout.write("\x1B[?25h"); // Show cursor
      };

      permissions.onAfterPrompt = () => {
        isPrompting = false;
        process.stdout.write("\n"); // Move cursor down to prevent logUpdate from overwriting the prompt
        if (stdoutQueue.length > 0) {
          logUpdate.clear();
          process.stdout.write(stdoutQueue.join(""));
          stdoutQueue.length = 0;
          renderer.render({ state, telemetry: telemetry.getMetrics() });
        } else if (hasBufferedRenders) {
          renderer.render({ state, telemetry: telemetry.getMetrics() });
        }
        hasBufferedRenders = false;
      };

      let isAssistantSpeaking = false;
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
          // 1. Process Event through Reducer for Live State
          state = reducer(state, event);

          // 2. Process Event through TelemetryCollector for Metrics
          if (event.type === "model") {
             if (event.payload.type === "thinking" || event.payload.type === "text") {
                 // We don't have an explicit 'model:start' event, so we infer it
                 if (!isAssistantSpeaking) {
                     telemetry.modelStarted();
                 }
             } else if (event.payload.type === "done" || event.payload.type === "error" || event.payload.type === "tool-call") {
                 telemetry.modelFinished();
             }
          } else if (event.type === "tool") {
             if (event.payload.phase === "start") telemetry.toolStarted(event.payload.id);
             else if (event.payload.phase === "end") telemetry.toolFinished(event.payload.id);
          }

          let redrawDashboard = false;

          // 3. Process Event for stdout projection
          if (event.type === "model" && (event.payload.type === "text" || event.payload.type === "thinking")) {
            if (!isAssistantSpeaking) {
              logUpdate.clear();
              safeWrite("──────────────────────────\nAssistant\n");
              isAssistantSpeaking = true;
            }
            safeWrite(event.payload.delta);
            redrawDashboard = false; // Do not redraw dashboard while streaming!
          } else if (event.type === "tool") {
            const { phase, id, toolName } = event.payload;
            
            if (phase === "start") {
              if (isAssistantSpeaking) {
                  safeWrite("\n");
                  isAssistantSpeaking = false;
              }
              toolBuffers.set(id, []);
              redrawDashboard = true;
            } else if (phase === "event") {
              const data = (event.payload as any)?.payload?.data;
              if (data) {
                  const lines = toolBuffers.get(id) || [];
                  lines.push(data.trim());
                  toolBuffers.set(id, lines);
              }
              redrawDashboard = true;
            } else if (phase === "end") {
              if (!isPrompting) logUpdate.clear();
              
              safeWrite(`──────────────────────────\nTool Output: ${toolName}\n`);
              
              const lines = toolBuffers.get(id) || [];
              for (const line of lines) {
                  safeWrite(`  ${line}\n`);
              }
              
              if (lines.length === 0) {
                safeWrite(`  Completed.\n`);
              }
              safeWrite("──────────────────────────\n");
              
              toolBuffers.delete(id);
              redrawDashboard = true;
            }
          } else if (event.type === "task") {
            if (!isAssistantSpeaking) {
               redrawDashboard = true;
            }
          }

          if (isPrompting) {
            hasBufferedRenders = true;
          } else if (redrawDashboard) {
            renderer.render({ state, telemetry: telemetry.getMetrics() });
          }
        }
      });
      
      if (isAssistantSpeaking) {
          process.stdout.write("\n");
      }

      telemetry.turnFinished();
      renderer.render({ state, telemetry: telemetry.getMetrics() });
      renderer.freeze();
      console.log();
    } catch (err) {
      console.error(err);
    }
  }

  // Ensure all pending readline operations complete before closing
  await rl.close();

  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
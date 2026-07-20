import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";

import { Agent } from "@odin/agent";
import { OllamaProvider } from "@odin/ai";
import { BashTool, ReadFileTool, ToolRegistry, WriteFileTool, EditFileTool, GitStatusTool } from "@odin/tools";
import { CliPermissionManager, type PermissionRule, NodeWorkspace, NodeTerminal, NodeGit } from "@odin/runtime";
import type { TerminalEvent } from "@odin/runtime/terminal/events";
import { config } from "dotenv";
import path from "node:path";

config({ path: path.join(__dirname, "../../.env") });

async function main() {
  const workspace = new NodeWorkspace(process.cwd());
  const terminal = new NodeTerminal(process.cwd());
  const git = new NodeGit(terminal);

  const registry = new ToolRegistry();
  registry.register(new ReadFileTool(workspace));
  registry.register(new WriteFileTool(workspace));
  registry.register(new EditFileTool(workspace));
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

  const agent = new Agent(provider, registry, permissions);



  console.log("🤖 Odin");
  console.log("Type 'exit' to quit.");

  while (true) {
    const input = await rl.question("> ");

    if (input.trim() === "exit") {
      break;
    }

    try {
      await agent.send(input, {
        onEvent(event) {
          switch (event.type) {
            case "text":
              process.stdout.write(event.delta);
              break;

            case "error":
              console.error(event.error);
              break;
          }
        },
        onToolStart(name) {
          console.log(`\n🔧 Using tool: ${name}\n`);
        },

        onToolEnd(name) {
          console.log(`\n✅ Finished: ${name}\n`);
        },

        onToolEvent(name, event: any) {
          if (name === "bash") {
            const terminalEvent = event as TerminalEvent;
            switch (terminalEvent.type) {
              case "stdout":
                process.stdout.write(terminalEvent.data);
                break;
              case "stderr":
                process.stderr.write(terminalEvent.data);
                break;
            }
          }
        },
      });

      console.log();
    } catch (err) {
      console.error(err);
    }
  }

  rl.close();
}

main().catch(console.error);
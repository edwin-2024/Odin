import type { ChatModel } from "@odin/ai";
import { MessageBuilder } from "@odin/ai";

import type { AssistantMessage } from "@odin/shared";

import { ToolRegistry, ToolExecutor } from "@odin/tools";
import type { AgentCallbacks } from "./agent-events";
import type { ContextManager } from "./context-manager";
import type { ExecutionContext } from "./execution-context";

import type { Planner } from "./planning";

export interface AgentExecutorOptions {
  maxStepsPerTask?: number;
  verificationCommand?: string;
  maxLocalRetries?: number;
}

export class AgentExecutor {
  private readonly maxStepsPerTask: number;
  private readonly verificationCommand?: string;
  private readonly maxLocalRetries: number;

  constructor(
    private readonly model: ChatModel,
    private readonly toolExecutor: ToolExecutor,
    private readonly contextManager: ContextManager,
    private readonly planner: Planner,
    optionsOrMaxSteps: number | AgentExecutorOptions = 25,
  ) {
    if (typeof optionsOrMaxSteps === "number") {
      this.maxStepsPerTask = optionsOrMaxSteps;
      this.verificationCommand = process.env.ODIN_VERIFY_CMD;
      this.maxLocalRetries = 3;
    } else {
      this.maxStepsPerTask = optionsOrMaxSteps.maxStepsPerTask ?? 25;
      this.verificationCommand = optionsOrMaxSteps.verificationCommand ?? process.env.ODIN_VERIFY_CMD;
      this.maxLocalRetries = optionsOrMaxSteps.maxLocalRetries ?? 3;
    }
  }

  private async callModel(context: ExecutionContext): Promise<AssistantMessage> {
    const history = [...context.conversation.history()];

    // Inject current plan into the system prompt for overarching context
    if (history.length > 0 && history[0]!.role === "system" && context.taskManager.getPlan()) {
      const plan = context.taskManager.getPlan()!;
      let systemPrompt = history[0]!.content as string;
      systemPrompt += `\n\nCurrent Goal:\n${plan.goal}`;
      history[0] = { ...history[0]!, content: systemPrompt };
    }

    const messages = await this.contextManager.prepare(history);

    const stream = await this.model.chat(
      messages,
      context.registry.list(),
    );

    const builder = new MessageBuilder();

    for await (const event of stream) {
      context.callbacks?.onEvent?.({ type: "model", payload: event });
      builder.consume(event);
    }

    const assistant = builder.build();

    context.conversation.addAssistant(assistant);

    return assistant;
  }

  private async runVerification(context: ExecutionContext): Promise<{ success: boolean; output: string }> {
    if (!this.verificationCommand || !context.terminal) {
      return { success: true, output: "" };
    }

    const stream = context.terminal.run(this.verificationCommand);
    let stdout = "";
    let stderr = "";
    let exitCode = 0;

    for await (const event of stream) {
      if (event.type === "stdout") stdout += event.data;
      else if (event.type === "stderr") stderr += event.data;
      else if (event.type === "exit") exitCode = event.code;
    }

    if (exitCode !== 0) {
      const output = (stderr.trim() || stdout.trim() || `Command failed with exit code ${exitCode}`).slice(0, 2500);
      return { success: false, output };
    }

    return { success: true, output: stdout.slice(0, 500) };
  }

  private async handleReplanningOrFailure(
    context: ExecutionContext,
    taskId: string,
    errorReason: string,
    err: unknown
  ): Promise<void> {
    if (this.planner.replan) {
      try {
        const currentPlan = context.taskManager.getPlan();
        if (currentPlan) {
          const revisedPlan = await this.planner.replan(
            context.conversation,
            currentPlan,
            taskId,
            errorReason
          );
          context.taskManager.loadPlan(revisedPlan);
          return;
        }
      } catch {
        // Fall through to task failure
      }
    }

    const failureError = err instanceof Error ? err : new Error(errorReason);
    context.taskManager.failTask(taskId, failureError);
    throw failureError;
  }

  async execute(context: ExecutionContext): Promise<void> {
    const plan = await this.planner.plan(context.conversation);
    context.taskManager.loadPlan(plan);

    let taskIndex = 0;

    while (true) {
      const currentPlan = context.taskManager.getPlan();
      if (!currentPlan || taskIndex >= currentPlan.tasks.length) {
        break;
      }

      const task = currentPlan.tasks[taskIndex];
      if (!task || task.status === "completed" || task.status === "failed") {
        taskIndex++;
        continue;
      }

      context.taskManager.startTask(task.id);

      // Step the conversation forward by giving the agent its explicit sub-task instruction
      let instruction = `Execute Task: ${task.title}`;
      if (task.objective) instruction += `\n\nObjective: ${task.objective}`;
      instruction += `\n\nCRITICAL INSTRUCTION: You MUST ONLY fulfill this specific task. Do NOT attempt subsequent steps. First, use your tools to achieve the objective. THEN, and only when the objective is fully achieved, you must provide a plain text response with NO tool calls (e.g. "I am done") to advance the system to the next task.`;

      context.conversation.addUser(instruction);

      let taskCompleted = false;
      let stepCount = 0;
      let localRetries = 0;

      while (!taskCompleted) {
        stepCount++;
        if (stepCount > this.maxStepsPerTask) {
          const reason = `Task "${task.title}" exceeded maximum allowed tool steps (${this.maxStepsPerTask}).`;
          await this.handleReplanningOrFailure(context, task.id, reason, new Error(reason));
          break;
        }

        let assistant: AssistantMessage;
        try {
          assistant = await this.callModel(context);
        } catch (e) {
          localRetries++;
          if (localRetries <= this.maxLocalRetries) {
            context.conversation.addUser(
              `Error calling model: ${e instanceof Error ? e.message : String(e)}. Please retry.`
            );
            continue;
          }

          await this.handleReplanningOrFailure(
            context,
            task.id,
            `Model call failure: ${e instanceof Error ? e.message : String(e)}`,
            e
          );
          break;
        }

        if (assistant.toolCalls.length === 0) {
          // Model returned plain text with no tool calls: check automated verification hook before completing
          const verification = await this.runVerification(context);
          if (!verification.success) {
            localRetries++;
            if (localRetries <= this.maxLocalRetries) {
              context.conversation.addUser(
                `AUTOMATED VERIFICATION FAILED (${this.verificationCommand}):\n${verification.output}\n\nPlease inspect and fix these errors using your tools before completing the task.`
              );
              continue;
            }

            await this.handleReplanningOrFailure(
              context,
              task.id,
              `Automated verification failed repeatedly (${this.verificationCommand}): ${verification.output.slice(0, 200)}`,
              new Error(`Verification failed after ${this.maxLocalRetries} retries.`)
            );
            break;
          }

          taskCompleted = true;
          break;
        }

        let toolMessages;
        try {
          toolMessages = await this.toolExecutor.execute(assistant.toolCalls, {
            registry: context.registry,
            permissions: context.permissions,
            callbacks: {
              onEvent: (toolEvent) =>
                context.callbacks?.onEvent?.({
                  type: "tool",
                  payload: toolEvent,
                }),
            },
          });
        } catch (e) {
          localRetries++;
          if (localRetries <= this.maxLocalRetries) {
            context.conversation.addUser(
              `Tool execution failure: ${e instanceof Error ? e.message : String(e)}. Please try an alternative approach.`
            );
            continue;
          }

          await this.handleReplanningOrFailure(
            context,
            task.id,
            `Tool failure: ${e instanceof Error ? e.message : String(e)}`,
            e
          );
          break;
        }

        let hasToolError = false;
        let lastToolError = "";
        for (const message of toolMessages) {
          context.conversation.addTool(message);
          if (typeof message.content === "string" && message.content.startsWith("Error:")) {
            hasToolError = true;
            lastToolError = message.content;
          }
        }

        if (hasToolError) {
          localRetries++;
          if (localRetries > this.maxLocalRetries) {
            await this.handleReplanningOrFailure(
              context,
              task.id,
              `Tool error occurred repeatedly: ${lastToolError.slice(0, 200)}`,
              new Error(lastToolError)
            );
            break;
          }
        }
      }

      if (taskCompleted) {
        context.taskManager.completeTask(task.id);
        taskIndex++;
      }
    }
  }
}

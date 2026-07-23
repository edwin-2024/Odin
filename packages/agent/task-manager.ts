import { randomUUID } from "node:crypto";
import type { Task, TaskHandle } from "./task";
import type { TaskEvent } from "./agent-events";

export class TaskManager {
    private readonly tasks = new Map<string, Task>();

    emit?: (event: { type: "task"; payload: TaskEvent }) => void;

    start(description: string): TaskHandle {
        const id = randomUUID();
        const task: Task = {
            id,
            description,
            status: "running",
            startedAt: new Date()
        };

        this.tasks.set(id, task);

        this.emit?.({
            type: "task",
            payload: { phase: "start", task }
        });

        return {
            task,
            complete: () => {
                task.status = "completed";
                task.completedAt = new Date();
                this.emit?.({
                    type: "task",
                    payload: { phase: "complete", task }
                });
            },
            fail: (error?: unknown) => {
                task.status = "failed";
                task.completedAt = new Date();
                this.emit?.({
                    type: "task",
                    payload: { phase: "fail", task, error }
                });
            }
        };
    }

    list(): readonly Readonly<Task>[] {
        return [...this.tasks.values()];
    }

    active(): Readonly<Task> | undefined {
        const arr = [...this.tasks.values()];
        // Find the last started task that is still running
        for (let i = arr.length - 1; i >= 0; i--) {
            if (arr[i]!.status === "running") {
                return arr[i];
            }
        }
        return undefined;
    }

    clear(): void {
        this.tasks.clear();
    }
}

export type TaskStatus = "pending" | "running" | "completed" | "failed";

export interface Task {
    id: string;
    description: string;
    status: TaskStatus;
    startedAt: Date;
    completedAt?: Date;
}

export interface TaskHandle {
    readonly task: Readonly<Task>;
    complete(): void;
    fail(error?: unknown): void;
}


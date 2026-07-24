export interface PlanTask {
    id: string;
    title: string;
    objective?: string;
    description?: string;
    dependsOn: string[];
    status:
        | "pending"
        | "running"
        | "completed"
        | "failed";
    metadata?: Record<string, unknown>;
}

export interface ExecutionPlan {
    goal: string;
    tasks: PlanTask[];
}

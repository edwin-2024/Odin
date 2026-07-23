export interface TelemetryMetrics {
    startedAt: number;
    finishedAt?: number;
    
    totalDurationMs: number;
    modelDurationMs: number;
    toolWallClockMs: number;
    toolAccumulatedMs: number;
    
    toolCalls: number;
    reasoningIterations: number;
}

export class TelemetryCollector {
    private metrics: TelemetryMetrics;

    private modelStartTime?: number;
    
    // Track each active tool's start time by its ID
    private activeTools = new Map<string, number>();

    // To measure wall clock time of tools (parallel tool execution),
    // we just track when the first tool started and when the last tool finished
    // during a specific tool-execution phase.
    private toolPhaseStartTime?: number;
    
    constructor() {
        this.metrics = {
            startedAt: Date.now(),
            totalDurationMs: 0,
            modelDurationMs: 0,
            toolWallClockMs: 0,
            toolAccumulatedMs: 0,
            toolCalls: 0,
            reasoningIterations: 0
        };
    }

    modelStarted() {
        this.modelStartTime = Date.now();
        this.metrics.reasoningIterations++;
    }

    modelFinished() {
        if (this.modelStartTime) {
            this.metrics.modelDurationMs += (Date.now() - this.modelStartTime);
            this.modelStartTime = undefined;
        }
    }

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

    turnFinished() {
        this.metrics.finishedAt = Date.now();
        this.metrics.totalDurationMs = this.metrics.finishedAt - this.metrics.startedAt;
    }

    getMetrics(): Readonly<TelemetryMetrics> {
        return this.metrics;
    }
}

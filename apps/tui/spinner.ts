import cliSpinners from "cli-spinners";

export class Spinner {
    private frameIndex = 0;
    private interval?: Timer;
    private readonly frames: string[];
    private readonly intervalMs: number;

    constructor(type: keyof typeof cliSpinners = "dots") {
        const spinner = cliSpinners[type];
        this.frames = spinner.frames;
        this.intervalMs = spinner.interval;
    }

    start(onTick: () => void): void {
        if (this.interval) return;
        this.frameIndex = 0;
        this.interval = setInterval(() => {
            this.frameIndex = (this.frameIndex + 1) % this.frames.length;
            onTick();
        }, this.intervalMs);
    }

    stop(): void {
        if (this.interval) {
            clearInterval(this.interval);
            this.interval = undefined;
        }
    }

    getFrame(): string {
        return this.frames[this.frameIndex] ?? "⠋";
    }

    get isRunning(): boolean {
        return this.interval !== undefined;
    }
}

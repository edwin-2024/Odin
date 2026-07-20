import type { TerminalEvent } from "./events";

export class TerminalStream
    implements AsyncIterable<TerminalEvent> {
    private readonly queue: TerminalEvent[] = [];
    private readonly waiters: ((
        value: IteratorResult<TerminalEvent>
    ) => void)[] = [];

    private finished = false;

    push(event: TerminalEvent) {
        if (this.finished) {
            return;
        }

        const waiter = this.waiters.shift();

        if (waiter) {
            waiter({
                value: event,
                done: false,
            });
        } else {
            this.queue.push(event);
        }
    }

    close() {
        this.finished = true;

        while (this.waiters.length) {
            this.waiters.shift()!({
                value: undefined as never,
                done: true,
            });
        }
    }

    async next(): Promise<
        IteratorResult<TerminalEvent>
    > {
        if (this.queue.length) {
            return {
                value: this.queue.shift()!,
                done: false,
            };
        }

        if (this.finished) {
            return {
                value: undefined as never,
                done: true,
            };
        }

        return new Promise(resolve => {
            this.waiters.push(resolve);
        });
    }

    [Symbol.asyncIterator]() {
        return this;
    }
}
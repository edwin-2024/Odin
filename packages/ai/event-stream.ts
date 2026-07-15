import type { AIEvent } from "@odin/shared";

export class EventStream implements AsyncIterable<AIEvent> {
  private queue: AIEvent[] = [];
  private waiting: ((result: IteratorResult<AIEvent>) => void)[] = [];
  private done = false;

  push(event: AIEvent) {
    if (this.done) return;

    const waiter = this.waiting.shift();

    if (waiter) {
      waiter({
        value: event,
        done: false,
      });
    } else {
      this.queue.push(event);
    }

    if (event.type === "done" || event.type === "error") {
      this.done = true;
    }
  }
  
  async *[Symbol.asyncIterator]() {
    while (true) {
      if (this.queue.length > 0) {
        yield this.queue.shift()!;
      } else if (this.done) {
        return;
      } else {
        const next = await new Promise<IteratorResult<AIEvent>>((resolve) =>
          this.waiting.push(resolve),
        );

        if (next.done) return;

        yield next.value;
      }
    }
  }
}

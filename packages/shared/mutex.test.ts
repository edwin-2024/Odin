import { describe, it, expect } from "bun:test";
import { Mutex } from "./mutex";

describe("Mutex", () => {
  it("executes critical sections serially", async () => {
    const mutex = new Mutex();
    const order: number[] = [];

    const task1 = mutex.lock(async () => {
      await new Promise((r) => setTimeout(r, 20));
      order.push(1);
    });

    const task2 = mutex.lock(async () => {
      order.push(2);
    });

    await Promise.all([task1, task2]);
    expect(order).toEqual([1, 2]);
  });
});

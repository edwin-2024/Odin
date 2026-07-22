export class Mutex {
  private queue = Promise.resolve();

  async lock<T>(fn: () => Promise<T>): Promise<T> {
    const previous = this.queue;

    let release!: () => void;

    this.queue = new Promise<void>((resolve) => {
      release = resolve;
    });

    await previous;

    try {
      return await fn();
    } finally {
      // Yield to the event loop before releasing the lock
      // This ensures that synchronous UI follow-ups (like printing "Using tool:") 
      // finish rendering before the next queued prompt acquires the lock.
      setTimeout(release, 0);
    }
  }
}

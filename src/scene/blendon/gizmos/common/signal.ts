/** A C# event: any number of subscribers, invoked in subscription order. */
export class Signal<A extends unknown[] = []> {
  private readonly handlers: ((...args: A) => void)[] = [];

  add(fn: (...args: A) => void) {
    this.handlers.push(fn);
    return () => {
      const i = this.handlers.indexOf(fn);
      if (i >= 0) this.handlers.splice(i, 1);
    };
  }

  invoke(...args: A) {
    for (const h of [...this.handlers]) h(...args);
  }
}

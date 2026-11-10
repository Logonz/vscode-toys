import type { Memento } from "vscode";

/** An in-memory stand-in for `ExtensionContext.workspaceState` / `globalState`. */
export class MemoryMemento implements Memento {
  private readonly values = new Map<string, unknown>();

  keys(): readonly string[] {
    return [...this.values.keys()];
  }

  // `any` satisfies both of Memento's `get` overloads.
  get(key: string, defaultValue?: unknown): any {
    return this.values.has(key) ? this.values.get(key) : defaultValue;
  }

  update(key: string, value: unknown): Thenable<void> {
    // Round-trip through JSON like VS Code's storage, so tests catch values that do not survive it.
    this.values.set(key, value === undefined ? undefined : JSON.parse(JSON.stringify(value)));
    return Promise.resolve();
  }
}

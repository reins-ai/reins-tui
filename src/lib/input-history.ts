export class InputHistory {
  private history: string[] = [];
  private cursor = -1;
  private draft = "";
  private readonly maxSize: number;

  constructor(maxSize = 100) {
    this.maxSize = maxSize;
  }

  push(message: string): void {
    if (message.trim().length === 0) {
      this.cursor = -1;
      return;
    }

    this.history.push(message);
    if (this.history.length > this.maxSize) {
      this.history = this.history.slice(this.history.length - this.maxSize);
    }

    this.cursor = -1;
    this.draft = "";
  }

  navigateUp(): string | null {
    if (this.history.length === 0) {
      return null;
    }

    if (this.cursor === -1) {
      this.cursor = this.history.length - 1;
      return this.history[this.cursor];
    }

    if (this.cursor === 0) {
      return null;
    }

    this.cursor -= 1;
    return this.history[this.cursor];
  }

  navigateDown(): string | null {
    if (this.history.length === 0 || this.cursor === -1) {
      return null;
    }

    if (this.cursor >= this.history.length - 1) {
      this.cursor = -1;
      return this.draft;
    }

    this.cursor += 1;
    return this.history[this.cursor];
  }

  setDraft(text: string): void {
    this.draft = text;
  }

  getCurrent(): string {
    if (this.cursor === -1) {
      return this.draft;
    }

    return this.history[this.cursor] ?? this.draft;
  }

  getAll(): string[] {
    return [...this.history];
  }

  clear(): void {
    this.history = [];
    this.cursor = -1;
    this.draft = "";
  }
}

export class OperationBusyError extends Error {
  constructor(readonly activeOperation: string) {
    super(`Ya hay una operación en curso (${activeOperation}). Espera a que termine e inténtalo de nuevo.`);
    this.name = 'OperationBusyError';
  }
}

export type MutexStatus = { busy: boolean; operation: string | null };

/** Una sola operación de escritura en vuelo; la segunda se rechaza, no se encola. */
export class OperationMutex {
  private active: string | null = null;

  async run<T>(name: string, fn: () => Promise<T>): Promise<T> {
    if (this.active !== null) throw new OperationBusyError(this.active);
    this.active = name;
    try {
      return await fn();
    } finally {
      this.active = null;
    }
  }

  status(): MutexStatus {
    return { busy: this.active !== null, operation: this.active };
  }
}

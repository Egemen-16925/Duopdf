// Eski Android WebView sürümleri (ör. Huawei cihazlar) için pdf.js'in kullandığı ama legacy derlemesinin
// yamalamadığı özellikler. Ana modülde ve pdf.js işçisinde her şeyden önce yüklenir.

// Promise.withResolvers: Chrome 119.
const P = Promise as unknown as { withResolvers?: unknown };
if (typeof P.withResolvers !== "function") {
  P.withResolvers = function <T>() {
    let resolve!: (value: T | PromiseLike<T>) => void;
    let reject!: (reason?: unknown) => void;
    const promise = new Promise<T>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    return { promise, resolve, reject };
  };
}

// ReadableStream'i `for await` ile dolaşma: Chrome 124. pdf.js sayfa metnini (getTextContent) böyle okur;
// yoksa PDF "t is not async iterable" hatasıyla açılmaz.
type Proto = Record<PropertyKey, unknown>;
const RS = (globalThis as unknown as { ReadableStream?: { prototype: Proto } }).ReadableStream;
if (RS && typeof RS.prototype[Symbol.asyncIterator] !== "function") {
  const values = function (this: ReadableStream, options?: { preventCancel?: boolean }): AsyncIterableIterator<unknown> {
    const reader = this.getReader();
    const preventCancel = options?.preventCancel ?? false;
    return {
      next: () => reader.read() as Promise<IteratorResult<unknown>>,
      // Döngüden erken çıkılırsa (break, hata) akış kapatılır ve kilit bırakılır.
      async return(value?: unknown) {
        if (!preventCancel) {
          const cancelled = reader.cancel(value);
          reader.releaseLock();
          await cancelled;
        } else {
          reader.releaseLock();
        }
        return { done: true, value };
      },
      [Symbol.asyncIterator]() {
        return this;
      },
    };
  };
  if (typeof RS.prototype.values !== "function") RS.prototype.values = values;
  RS.prototype[Symbol.asyncIterator] = values;
}

// Array.prototype.findLast (Chrome 97) ve toReversed (Chrome 110): pdf.js görüntüleyicisi kullanır.
const A = Array.prototype as unknown as Proto;
if (typeof A.findLast !== "function") {
  A.findLast = function <T>(this: T[], predicate: (value: T, index: number, array: T[]) => unknown, thisArg?: unknown) {
    for (let i = this.length - 1; i >= 0; i--) if (predicate.call(thisArg, this[i], i, this)) return this[i];
    return undefined;
  };
}
if (typeof A.toReversed !== "function") {
  A.toReversed = function <T>(this: T[]) {
    return Array.from(this).reverse();
  };
}

export {};

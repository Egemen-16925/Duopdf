// Eski Android WebView sürümleri (Chrome 119 öncesi, ör. Huawei cihazlar) için pdf.js'in kullandığı ama
// legacy derlemesinin yamalamadığı özellikler. Ana modülde ve pdf.js işçisinde her şeyden önce yüklenir.
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

export {};

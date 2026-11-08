import { afterEach, describe, expect, it, vi } from "vitest";

// Yamalar yalnızca özellik yoksa devreye girer; Node'da hepsi var, o yüzden önce siliniyor.
type Proto = Record<PropertyKey, unknown>;
const streamProto = ReadableStream.prototype as unknown as Proto;
const arrayProto = Array.prototype as unknown as Proto;
const saved = {
  asyncIterator: streamProto[Symbol.asyncIterator],
  values: streamProto.values,
  findLast: arrayProto.findLast,
  toReversed: arrayProto.toReversed,
};

async function loadWithout(...names: ("asyncIterator" | "values" | "findLast" | "toReversed")[]) {
  for (const name of names) {
    if (name === "asyncIterator") delete streamProto[Symbol.asyncIterator];
    else if (name === "values") delete streamProto.values;
    else delete arrayProto[name];
  }
  vi.resetModules();
  await import("./polyfills");
}

afterEach(() => {
  streamProto[Symbol.asyncIterator] = saved.asyncIterator;
  streamProto.values = saved.values;
  arrayProto.findLast = saved.findLast;
  arrayProto.toReversed = saved.toReversed;
});

const streamOf = (items: number[]) =>
  new ReadableStream<number>({
    start(controller) {
      for (const item of items) controller.enqueue(item);
      controller.close();
    },
  });

describe("polyfills for older Android WebViews", () => {
  it("lets ReadableStream be read with for await (pdf.js getTextContent)", async () => {
    await loadWithout("asyncIterator", "values");
    expect(saved.asyncIterator).not.toBe(streamProto[Symbol.asyncIterator]);

    const seen: number[] = [];
    for await (const item of streamOf([1, 2, 3]) as unknown as AsyncIterable<number>) seen.push(item);

    expect(seen).toEqual([1, 2, 3]);
  });

  it("cancels the stream and releases the lock when the loop exits early", async () => {
    await loadWithout("asyncIterator", "values");
    const stream = streamOf([1, 2, 3]);

    for await (const item of stream as unknown as AsyncIterable<number>) if (item === 1) break;

    expect(stream.locked).toBe(false);
  });

  it("adds findLast and toReversed without changing the array", async () => {
    await loadWithout("findLast", "toReversed");
    const list = [1, 2, 3, 4] as unknown as { findLast(p: (n: number) => boolean): number; toReversed(): number[] } & number[];

    expect(list.findLast((n) => n % 2 === 1)).toBe(3);
    expect(list.toReversed()).toEqual([4, 3, 2, 1]);
    expect([...list]).toEqual([1, 2, 3, 4]);
  });
});

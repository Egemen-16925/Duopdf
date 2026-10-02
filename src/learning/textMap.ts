/**
 * Bir kök öğenin (PDF metin katmanı ya da akan metin bölümü) metnini tek dizgeye
 * çevirir ve dizgedeki her konumu DOM'daki metin düğümüne geri eşler.
 */
export type TextMode = "pdf" | "flow";

export interface TextMap {
  text: string;
  nodes: { node: Text; start: number }[];
}

const BLOCK = "p,li,h1,h2,h3,h4,h5,h6,div,td,th,dt,dd,blockquote,pre,figcaption,section,article,tr";

function blockOf(node: Node, root: Element): Element | null {
  const el = node.parentElement?.closest(BLOCK) ?? null;
  return el && root.contains(el) ? el : root;
}

export function buildTextMap(root: Element, mode: TextMode): TextMap {
  const walker = root.ownerDocument.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes: TextMap["nodes"] = [];
  let text = "";
  let prevBlock: Element | null = null;
  for (let node = walker.nextNode() as Text | null; node; node = walker.nextNode() as Text | null) {
    const value = node.data;
    if (!value) continue;
    if (text) {
      // PDF metin katmanında her parça ayrı <span>; aralarına boşluk koy. Akan metinde yalnızca blok değişince.
      if (mode === "pdf") {
        if (!/\s$/.test(text) && !/^\s/.test(value)) text += " ";
      } else {
        const block = blockOf(node, root);
        if (block !== prevBlock && !/\s$/.test(text)) text += "\n";
      }
    }
    prevBlock = blockOf(node, root);
    nodes.push({ node, start: text.length });
    text += value;
  }
  return { text, nodes };
}

function locate(map: TextMap, offset: number): { node: Text; offset: number } | null {
  let lo = 0;
  let hi = map.nodes.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const { node, start } = map.nodes[mid];
    if (offset < start) hi = mid - 1;
    else if (offset > start + node.data.length) lo = mid + 1;
    else return { node, offset: offset - start };
  }
  // Eklenen ayraç karakterine denk geldiyse bir sonraki düğümün başı.
  const next = map.nodes[lo];
  return next ? { node: next.node, offset: 0 } : null;
}

export function rangeFor(map: TextMap, start: number, end: number): Range | null {
  const a = locate(map, start);
  const b = locate(map, end);
  if (!a || !b) return null;
  const range = a.node.ownerDocument.createRange();
  range.setStart(a.node, a.offset);
  range.setEnd(b.node, b.offset);
  return range;
}

/** DOM konumunu (metin düğümü + karakter) dizgedeki konuma çevirir. */
export function offsetOf(map: TextMap, node: Node, offset: number): number | null {
  const entry = map.nodes.find((n) => n.node === node);
  if (entry) return entry.start + Math.min(offset, entry.node.data.length);
  // Öğe düğümü verilmişse (ör. seçim sınırı), o öğenin içindeki ilk metin düğümünü kullan.
  if (node.nodeType === Node.ELEMENT_NODE) {
    const child = node.childNodes[offset] ?? null;
    const target = map.nodes.find((n) => (child ? child.contains(n.node) || child === n.node : node.contains(n.node)));
    if (target) return target.start;
  }
  return null;
}

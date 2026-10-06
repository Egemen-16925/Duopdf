/**
 * Dokunmatik ekranda (Android) çok kelimelik seçim: uzun basıp tutamaçlarla seçim yapılınca `mouseup`
 * gelmez. Seçim bir süre değişmeden kalınca seçimin başladığı öğeye yapay bir `mouseup` gönderilir;
 * görüntüleyicilerin mevcut "seçimden kelime/cümle" akışı (pickFromPointer) aynen çalışır.
 */
const SETTLE_MS = 700;

export function installTouchSelection(): () => void {
  let timer: number | undefined;
  let lastText = "";

  const fire = () => {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || selection.rangeCount === 0) {
      lastText = "";
      return;
    }
    const text = selection.toString().trim();
    if (!text || text === lastText) return;
    lastText = text;
    const range = selection.getRangeAt(0);
    const target = range.startContainer instanceof Element ? range.startContainer : range.startContainer.parentElement;
    if (!target) return;
    const rect = range.getBoundingClientRect();
    target.dispatchEvent(
      new MouseEvent("mouseup", { bubbles: true, cancelable: true, button: 0, clientX: rect.left + 1, clientY: rect.top + rect.height / 2 }),
    );
  };

  const onChange = () => {
    window.clearTimeout(timer);
    timer = window.setTimeout(fire, SETTLE_MS);
  };

  document.addEventListener("selectionchange", onChange);
  return () => {
    window.clearTimeout(timer);
    document.removeEventListener("selectionchange", onChange);
  };
}

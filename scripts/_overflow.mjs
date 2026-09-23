/**
 * Horizontal-overflow check for the page walks in verify-p1 and verify-p3.
 *
 * Most participants are on phones. A page wider than the screen slides
 * sideways under the thumb and reads as broken, and it is invisible on a
 * desktop review. This loads each route at 360px — the design floor — and
 * reports any element whose right edge is past the viewport.
 *
 * It measures elements, not document.scrollWidth: globals.css clips overflow
 * on <body> as a safety net, so the page itself can no longer scroll sideways
 * and scrollWidth would always look fine. Content inside a deliberately
 * scrolling strip (the admin nav on phones) is not counted.
 */
export const PHONE = { width: 360, height: 780 };

export async function findOverflow(page) {
  return page.evaluate(() => {
    const vw = document.documentElement.clientWidth;
    const insideScroller = (el) => {
      for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
        const o = getComputedStyle(p).overflowX;
        if (o === "auto" || o === "scroll" || o === "hidden" || o === "clip") return true;
      }
      return false;
    };
    return [...document.querySelectorAll("body *")]
      .filter((el) => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0 && r.right > vw + 1 && !insideScroller(el);
      })
      .slice(0, 5)
      .map((el) => {
        const r = el.getBoundingClientRect();
        return `<${el.tagName.toLowerCase()}> ${Math.round(r.right - vw)}px over: "${(el.textContent ?? "").trim().slice(0, 40)}"`;
      });
  });
}

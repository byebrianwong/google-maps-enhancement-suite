// Reading and writing the text field a note goes into. Used for the note
// you are editing (content.ts) and for each note in a list (list-page.ts).

export function isEditable(el: Element): el is HTMLElement {
  if (el instanceof HTMLTextAreaElement) return !el.disabled && !el.readOnly;
  if (el instanceof HTMLInputElement) return ["text", "search", ""].includes(el.type) && !el.disabled && !el.readOnly;
  return el instanceof HTMLElement && el.isContentEditable;
}

export function isSearchBox(el: HTMLElement): boolean {
  return el instanceof HTMLInputElement && (el.name === "q" || el.id === "searchboxinput" || el.getAttribute("role") === "combobox");
}

// The focused element, looking inside shadow roots.
export function deepActiveElement(): Element | null {
  let active: Element | null = document.activeElement;
  while (active?.shadowRoot?.activeElement) active = active.shadowRoot.activeElement;
  return active;
}

export function readValue(el: HTMLElement): string {
  if (el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement) return el.value;
  return el.innerText;
}

// Types the text into the field the way a paste would, so the page's own
// code sees a normal edit and its Done/Save button picks it up.
export function writeValue(el: HTMLElement, text: string) {
  el.focus();
  if (el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement) {
    el.select();
    const ok = document.execCommand("insertText", false, text);
    if (!ok || el.value !== text) {
      const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto, "value")?.set?.call(el, text);
      el.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertReplacementText", data: text }));
    }
    el.dispatchEvent(new Event("change", { bubbles: true }));
    return;
  }
  const range = document.createRange();
  range.selectNodeContents(el);
  const sel = window.getSelection();
  sel?.removeAllRanges();
  sel?.addRange(range);
  if (!document.execCommand("insertText", false, text)) {
    el.innerText = text;
    el.dispatchEvent(new InputEvent("input", { bubbles: true }));
  }
}

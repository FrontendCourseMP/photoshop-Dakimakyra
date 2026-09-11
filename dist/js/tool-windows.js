// Независимые окна: без backdrop и без блокировки остальной страницы.
export class ToolWindows {
  constructor(entries, onActivate) {
    this.entries = entries;
    this.onActivate = onActivate;
    this.order = [];
    for (const [name, dialog] of Object.entries(entries)) {
      dialog.setAttribute("aria-modal", "false");
      const header = dialog.querySelector("header");
      const title = header.querySelector("h2");
      title.id = `${name}WindowTitle`;
      dialog.setAttribute("aria-labelledby", title.id);
      const fold = document.createElement("button");
      fold.type = "button";
      fold.className = "fold-window";
      fold.textContent = "−";
      fold.setAttribute("aria-label", "Свернуть окно");
      fold.setAttribute("aria-expanded", "true");
      header.insertBefore(fold, header.querySelector(".close-dialog"));
      fold.addEventListener("click", () => {
        const folded = dialog.dataset.folded !== "true";
        dialog.dataset.folded = String(folded);
        fold.textContent = folded ? "+" : "−";
        fold.setAttribute("aria-label", folded ? "Развернуть окно" : "Свернуть окно");
        fold.setAttribute("aria-expanded", String(!folded));
        const rect = dialog.getBoundingClientRect();
        this.place(dialog, rect.left, rect.top);
      });
      header.tabIndex = 0;
      header.title = "Перетащите окно за заголовок. Стрелки на клавиатуре тоже перемещают окно.";
      dialog.addEventListener("pointerdown", () => this.raise(name));
      dialog.addEventListener("focusin", () => this.raise(name));
      header.addEventListener("pointerdown", (event) => {
        if (event.button !== 0 || event.target.closest("button")) return;
        const rect = dialog.getBoundingClientRect();
        const offset = { x: event.clientX - rect.left, y: event.clientY - rect.top };
        header.setPointerCapture(event.pointerId);
        const move = (next) => this.place(dialog, next.clientX - offset.x, next.clientY - offset.y);
        const end = () => {
          header.removeEventListener("pointermove", move);
          header.removeEventListener("lostpointercapture", end);
        };
        header.addEventListener("pointermove", move);
        header.addEventListener("lostpointercapture", end);
        event.preventDefault();
      });
      header.addEventListener("keydown", (event) => {
        if (event.target !== header) return;
        const step = event.shiftKey ? 40 : 10;
        const delta = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[event.key];
        if (!delta) return;
        event.preventDefault();
        const rect = dialog.getBoundingClientRect();
        this.place(dialog, rect.left + delta[0], rect.top + delta[1]);
      });
    }
    window.addEventListener("resize", () => {
      Object.values(entries).filter((dialog) => dialog.open).forEach((dialog) => {
        const rect = dialog.getBoundingClientRect();
        this.place(dialog, rect.left, rect.top);
      });
    });
    window.addEventListener("keydown", (event) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      const name = this.order.findLast((item) => entries[item].open);
      if (name) {
        event.preventDefault();
        entries[name].dispatchEvent(new Event("cancel", { cancelable: true }));
      }
    });
  }

  place(dialog, x, y) {
    dialog.style.left = `${Math.max(8, Math.min(x, innerWidth - dialog.offsetWidth - 8))}px`;
    dialog.style.top = `${Math.max(8, Math.min(y, innerHeight - dialog.offsetHeight - 8))}px`;
  }

  raise(name) {
    this.order = this.order.filter((item) => item !== name);
    this.order.push(name);
    this.order.forEach((item, index) => { this.entries[item].style.zIndex = String(30 + index); });
    this.onActivate(name);
  }

  open(name) {
    const dialog = this.entries[name];
    if (!dialog.open) {
      dialog.dataset.folded = "false";
      const fold = dialog.querySelector(".fold-window");
      fold.textContent = "−";
      fold.setAttribute("aria-label", "Свернуть окно");
      fold.setAttribute("aria-expanded", "true");
      dialog.show();
      const slot = Object.keys(this.entries).indexOf(name);
      this.place(dialog, 24 + slot * Math.min(340, innerWidth / 4), 105 + slot * 36);
    }
    this.raise(name);
  }
}

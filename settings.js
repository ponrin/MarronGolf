"use strict";

(function () {
  const sheet = document.getElementById("settings");
  const openBtn = document.getElementById("settings-open");
  if (!sheet || !openBtn) return;

  const erase = document.getElementById("golflab-erase");
  const hint = document.getElementById("golflab-hint");
  const eraseSlot = document.getElementById("settings-erase-slot");
  const hintSlot = document.getElementById("settings-hint-slot");
  if (erase && eraseSlot) {
    eraseSlot.textContent = "";
    eraseSlot.appendChild(erase);
  }
  if (hint && hintSlot) hintSlot.appendChild(hint);

  let back = null;
  const isOpen = () => sheet.classList.contains("is-open");
  function open() {
    back = document.activeElement;
    sheet.classList.add("is-open");
    openBtn.setAttribute("aria-expanded", "true");
    const c = sheet.querySelector(".settings-close");
    if (c) c.focus();
  }
  function close() {
    if (!isOpen()) return;
    sheet.classList.remove("is-open");
    openBtn.setAttribute("aria-expanded", "false");
    if (back && typeof back.focus === "function") back.focus();
    back = null;
  }

  openBtn.addEventListener("click", () => (isOpen() ? close() : open()));
  for (const el of sheet.querySelectorAll("[data-settings-close]")) el.addEventListener("click", close);
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") close(); });

  const topbar = typeof GolfLabTopbar !== "undefined" ? GolfLabTopbar : null;
  for (const r of sheet.querySelectorAll('input[name="topbar"]')) {
    r.checked = !!topbar && topbar.mode() === r.value;
    r.disabled = !topbar;
    r.addEventListener("change", () => { if (r.checked && topbar) topbar.set(r.value); });
  }

  const ask = document.getElementById("golflab-ask");
  if (ask && typeof MutationObserver === "function") {
    new MutationObserver(() => { if (!ask.hidden) close(); }).observe(ask, { attributes: true, attributeFilter: ["hidden"] });
  }
})();

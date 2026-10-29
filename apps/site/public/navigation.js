(() => {
  const menu = document.querySelector("[data-mobile-navigation]");
  const summary = menu?.querySelector("summary");
  function markLocation() {
    const current = ["", "#seitenanfang", "#inhalt"].includes(
      window.location.hash,
    )
      ? "#ueberblick"
      : window.location.hash;
    for (const link of document.querySelectorAll(
      "[data-section-navigation] a",
    )) {
      if (new URL(link.href).hash === current)
        link.setAttribute("aria-current", "location");
      else link.removeAttribute("aria-current");
    }
  }
  markLocation();
  window.addEventListener("hashchange", markLocation);
  if (!menu) return;
  document.addEventListener("click", (event) => {
    if (
      !menu.contains(event.target) ||
      (event.target instanceof Element && event.target.closest("nav a"))
    )
      menu.open = false;
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && menu.open) {
      menu.open = false;
      summary?.focus();
    }
  });
  window
    .matchMedia("(min-width: 1024px)")
    .addEventListener("change", (event) => {
      if (event.matches) menu.open = false;
    });
})();

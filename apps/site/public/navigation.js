(() => {
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
})();

// Negotiate only the neutral entry point, before rendering its English fallback.
(() => {
  let saved;
  try {
    saved = localStorage.getItem("xobject-language");
  } catch {}
  if (location.pathname === "/") {
    const first = (
      navigator.languages?.[0] ||
      navigator.language ||
      "en"
    ).toLowerCase();
    const lang =
      saved === "de" || saved === "en"
        ? saved
        : first.startsWith("de")
          ? "de"
          : "en";
    location.replace("/" + lang + "/" + location.search + location.hash);
  }
  document.addEventListener("click", (event) => {
    const link =
      event.target instanceof Element
        ? event.target.closest("a[data-language]")
        : null;
    if (!(link instanceof HTMLAnchorElement)) return;
    try {
      localStorage.setItem("xobject-language", link.dataset.language);
    } catch {}
    if (/^\/(en|de)\/$/.test(location.pathname) && location.hash)
      link.hash = location.hash;
  });
})();

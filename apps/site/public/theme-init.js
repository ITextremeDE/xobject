try {
  const stored = localStorage.getItem("xobject-theme");
  document.documentElement.dataset.theme = ["light", "dark"].includes(stored)
    ? stored
    : "system";
} catch {
  document.documentElement.dataset.theme = "system";
}

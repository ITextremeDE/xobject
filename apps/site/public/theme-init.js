const root = document.documentElement;
const systemTheme = window.matchMedia("(prefers-color-scheme: dark)");
try {
  const stored = localStorage.getItem("xobject-theme");
  root.dataset.theme = ["light", "dark"].includes(stored) ? stored : "system";
} catch {
  root.dataset.theme = "system";
}
function applyTheme() {
  root.classList.toggle(
    "dark",
    root.dataset.theme === "dark" ||
      (root.dataset.theme === "system" && systemTheme.matches),
  );
}
applyTheme();
systemTheme.addEventListener("change", applyTheme);
document.addEventListener("xobject-theme-change", applyTheme);
window.addEventListener("storage", (event) => {
  if (event.key !== "xobject-theme") return;
  root.dataset.theme = ["light", "dark"].includes(event.newValue)
    ? event.newValue
    : "system";
  applyTheme();
});

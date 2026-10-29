const control = document.querySelector('#theme');
if (control) {
  control.value = document.documentElement.dataset.theme || 'system';
  control.addEventListener('change', () => {
    document.documentElement.dataset.theme = control.value;
    try { localStorage.setItem('xobject-theme', control.value); } catch {}
  });
}

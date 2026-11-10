(() => {
  const links = [...document.querySelectorAll('[data-section-navigation] a')];
  const sections = new Map();
  for (const link of links) {
    const url = new URL(link.href);
    if (url.pathname !== location.pathname || !url.hash) continue;
    const target = document.getElementById(decodeURIComponent(url.hash.slice(1)));
    if (target) {
      const section = sections.get(target) || [];
      section.push(link);
      sections.set(target, section);
    }
  }
  const targets = [...sections.keys()].sort((a, b) =>
    a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1,
  );
  if (!targets.length) return;
  let active;
  let scheduled = false;
  function update() {
    scheduled = false;
    const headerBottom = document.querySelector('.site-header')?.getBoundingClientRect().bottom || 0;
    const padding = parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop) || 0;
    const margin = parseFloat(getComputedStyle(targets[0]).scrollMarginTop) || 0;
    const line = Math.min(innerHeight - 1, Math.max(headerBottom + 24, padding + margin + 1));
    let current = targets[0];
    for (const target of targets) {
      if (target.getBoundingClientRect().top <= line) current = target;
    }
    if (scrollY + innerHeight >= document.documentElement.scrollHeight - 2)
      current = targets.at(-1);
    if (active === current) return;
    active = current;
    for (const link of links) link.removeAttribute('aria-current');
    for (const link of sections.get(current)) {
      link.setAttribute('aria-current', 'location');
      // Reveal the active item inside the mobile strip without moving the page.
      const strip = link.closest('.document-aside ul');
      if (strip && strip.scrollWidth > strip.clientWidth) {
        const item = link.getBoundingClientRect(), bounds = strip.getBoundingClientRect();
        if (item.left < bounds.left) strip.scrollLeft += item.left - bounds.left;
        else if (item.right > bounds.right) strip.scrollLeft += item.right - bounds.right;
      }
    }
  }
  function schedule() {
    if (!scheduled) { scheduled = true; requestAnimationFrame(update); }
  }
  update();
  addEventListener('scroll', schedule, { passive: true });
  addEventListener('resize', () => { active = undefined; schedule(); });
  addEventListener('hashchange', schedule);
  addEventListener('load', schedule);
  document.fonts?.ready.then(schedule);
})();

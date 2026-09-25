(() => {
  'use strict';
  const header = document.getElementById('site-header');
  if (!header) return;
  let compact = false;
  let scheduled = false;
  const measure = () => {
    document.documentElement.style.setProperty('--header-offset', `${Math.ceil(header.getBoundingClientRect().height)}px`);
  };
  const update = () => {
    const y = Math.max(0, window.scrollY);
    // Separate thresholds prevent flicker as the sticky header changes height.
    if (!compact && y > 120) compact = true;
    else if (compact && y <= 8) compact = false;
    header.classList.toggle('is-compact', compact);
    measure();
    scheduled = false;
  };
  const schedule = () => {
    if (!scheduled) {
      scheduled = true;
      window.requestAnimationFrame(update);
    }
  };
  window.addEventListener('scroll', schedule, { passive: true });
  window.addEventListener('resize', schedule, { passive: true });
  window.addEventListener('pageshow', schedule);
  header.addEventListener('transitionend', measure);
  if ('ResizeObserver' in window) new ResizeObserver(measure).observe(header);
  update();
})();

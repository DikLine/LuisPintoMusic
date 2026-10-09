/* Lightweight video previews; mount YouTube only after a visitor presses play. */
(() => {
  'use strict';

  document.querySelectorAll('.video-preview[data-video-src]').forEach(preview => {
    let activated = false;
    preview.setAttribute('role', 'button');

    preview.addEventListener('keydown', event => {
      if (event.key !== ' ') return;
      event.preventDefault();
      preview.click();
    });

    preview.addEventListener('click', event => {
      // Keep the ordinary link available for opening a separate tab.
      if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || event.button > 0) return;
      const container = preview.closest('.video-embed');
      if (!container || activated) return;

      let url;
      try {
        url = new URL(preview.dataset.videoSrc);
        if (url.origin !== 'https://www.youtube-nocookie.com' ||
            !/^\/embed\/[A-Za-z0-9_-]{11}$/.test(url.pathname)) return;
      } catch (_) { return; }

      event.preventDefault();
      activated = true;
      url.searchParams.set('autoplay', '1');
      const iframe = document.createElement('iframe');
      iframe.title = preview.dataset.videoTitle;
      iframe.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share';
      iframe.referrerPolicy = 'strict-origin-when-cross-origin';
      iframe.allowFullscreen = true;
      iframe.src = url.href;
      container.replaceChildren(iframe);
      iframe.focus();
    });
  });
})();

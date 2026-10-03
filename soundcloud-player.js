/* Luis Santiago Pinto — dark SoundCloud controls.
 * Audio and playlist data come from the official SoundCloud Widget API.
 * No API key, copied audio files, CSS filters or access to the iframe DOM.
 */
(() => {
  'use strict';

  const roots = document.querySelectorAll('[data-sc-player]');
  if (!roots.length) return;

  // This playlist's supplied 14-track catalogue, used only when the widget
  // returns IDs without titles/artwork for its lazily loaded rows. Live metadata
  // always takes precedence. Update this snapshot when changing playlist order.
  const catalogueSnapshot = [
    {
        "title": "Lone Knight",
        "artwork_url": "https://i1.sndcdn.com/artworks-ZYptpy8MMX6PTb2b-Kqg6ag-t200x200.png"
    },
    {
        "title": "Furiocity",
        "artwork_url": "https://i1.sndcdn.com/artworks-000298053645-qf70c8-t200x200.jpg"
    },
    {
        "title": "Swallowtail",
        "artwork_url": "https://i1.sndcdn.com/artworks-000303834264-33eggl-t200x200.jpg"
    },
    {
        "title": "Creepy Fun",
        "artwork_url": "https://i1.sndcdn.com/artworks-000306324894-ians0x-t200x200.jpg"
    },
    {
        "title": "Flight of a Lonely Bird",
        "artwork_url": "https://i1.sndcdn.com/artworks-000303850203-24nrv2-t200x200.jpg"
    },
    {
        "title": "Beyond The Impossible",
        "artwork_url": "https://i1.sndcdn.com/artworks-000502513545-zi4l0v-t200x200.jpg"
    },
    {
        "title": "By Candlelight Sonata",
        "artwork_url": "https://i1.sndcdn.com/artworks-zsfu0jkEG21nYwTR-SyMuyg-t200x200.jpg"
    },
    {
        "title": "Nebula",
        "artwork_url": "https://i1.sndcdn.com/artworks-000477343263-aesmsg-t200x200.jpg"
    },
    {
        "title": "Sympathetic Empathy",
        "artwork_url": "https://i1.sndcdn.com/artworks-000306316389-ornnt4-t200x200.jpg"
    },
    {
        "title": "Corsairs Dance Theme",
        "artwork_url": "https://i1.sndcdn.com/artworks-000298038750-u61ean-t200x200.jpg"
    },
    {
        "title": "Soulmates",
        "artwork_url": "https://i1.sndcdn.com/artworks-000501978579-mt6m4n-t200x200.jpg"
    },
    {
        "title": "Open Skies",
        "artwork_url": "https://i1.sndcdn.com/artworks-000501528714-4fzxaa-t200x200.jpg"
    },
    {
        "title": "Ocean Dance",
        "artwork_url": "https://i1.sndcdn.com/artworks-000501975186-14na9t-t200x200.jpg"
    },
    {
        "title": "Excidium",
        "artwork_url": "https://i1.sndcdn.com/artworks-000642200596-b2w773-t200x200.jpg"
    }
];

  function completeCatalogue(sounds) {
    const known = sounds.map((sound, index) => ({ sound, index })).filter(item => item.sound && item.sound.title);
    const matchesSnapshot = sounds.length === catalogueSnapshot.length && known.length >= 5 &&
      known.every(({ sound, index }) => sound.title === catalogueSnapshot[index].title);
    return sounds.map((sound, index) => {
      const track = { ...(sound || {}) };
      if (matchesSnapshot) {
        if (!track.title) track.title = catalogueSnapshot[index].title;
        if (!track.artwork_url) track.artwork_url = catalogueSnapshot[index].artwork_url;
      }
      return track;
    });
  }

  let apiPromise;
  function loadAPI() {
    if (window.SC && window.SC.Widget) return Promise.resolve(window.SC.Widget);
    if (apiPromise) return apiPromise;
    apiPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      const timer = setTimeout(() => reject(new Error('SoundCloud API timeout')), 15000);
      script.src = 'https://w.soundcloud.com/player/api.js';
      script.async = true;
      script.onload = () => {
        clearTimeout(timer);
        if (window.SC && window.SC.Widget) resolve(window.SC.Widget);
        else reject(new Error('SoundCloud API unavailable'));
      };
      script.onerror = () => {
        clearTimeout(timer);
        reject(new Error('SoundCloud API unavailable'));
      };
      document.head.append(script);
    });
    return apiPromise;
  }

  function time(milliseconds) {
    const seconds = Math.max(0, Math.floor((Number(milliseconds) || 0) / 1000));
    const minutes = Math.floor(seconds / 60);
    return `${minutes}:${String(seconds % 60).padStart(2, '0')}`;
  }

  function safeURL(value, domain) {
    if (typeof value !== 'string' || !value) return '';
    try {
      const url = new URL(value, 'https://soundcloud.com');
      if (url.protocol !== 'https:') return '';
      return url.hostname === domain || url.hostname.endsWith(`.${domain}`) ? url.href : '';
    } catch (_) { return ''; }
  }

  function initialise(root) {
    if (root.dataset.scStarted) return;
    root.dataset.scStarted = 'true';

    const find = selector => root.querySelector(selector);
    const iframe = find('iframe.soundcloud-player');
    const ui = find('.sc-interface');
    const list = find('.sc-track-list');
    const title = find('.sc-title a');
    const artist = find('.sc-artist');
    const cover = find('.sc-cover-image');
    const play = find('.sc-play');
    const previous = find('.sc-previous');
    const next = find('.sc-next');
    const seek = find('.sc-seek');
    const volume = find('.sc-volume-input');
    const elapsed = find('.sc-elapsed');
    const durationText = find('.sc-duration');
    const waveform = find('.sc-waveform');
    const status = find('.sc-status');
    const note = find('.sc-fallback-note');
    const back = find('.sc-custom-toggle');
    const playlistURL = find('.sc-source').href;
    const defaultArtist = artist.textContent;
    const defaultArtistURL = artist.href;

    let widget;
    let tracks = [];
    let rows = [];
    let currentIndex = -1;
    let pendingIndex = null;
    let duration = 0;
    let position = 0;
    let playing = false;
    let scrubbing = false;
    let ready = false;
    let failed = false;
    let nativeMode = false;
    let syncVersion = 0;
    let stateVersion = 0;
    let actionVersion = 0;
    let seekHoldUntil = 0;
    let requestTimer;
    let waveformRequest;
    let waveformKey = '';
    const waveformCache = new Map();
    const readyTimer = setTimeout(() => fallback('The custom player could not load. Use the SoundCloud player below.', true), 25000);

    function announce(message, visible = false) {
      status.textContent = message;
      status.classList.toggle('sc-sr-only', !visible);
    }

    function fallback(message, isError = false) {
      clearTimeout(readyTimer);
      clearTimeout(requestTimer);
      if (isError) failed = true;
      nativeMode = true;
      root.classList.remove('sc-ready');
      ui.hidden = true;
      iframe.removeAttribute('aria-hidden');
      iframe.removeAttribute('tabindex');
      iframe.removeAttribute('inert');
      iframe.loading = 'eager';
      note.querySelector('span').textContent = message;
      note.hidden = false;
      back.hidden = !ready || failed;
    }

    function showCustom() {
      if (!ready || failed) return;
      nativeMode = false;
      note.hidden = true;
      ui.hidden = false;
      iframe.setAttribute('aria-hidden', 'true');
      iframe.setAttribute('tabindex', '-1');
      iframe.setAttribute('inert', '');
      root.classList.add('sc-ready');
      syncCurrent();
      syncPlaying();
    }

    function updateImage(image, value) {
      const url = safeURL(value, 'sndcdn.com');
      if (!url) {
        image.hidden = true;
        image.removeAttribute('src');
        return;
      }
      if (image.getAttribute('src') === url) return;
      image.hidden = false;
      image.src = url;
      image.onerror = () => { image.hidden = true; };
    }

    function trackTitle(track, index) {
      return track.title || `Track ${index + 1}`;
    }

    function renderList() {
      list.replaceChildren();
      rows = tracks.map((track, index) => {
        const item = document.createElement('li');
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'sc-track';
        const number = document.createElement('span');
        number.className = 'sc-track-number';
        number.textContent = String(index + 1).padStart(2, '0');
        number.setAttribute('aria-hidden', 'true');
        const art = document.createElement('span');
        art.className = 'sc-track-art';
        art.setAttribute('aria-hidden', 'true');
        const img = document.createElement('img');
        img.alt = '';
        img.loading = 'lazy';
        img.width = 32;
        img.height = 32;
        art.append(img);
        const name = document.createElement('span');
        name.className = 'sc-track-title';
        const length = document.createElement('span');
        length.className = 'sc-track-duration';
        length.setAttribute('aria-hidden', 'true');
        button.append(number, art, name, length);
        button.addEventListener('click', () => selectTrack(index));
        item.append(button);
        list.append(item);
        return { button, name, img, length };
      });
      tracks.forEach((track, index) => updateRow(index));
      find('.sc-track-count').textContent = `Production Music · ${tracks.length} ${tracks.length === 1 ? 'track' : 'tracks'}`;
    }

    function updateRow(index) {
      const row = rows[index];
      if (!row) return;
      const track = tracks[index];
      const selected = index === currentIndex;
      row.name.textContent = trackTitle(track, index);
      row.length.textContent = track.duration > 0 ? time(track.duration) : '';
      row.button.setAttribute('aria-label', `${selected && playing ? 'Pause' : 'Play'} ${trackTitle(track, index)}`);
      if (selected) row.button.setAttribute('aria-current', 'true');
      else row.button.removeAttribute('aria-current');
      updateImage(row.img, track.artwork_url || (track.user && track.user.avatar_url));
    }

    function setPlaying(value) {
      playing = Boolean(value);
      ui.classList.toggle('is-playing', playing);
      const label = playing ? 'Pause' : 'Play';
      play.setAttribute('aria-label', label);
      play.title = label;
      if (currentIndex >= 0) updateRow(currentIndex);
    }

    function syncPlaying() {
      if (!widget || failed) return;
      const version = ++stateVersion;
      widget.isPaused(paused => {
        if (version === stateVersion && !failed) setPlaying(!paused);
      });
    }

    function updatePosition(value) {
      position = Math.max(0, Math.min(Number(value) || 0, duration || 0));
      if (scrubbing || Date.now() < seekHoldUntil) return;
      seek.value = String(Math.floor(position / 1000));
      elapsed.textContent = time(position);
      seek.setAttribute('aria-valuetext', `${time(position)} of ${time(duration)}`);
      waveform.style.setProperty('--sc-progress', `${duration ? 100 * position / duration : 0}%`);
    }

    function setDuration(value) {
      duration = Math.max(0, Number(value) || 0);
      seek.max = String(Math.max(1, Math.ceil(duration / 1000)));
      seek.disabled = duration <= 0;
      durationText.textContent = duration ? time(duration) : '–:––';
      updatePosition(position);
    }

    // Optional genuine waveform. If SoundCloud does not supply one, the normal
    // seek bar remains available; no decorative/fabricated waveform is shown.
    function renderWaveform(samples) {
      const count = Math.min(180, samples.length);
      const peak = Math.max(1, ...samples);
      let path = '';
      for (let i = 0; i < count; i++) {
        const start = Math.floor(i * samples.length / count);
        const end = Math.max(start + 1, Math.floor((i + 1) * samples.length / count));
        let sample = 0;
        for (let j = start; j < end; j++) sample = Math.max(sample, samples[j]);
        const height = Math.max(2, sample / peak * 38);
        path += `M${i * 4} ${40 - height}h2v${height}h-2Z`;
      }
      const svgNS = 'http://www.w3.org/2000/svg';
      const svg = document.createElementNS(svgNS, 'svg');
      svg.setAttribute('viewBox', `0 0 ${count * 4} 40`);
      svg.setAttribute('preserveAspectRatio', 'none');
      const bars = document.createElementNS(svgNS, 'path');
      bars.setAttribute('d', path);
      svg.append(bars);
      const played = svg.cloneNode(true);
      played.classList.add('sc-wave-played');
      waveform.replaceChildren(svg, played);
      waveform.hidden = false;
    }

    async function updateWaveform(track) {
      const url = safeURL(track.waveform_url, 'sndcdn.com');
      if (url === waveformKey) return;
      waveformKey = url;
      if (waveformRequest) waveformRequest.abort();
      waveform.hidden = true;
      waveform.replaceChildren();
      if (!url || !/\.json(?:\?|$)/.test(url)) return;
      if (waveformCache.has(url)) {
        renderWaveform(waveformCache.get(url));
        return;
      }
      const controller = new AbortController();
      waveformRequest = controller;
      const timeout = setTimeout(() => controller.abort(), 6000);
      try {
        const response = await fetch(url, { signal: controller.signal, credentials: 'omit' });
        if (!response.ok) return;
        const data = await response.json();
        const samples = data.samples;
        if (!Array.isArray(samples) || !samples.length || samples.length > 20000 ||
            !samples.every(sample => Number.isFinite(sample) && sample >= 0)) return;
        waveformCache.set(url, samples);
        if (waveformKey === url && !controller.signal.aborted) renderWaveform(samples);
      } catch (_) {
        // Waveform loading is optional and must never interrupt playback.
      } finally { clearTimeout(timeout); }
    }

    function showTrack(index, sound) {
      const oldIndex = currentIndex;
      const changed = index !== currentIndex;
      currentIndex = index;
      tracks[index] = { ...tracks[index], ...sound };
      const track = tracks[index];
      const name = trackTitle(track, index);
      title.textContent = name;
      artist.textContent = track.user && track.user.username || defaultArtist;
      artist.href = safeURL(track.user && track.user.permalink_url, 'soundcloud.com') || defaultArtistURL;
      root.querySelectorAll('[data-sc-track-link]').forEach(link => {
        link.href = safeURL(track.permalink_url, 'soundcloud.com') || playlistURL;
      });
      find('.sc-cover').setAttribute('aria-label', `Open ${name} on SoundCloud`);
      updateImage(cover, track.artwork_url || (track.user && track.user.avatar_url));
      previous.disabled = index <= 0;
      next.disabled = index >= tracks.length - 1;
      if (changed) {
        position = 0;
        seekHoldUntil = 0;
        scrubbing = false;
        announce(`Selected: ${name}`);
      }
      setDuration(track.duration);
      updateRow(oldIndex);
      updateRow(index);
      updateWaveform(track);
      if (changed && !nativeMode) {
        const row = rows[index].button;
        const rowTop = row.getBoundingClientRect().top - list.getBoundingClientRect().top + list.scrollTop;
        if (rowTop < list.scrollTop) list.scrollTop = rowTop;
        else if (rowTop + row.offsetHeight > list.scrollTop + list.clientHeight) {
          list.scrollTop = rowTop + row.offsetHeight - list.clientHeight;
        }
      }
    }

    function syncCurrent() {
      if (!widget || !ready || failed) return;
      const version = ++syncVersion;
      widget.getCurrentSoundIndex(index => {
        if (version !== syncVersion || failed || !Number.isInteger(index) || !tracks[index]) return;
        if (pendingIndex !== null && index !== pendingIndex) return;
        widget.getCurrentSound(sound => {
          if (version !== syncVersion || failed || !sound) return;
          // A late metadata response must not overwrite a newer track selection.
          if (tracks[index].id && sound.id && String(tracks[index].id) !== String(sound.id)) return;
          pendingIndex = null;
          showTrack(index, sound);
          widget.getDuration(value => {
            if (version !== syncVersion || currentIndex !== index) return;
            setDuration(value);
            if (value > 0) tracks[index].duration = value;
            updateRow(index);
          });
          widget.getPosition(value => {
            if (version === syncVersion && currentIndex === index) updatePosition(value);
          });
        });
      });
    }

    function verifyAction(version) {
      [150, 600, 1500].forEach(delay => setTimeout(() => {
        if (version !== actionVersion || failed) return;
        syncCurrent();
        syncPlaying();
      }, delay));
    }

    function watchPlayback(version) {
      clearTimeout(requestTimer);
      requestTimer = setTimeout(() => {
        if (version !== actionVersion || failed) return;
        widget.isPaused(paused => {
          if (version !== actionVersion || !paused) return;
          pendingIndex = null;
          setPlaying(false);
          announce('Playback has not started. Press Play again, or choose “Use SoundCloud player”.', true);
        });
      }, 7000);
    }

    function togglePlayback() {
      if (!ready || failed) return;
      const version = ++actionVersion;
      announce('');
      if (playing) {
        clearTimeout(requestTimer);
        widget.pause();
      } else {
        if (duration && position >= duration - 100) widget.seekTo(0);
        widget.play();
        watchPlayback(version);
      }
      verifyAction(version);
    }

    function selectTrack(index) {
      if (!ready || failed || index < 0 || index >= tracks.length) return;
      if (index === currentIndex && pendingIndex === null) return togglePlayback();
      const version = ++actionVersion;
      ++syncVersion;
      pendingIndex = index;
      announce(`Loading ${trackTitle(tracks[index], index)}…`);
      widget.skip(index);
      widget.play();
      watchPlayback(version);
      verifyAction(version);
    }

    play.addEventListener('click', togglePlayback);
    previous.addEventListener('click', () => selectTrack((pendingIndex ?? currentIndex) - 1));
    next.addEventListener('click', () => selectTrack((pendingIndex ?? currentIndex) + 1));
    volume.addEventListener('input', () => {
      if (ready && !failed) widget.setVolume(Number(volume.value));
    });
    seek.addEventListener('input', () => {
      scrubbing = true;
      const value = Math.min(Number(seek.value) * 1000, duration);
      elapsed.textContent = time(value);
      seek.setAttribute('aria-valuetext', `${time(value)} of ${time(duration)}`);
      waveform.style.setProperty('--sc-progress', `${duration ? 100 * value / duration : 0}%`);
    });
    seek.addEventListener('change', () => {
      scrubbing = false;
      if (!ready || failed) return;
      position = Math.min(Number(seek.value) * 1000, duration);
      seekHoldUntil = Date.now() + 750;
      widget.seekTo(position);
    });
    find('.sc-native-toggle').addEventListener('click', () => {
      fallback('Using the SoundCloud player.');
      back.focus();
    });
    back.addEventListener('click', () => {
      showCustom();
      play.focus();
    });

    iframe.loading = 'eager';
    loadAPI().then(Widget => {
      if (failed) return;
      widget = Widget(iframe);
      const events = Widget.Events;
      widget.bind(events.ERROR, () => fallback('SoundCloud could not play this track. Try the player below or open the playlist on SoundCloud.', true));
      widget.bind(events.PLAY, () => {
        if (failed) return;
        announce('');
        syncCurrent();
        syncPlaying();
      });
      widget.bind(events.PAUSE, syncPlaying);
      widget.bind(events.FINISH, () => {
        setPlaying(false);
        // Multi-track widgets advance themselves. Calling next() here skips twice.
        verifyAction(++actionVersion);
      });
      widget.bind(events.PLAY_PROGRESS, event => {
        if (pendingIndex !== null || failed) return;
        updatePosition(event.currentPosition);
      });
      widget.bind(events.SEEK, event => {
        if (pendingIndex === null && !failed) updatePosition(event.currentPosition);
        syncPlaying();
      });
      widget.bind(events.READY, () => {
        if (ready || failed) return;
        widget.getSounds(sounds => {
          if (ready || failed) return;
          if (!Array.isArray(sounds) || !sounds.length) {
            fallback('The playlist could not load. Use the SoundCloud player below.', true);
            return;
          }
          tracks = completeCatalogue(sounds);
          renderList();
          ready = true;
          clearTimeout(readyTimer);
          showCustom();
          widget.getVolume(value => {
            if (Number.isFinite(Number(value))) volume.value = String(value);
          });
        });
      });
    }).catch(() => fallback('The custom player could not load. Use the SoundCloud player below.', true));
  }

  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        observer.unobserve(entry.target);
        initialise(entry.target);
      });
    }, { rootMargin: '600px' });
    roots.forEach(root => observer.observe(root));
  } else roots.forEach(initialise);
})();

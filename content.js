let overlay = null;
let catUrl = null;
let isVisible = false;

function isContextValid() {
  return !!chrome.runtime?.id;
}

async function findCatUrl() {
  for (const name of ['cat.png', 'cat.jpg', 'cat.jpeg']) {
    if (!isContextValid()) return null;
    let url;
    try { url = chrome.runtime.getURL(name); } catch (_) { return null; }
    const found = await new Promise(resolve => {
      const img = new Image();
      img.onload = () => resolve(url);
      img.onerror = () => resolve(null);
      img.src = url;
    });
    if (found) return found;
  }
  return null;
}

async function getOrCreateOverlay() {
  if (overlay) return overlay;

  catUrl = catUrl ?? await findCatUrl();
  if (!catUrl) return null;

  overlay = document.createElement('div');
  overlay.style.cssText = [
    'position: fixed',
    'left: 200px',
    'bottom: -600px',
    'z-index: 2147483647',
    'pointer-events: none',
    'transition: bottom 1.2s ease',
    'margin: 0',
    'padding: 0',
    'border: none',
    'background: none'
  ].join(' !important;') + ' !important;';

  const img = document.createElement('img');
  img.src = catUrl;
  img.style.cssText = [
    'display: block',
    'max-height: 500px',
    'max-width: 500px',
    'margin: 0',
    'padding: 0',
    'border: none'
  ].join(' !important;') + ' !important;';

  overlay.appendChild(img);
  (document.body ?? document.documentElement).appendChild(overlay);
  return overlay;
}

async function showCat() {
  if (isVisible) return;
  isVisible = true;
  const el = await getOrCreateOverlay();
  if (!el) return;
  // Trigger reflow so the transition plays from the hidden position
  el.getBoundingClientRect();
  el.style.setProperty('bottom', '0px', 'important');
}

function hideCat() {
  if (!overlay || !isVisible) return;
  isVisible = false;
  overlay.style.setProperty('bottom', '-600px', 'important');
}

function safeSend(msg) {
  if (!chrome.runtime?.id) return;
  try {
    chrome.runtime.sendMessage(msg).catch(() => {});
  } catch (_) {}
}

// Listen for show/hide commands from the background service worker
chrome.runtime.onMessage.addListener((msg) => {
  if (!isContextValid()) return;
  try {
    if (msg.type === 'SHOW_CAT') showCat();
    if (msg.type === 'HIDE_CAT') hideCat();
  } catch (_) {}
});

// Tell the background this page has loaded
safeSend({ type: 'PAGE_LOADED', url: location.href });

// Pause/resume the timer when the tab loses or gains focus
document.addEventListener('visibilitychange', () => {
  safeSend({ type: 'VISIBILITY_CHANGE', hidden: document.hidden });
});

const DEFAULTS = { sites: 'reddit.com;x.com', timing: '2' };

async function getSettings() {
  const d = await chrome.storage.sync.get(DEFAULTS);
  return {
    sites: d.sites.split(';').map(s => s.trim().toLowerCase()).filter(Boolean),
    timingMs: Math.max(1, parseInt(d.timing) || 2) * 60 * 1000
  };
}

async function loadState() {
  const d = await chrome.storage.session.get({ tabs: {}, catVisible: false });
  return { tabs: d.tabs, catVisible: d.catVisible };
}

async function saveState(tabs, catVisible) {
  await chrome.storage.session.set({ tabs, catVisible });
}

function matchesSite(url, sites) {
  try {
    const host = new URL(url).hostname.replace(/^www\./, '');
    return sites.some(s => host === s || host.endsWith('.' + s));
  } catch { return false; }
}

async function broadcastAll(msg) {
  const tabs = await chrome.tabs.query({});
  await Promise.allSettled(tabs.map(t => chrome.tabs.sendMessage(t.id, msg).catch(() => {})));
}

async function scheduleAlarm(tabId, ms) {
  const delayInMinutes = Math.max(1 / 60, ms / 60000);
  await chrome.alarms.create(`orion_${tabId}`, { delayInMinutes });
}

// --- Alarm: timer completed for a monitored tab ---
chrome.alarms.onAlarm.addListener(async (alarm) => {
  const m = alarm.name.match(/^orion_(\d+)$/);
  if (!m) return;
  const tabId = parseInt(m[1]);

  let { tabs, catVisible } = await loadState();
  const tab = tabs[tabId];
  if (!tab) return;

  // Verify the tab is still active (guards against SW suspension edge cases)
  const activeTabs = await chrome.tabs.query({ active: true });
  if (!activeTabs.some(t => t.id === tabId)) {
    // Tab went to background while SW was suspended — save elapsed and bail
    if (tab.isActive) {
      tab.elapsed += Date.now() - tab.lastActiveAt;
      tab.isActive = false;
      tab.lastActiveAt = null;
      await saveState(tabs, catVisible);
    }
    return;
  }

  tab.timerDone = true;
  tab.isActive = false;
  catVisible = true;
  await saveState(tabs, catVisible);
  await broadcastAll({ type: 'SHOW_CAT' });
});

// --- Messages from content scripts ---
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  handleMsg(msg, sender).then(() => sendResponse({})).catch(console.error);
  return true;
});

async function handleMsg(msg, sender) {
  const tabId = sender.tab?.id;
  if (!tabId) return;

  const settings = await getSettings();
  let { tabs, catVisible } = await loadState();

  if (msg.type === 'PAGE_LOADED') {
    await chrome.alarms.clear(`orion_${tabId}`);

    const monitored = matchesSite(msg.url, settings.sites);
    const oldState = tabs[tabId];
    const wasTriggered = oldState?.timerDone ?? false;

    tabs[tabId] = { monitored, elapsed: 0, lastActiveAt: null, isActive: false, timerDone: false };

    // If this tab previously had the cat triggered and is now on a non-monitored page, hide the cat
    if (wasTriggered && !monitored && catVisible) {
      const anyOtherTriggered = Object.entries(tabs).some(
        ([id, t]) => parseInt(id) !== tabId && t.timerDone
      );
      if (!anyOtherTriggered) {
        catVisible = false;
        await saveState(tabs, catVisible);
        await broadcastAll({ type: 'HIDE_CAT' });
        return;
      }
    }

    await saveState(tabs, catVisible);

    // Sync current cat visibility to this newly loaded tab
    if (catVisible) {
      chrome.tabs.sendMessage(tabId, { type: 'SHOW_CAT' }).catch(() => {});
    }

    // Start timer if this tab is currently the active tab and is monitored
    if (monitored) {
      const activeTabs = await chrome.tabs.query({ active: true });
      if (activeTabs.some(t => t.id === tabId)) {
        tabs[tabId].isActive = true;
        tabs[tabId].lastActiveAt = Date.now();
        await saveState(tabs, catVisible);
        await scheduleAlarm(tabId, settings.timingMs);
      }
    }
    return;
  }

  if (msg.type === 'VISIBILITY_CHANGE') {
    const tab = tabs[tabId];
    if (!tab?.monitored) return;

    if (msg.hidden) {
      // Pause the timer — do NOT hide the cat, it stays visible on all other tabs
      if (tab.isActive) {
        await chrome.alarms.clear(`orion_${tabId}`);
        tab.elapsed += Date.now() - tab.lastActiveAt;
        tab.isActive = false;
        tab.lastActiveAt = null;
        await saveState(tabs, catVisible);
      }

    } else {
      // Tab came to foreground
      if (tab.timerDone) {
        // Timer already done — ensure cat is globally visible
        if (!catVisible) {
          catVisible = true;
          await saveState(tabs, catVisible);
          await broadcastAll({ type: 'SHOW_CAT' });
        }
      } else {
        // Resume the countdown
        const remaining = settings.timingMs - tab.elapsed;
        if (remaining <= 0) {
          tab.timerDone = true;
          catVisible = true;
          await saveState(tabs, catVisible);
          await broadcastAll({ type: 'SHOW_CAT' });
        } else {
          tab.isActive = true;
          tab.lastActiveAt = Date.now();
          await saveState(tabs, catVisible);
          await scheduleAlarm(tabId, remaining);
        }
      }
    }
    return;
  }
}

// --- Tab closed: clean up and hide cat if needed ---
chrome.tabs.onRemoved.addListener(async (tabId) => {
  let { tabs, catVisible } = await loadState();
  if (!tabs[tabId]) return;

  await chrome.alarms.clear(`orion_${tabId}`);
  const wasDone = tabs[tabId].timerDone;
  delete tabs[tabId];

  if (wasDone && catVisible) {
    const anyActive = Object.values(tabs).some(t => t.timerDone && t.isActive);
    if (!anyActive) {
      catVisible = false;
      await saveState(tabs, catVisible);
      await broadcastAll({ type: 'HIDE_CAT' });
      return;
    }
  }
  await saveState(tabs, catVisible);
});

// --- First install: write defaults ---
chrome.runtime.onInstalled.addListener(async () => {
  const existing = await chrome.storage.sync.get({ sites: null });
  if (!existing.sites) {
    await chrome.storage.sync.set(DEFAULTS);
  }
});

const DEFAULTS = { sites: 'reddit.com;x.com', timing: '2' };

async function load() {
  const data = await chrome.storage.sync.get(DEFAULTS);
  document.getElementById('sites').value = data.sites;
  document.getElementById('timing').value = data.timing;
}

document.getElementById('save').addEventListener('click', async () => {
  const sites = document.getElementById('sites').value.trim();
  const timing = parseInt(document.getElementById('timing').value);
  const status = document.getElementById('status');

  if (!timing || timing < 1) {
    status.textContent = 'Enter a valid number of minutes (minimum 1).';
    status.className = 'err';
    return;
  }

  await chrome.storage.sync.set({ sites, timing: timing.toString() });

  status.textContent = 'Saved!';
  status.className = 'ok';
  setTimeout(() => { status.textContent = ''; status.className = ''; }, 2000);
});

load();

(() => {
const {
  WINDOWS_DOWNLOAD_URL = null,
  GITHUB_URL = null,
  CHROME_WEB_STORE_URL = null,
} = window.PULSE_SITE_URLS || {};

const destinations = {
  download: WINDOWS_DOWNLOAD_URL,
  github: GITHUB_URL,
  chrome: CHROME_WEB_STORE_URL,
};

for (const link of document.querySelectorAll('[data-destination]')) {
  const url = destinations[link.dataset.destination];
  if (typeof url === 'string' && /^https:\/\//i.test(url)) {
    link.href = url;
    link.removeAttribute('aria-disabled');
    link.classList.remove('is-disabled');
  } else {
    link.removeAttribute('href');
    link.setAttribute('aria-disabled', 'true');
    link.classList.add('is-disabled');
    link.addEventListener('click', (event) => event.preventDefault());
  }
}

if (GITHUB_URL) {
  document.getElementById('repository-status').textContent = 'Source, issues and contribution notes.';
}
if (WINDOWS_DOWNLOAD_URL) {
  document.getElementById('release-status').textContent = 'A Windows release is available.';
  document.getElementById('download-status').textContent = 'Windows installer available';
}
if (CHROME_WEB_STORE_URL) {
  document.getElementById('extension-status').textContent = 'Published in the Chrome Web Store';
}
})();

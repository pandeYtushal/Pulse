(() => {
const {
  WINDOWS_DOWNLOAD_URL = null,
  WINDOWS_RELEASE_AVAILABLE = false,
  GITHUB_URL = null,
} = window.PULSE_SITE_URLS || {};

const destinations = {
  download: WINDOWS_DOWNLOAD_URL,
  github: GITHUB_URL,
};

const isDestinationAllowed = (url) =>
  typeof url === 'string' && /^https:\/\//i.test(url);

for (const link of document.querySelectorAll('[data-destination]')) {
  const url = destinations[link.dataset.destination];
  if (isDestinationAllowed(url)) {
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
if (WINDOWS_RELEASE_AVAILABLE) {
  document.getElementById('release-status').textContent = 'The Windows installer is available.';
  document.getElementById('download-status').textContent = 'Windows installer available';
} else {
  document.getElementById('release-status').textContent = 'The Windows installer will be available with the first public release.';
  document.getElementById('download-status').textContent = 'No public installer release yet';
}
})();

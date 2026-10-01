// Keep public destinations centralized. The Releases page is real, but has no
// published installer yet; switch the download URL to the exact latest asset
// only after a release containing Pulse-Setup.exe has been published.
window.PULSE_SITE_URLS = Object.freeze({
  WINDOWS_DOWNLOAD_URL: 'https://github.com/pandeYtushal/Pulse/releases',
  WINDOWS_RELEASE_AVAILABLE: false,
  GITHUB_URL: 'https://github.com/pandeYtushal/Pulse',
});

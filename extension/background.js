const PULSE_ENDPOINT = 'http://127.0.0.1:40523/download-event';

// Cache to debounce similar events
const lastUpdateMap = new Map();

function sendToPulse(eventType, downloadItem) {
  const payload = {
    eventType,
    download: {
      id: downloadItem.id.toString(),
      filename: downloadItem.filename ? downloadItem.filename.split('\\').pop().split('/').pop() : 'Unknown',
      status: downloadItem.state, // 'in_progress', 'complete', 'interrupted'
      downloadedBytes: downloadItem.bytesReceived || 0,
      totalBytes: downloadItem.totalBytes > 0 ? downloadItem.totalBytes : null,
      speed: downloadItem.estimatedEndTime ? downloadItem.bytesReceived : null,
      source: 'browser',
      timestamp: Date.now(),
      paused: downloadItem.paused || false,
      canResume: downloadItem.canResume || false,
      error: downloadItem.error || null
    }
  };

  fetch(PULSE_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  }).catch(() => {
    // Pulse might not be running; ignore
  });
}

chrome.downloads.onCreated.addListener((downloadItem) => {
  sendToPulse('started', downloadItem);
});

chrome.downloads.onChanged.addListener((delta) => {
  chrome.downloads.search({ id: delta.id }, (results) => {
    if (results && results.length > 0) {
      const item = results[0];
      const now = Date.now();
      const last = lastUpdateMap.get(item.id) || 0;
      
      // Throttle updates to max 10 times a second to prevent flooding
      if (now - last > 100 || item.state !== 'in_progress') {
        sendToPulse('progress', item);
        lastUpdateMap.set(item.id, now);
      }
    }
  });
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'PULSE_WEB_NOTIFICATION') {
    fetch('http://127.0.0.1:40523/web-notification', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: Date.now().toString(),
        appName: message.url || 'Browser',
        title: message.title || '',
        body: message.body || '',
        timestamp: Date.now()
      })
    }).catch(() => {});
  }
});

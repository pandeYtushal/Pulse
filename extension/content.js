// To override window.Notification for the main page, we must inject a script into the DOM.
const script = document.createElement('script');
script.textContent = `
  const OriginalNotification = window.Notification;
  if (OriginalNotification) {
    function PulseNotification(title, options) {
      const notification = new OriginalNotification(title, options);
      
      window.postMessage({
        type: "PULSE_WEB_NOTIFICATION_PROXY",
        title: title,
        body: options ? options.body : "",
        icon: options ? options.icon : "",
        url: window.location.hostname
      }, "*");
      
      return notification;
    }
    
    Object.assign(PulseNotification, OriginalNotification);
    PulseNotification.prototype = OriginalNotification.prototype;
    window.Notification = PulseNotification;
  }
`;
(document.head || document.documentElement).appendChild(script);
script.remove();

// Listen for messages from the injected script and forward to the background service worker
window.addEventListener("message", (event) => {
  if (event.source !== window || !event.data || event.data.type !== "PULSE_WEB_NOTIFICATION_PROXY") {
    return;
  }
  
  try {
    chrome.runtime.sendMessage({
      type: "PULSE_WEB_NOTIFICATION",
      title: event.data.title,
      body: event.data.body,
      icon: event.data.icon,
      url: event.data.url
    });
  } catch (e) {
    console.error("[Pulse] Failed to forward notification to extension", e);
  }
});

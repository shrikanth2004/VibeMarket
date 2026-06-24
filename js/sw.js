// Service Worker for VibeMarket Push Notifications
// Handles push events and shows browser notifications

self.addEventListener('push', (event) => {
  if (!event.data) return;

  let payload = {};
  try {
    payload = event.data.json();
  } catch (e) {
    payload = { title: 'VibeMarket', body: event.data.text() };
  }

  const title = payload.title || 'VibeMarket';
  const options = {
    body: payload.body || payload.message || 'You have a new notification.',
    icon: '/media/icon-192.png',
    badge: '/media/icon-72.png',
    data: { url: payload.url || payload.link_url || '/' },
    vibrate: [200, 100, 200],
    tag: payload.tag || 'vibemarket-notif',
    renotify: true,
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// When user clicks the notification, open the relevant URL
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || '/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      // Focus existing window if already open
      for (const client of windowClients) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.focus();
          client.navigate(targetUrl);
          return;
        }
      }
      // Open new window
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});

// Cache basic assets on install (optional, improves offline experience)
self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(clients.claim());
});

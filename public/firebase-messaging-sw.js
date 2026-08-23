// Keep the worker install self-contained. These browser bundles are copied
// from the pinned Firebase dependency so PWA setup does not depend on a CDN.
importScripts('/firebase-sdk/firebase-app-compat.js');
importScripts('/firebase-sdk/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyCIGNYP8v40s5_AtNJFRaKUq1qsVAdkQlU",
  authDomain: "iba-written.firebaseapp.com",
  projectId: "iba-written",
  storageBucket: "iba-written.firebasestorage.app",
  messagingSenderId: "21122626093",
  appId: "1:21122626093:web:a5b59e1f6b2b5be8387ea4",
  measurementId: "G-YP37GC62XE"
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage(function(payload) {
  console.log('[firebase-messaging-sw] Background Message received:', payload);

  const notificationTitle = payload.data?.title || payload.notification?.title || 'IBA Written';
  const tag = payload.data?.tag;
  const notificationOptions = {
    body: payload.data?.body || payload.notification?.body || '',
    icon: '/icons/icon-192.png',
    badge: '/icons/badge-96.png',
    tag: tag || undefined,
    renotify: Boolean(tag),
    data: { url: payload.data?.url || '/notifications' }
  };

  return self.registration.showNotification(notificationTitle, notificationOptions);
});

self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  const requestedPath = event.notification.data?.url;
  const safePath = typeof requestedPath === 'string'
    && requestedPath.startsWith('/')
    && !requestedPath.startsWith('//')
    ? requestedPath
    : '/notifications';
  const targetUrl = new URL(safePath, self.location.origin).href;
  
  // Open the app or specific URL
  event.waitUntil(clients.matchAll({
    type: "window",
    includeUncontrolled: true
  }).then((clientList) => {
    // Try to focus existing window
    for (let i = 0; i < clientList.length; i++) {
      const client = clientList[i];
      if (client.url && 'focus' in client) {
        if ('navigate' in client) {
          return client.navigate(targetUrl).then(() => client.focus());
        }
        return client.focus();
      }
    }
    // Open new window
    if (clients.openWindow) {
      return clients.openWindow(targetUrl);
    }
  }));
});

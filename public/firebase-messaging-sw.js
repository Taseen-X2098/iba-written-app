importScripts('https://www.gstatic.com/firebasejs/10.0.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.0.0/firebase-messaging-compat.js');

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
  
  const notificationTitle = payload.notification?.title || 'New Notification';
  const notificationOptions = {
    body: payload.notification?.body,
    icon: payload.notification?.image || '/placeholder-icon.png',
    data: { url: payload.data?.url || '/notifications' }
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});

self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  const targetUrl = new URL(event.notification.data?.url || '/notifications', self.location.origin).href;
  
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

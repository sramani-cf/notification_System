// Import Firebase scripts
importScripts('https://www.gstatic.com/firebasejs/10.7.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.7.0/firebase-messaging-compat.js');

// Initialize the Firebase app in the service worker
// Use the same config as your web app
firebase.initializeApp({
  apiKey: "AIzaSyC_0URjdRBJAV_0x0F4q1K10ID7eJV_BtQ",
  authDomain: "notification-system-7b5b6.firebaseapp.com",
  projectId: "notification-system-7b5b6",
  storageBucket: "notification-system-7b5b6.firebasestorage.app",
  messagingSenderId: "1024557267709",
  appId: "1:1024557267709:web:de714ed1b703418b159c94"
});

// Retrieve an instance of Firebase Messaging
const messaging = firebase.messaging();

// Handle background messages
messaging.onBackgroundMessage((payload) => {
  console.log('[firebase-messaging-sw.js] Received background message:', payload);
  
  // Customize notification here
  const notificationTitle = payload.notification?.title || 'New Notification';
  const notificationOptions = {
    body: payload.notification?.body || 'You have a new notification',
    icon: payload.notification?.image || '/icon-192x192.png',
    badge: '/badge-72x72.png',
    tag: payload.data?.type || 'notification',
    data: {
      ...payload.data,
      clickAction: payload.fcmOptions?.link || payload.data?.clickAction || '/'
    },
    actions: [
      {
        action: 'view',
        title: 'View'
      },
      {
        action: 'dismiss',
        title: 'Dismiss'
      }
    ],
    requireInteraction: payload.data?.priority === 'urgent'
  };

  // Show the notification
  self.registration.showNotification(notificationTitle, notificationOptions);
});

// Handle notification click
self.addEventListener('notificationclick', (event) => {
  console.log('[firebase-messaging-sw.js] Notification click:', event);
  
  event.notification.close();
  
  const clickAction = event.notification.data?.clickAction || '/';
  
  if (event.action === 'view' || !event.action) {
    // Open or focus the app window
    event.waitUntil(
      clients.matchAll({ type: 'window', includeUncontrolled: true })
        .then((windowClients) => {
          // Check if there is already a window/tab open
          for (let i = 0; i < windowClients.length; i++) {
            const client = windowClients[i];
            if ('focus' in client) {
              client.focus();
              client.navigate(clickAction);
              return;
            }
          }
          // If no window/tab is open, open a new one
          if (clients.openWindow) {
            return clients.openWindow(clickAction);
          }
        })
    );
    
    // Send click tracking to backend
    if (event.notification.data?.notificationId) {
      fetch(`/api/push-notifications/${event.notification.data.notificationId}/clicked`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          url: clickAction,
          userAgent: navigator.userAgent
        })
      }).catch(console.error);
    }
  } else if (event.action === 'dismiss') {
    // Just close the notification
    console.log('Notification dismissed');
  }
});

// Handle notification close
self.addEventListener('notificationclose', (event) => {
  console.log('[firebase-messaging-sw.js] Notification closed:', event);
});

// Listen for messages from the main app
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'UPDATE_FIREBASE_CONFIG') {
    // Update Firebase config when received from the main app
    const config = event.data.config;
    firebase.initializeApp(config);
    console.log('[firebase-messaging-sw.js] Firebase config updated');
  }
});
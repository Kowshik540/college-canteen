// sw.js — CampusBites Service Worker for Push Notifications
const CACHE = "campusbites-v1";

self.addEventListener("install",  e => self.skipWaiting());
self.addEventListener("activate", e => e.waitUntil(clients.claim()));

// Push notification handler
self.addEventListener("push", event => {
  let data = { title: "CampusBites", body: "New order received!", icon: "/icon.png" };
  try { data = event.data.json(); } catch {}

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body:    data.body,
      icon:    data.icon || "/icon.png",
      badge:   "/icon.png",
      vibrate: [200, 100, 200],
      tag:     "campusbites-order",
      renotify: true,
      data:    { url: data.url || "/" },
      actions: [
        { action: "view",    title: "View Orders" },
        { action: "dismiss", title: "Dismiss"     },
      ],
    })
  );
});

// Notification click — open admin dashboard
self.addEventListener("notificationclick", event => {
  event.notification.close();
  if (event.action === "dismiss") return;
  event.waitUntil(
    clients.matchAll({ type: "window" }).then(list => {
      for (const client of list) {
        if (client.url.includes(self.location.origin) && "focus" in client) return client.focus();
      }
      return clients.openWindow("/");
    })
  );
});
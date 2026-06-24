/* eslint-disable */
// ===========================================================================
// Overseer service worker — handles PWA install + push notifications.
//
// Versioning: bump CACHE_NAME when you ship a new offline shell so old
// caches get purged on activate.
// ===========================================================================

const CACHE_NAME = 'overseer-v2'

// On install — pre-cache nothing for now (we want network-first behavior so
// edits push live without stale cache fights). Activate immediately so a
// freshly-installed SW takes control without a manual refresh.
self.addEventListener('install', (event) => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // Purge old caches from previous versions
      const keys = await caches.keys()
      await Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
      // Take control of all clients (open tabs) so they use the new SW.
      await self.clients.claim()
    })()
  )
})

// Network-first fetch strategy — always try the network, fall back to cache
// if offline. We DON'T cache API responses or anything dynamic; only the
// HTML shell, JS bundles, and static assets get an offline fallback.
self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  if (url.origin !== self.location.origin) return
  // Skip API routes — those need fresh data
  if (url.pathname.startsWith('/api/')) return

  event.respondWith(
    (async () => {
      try {
        const fresh = await fetch(req)
        // Cache the response for offline fallback (best-effort)
        try {
          const cache = await caches.open(CACHE_NAME)
          cache.put(req, fresh.clone())
        } catch (_) { /* noop */ }
        return fresh
      } catch (err) {
        // Offline → serve from cache if we have it
        const cached = await caches.match(req)
        if (cached) return cached
        throw err
      }
    })()
  )
})

// ─── Push notifications ────────────────────────────────────────────────────
//
// Fires when the push service delivers a message. The payload is a JSON blob
// the server constructed: { title, body, url?, icon?, badge?, tag? }.
// Falls back to a generic notification if the payload is missing or malformed
// (e.g. a "ping" push with no body).
self.addEventListener('push', (event) => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch (_) {
    data = { title: 'Overseer', body: event.data ? event.data.text() : '' }
  }

  const title = data.title || 'Overseer'
  const options = {
    body: data.body || '',
    icon: data.icon || '/logo.png',
    badge: data.badge || '/logo.png',
    tag: data.tag,                  // collapses duplicate notifications
    data: { url: data.url || '/' }, // forwarded to notificationclick below
    requireInteraction: false,
    vibrate: [120, 60, 120],
  }

  event.waitUntil(self.registration.showNotification(title, options))
})

// When the user taps a notification, focus an existing tab if we have one
// open on the target URL, otherwise open a new tab.
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const targetUrl = (event.notification.data && event.notification.data.url) || '/'

  event.waitUntil(
    (async () => {
      const allClients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      for (const client of allClients) {
        try {
          const clientUrl = new URL(client.url)
          // Prefer focusing an existing tab on the same origin (the URL
          // might be slightly different — we still want to use the open tab)
          if (clientUrl.origin === self.location.origin) {
            await client.focus()
            // Try to navigate the focused tab to the target URL
            if ('navigate' in client) {
              try { await client.navigate(targetUrl) } catch (_) { /* noop */ }
            }
            return
          }
        } catch (_) { /* noop */ }
      }
      // No existing tab → open a fresh one
      if (self.clients.openWindow) await self.clients.openWindow(targetUrl)
    })()
  )
})

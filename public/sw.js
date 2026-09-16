// Pages go network-first so a deploy shows up on the next open; everything else
// (hashed bundles, models, icons) is immutable per URL, so it's served from cache.
const CACHE = 'silhouetto-v1'

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(['./', 'manifest.webmanifest'])))
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  )
})

// The first visit loads its bundles and models before this worker controls the page, so
// the page hands over what it already fetched.
self.addEventListener('message', (event) => {
  const urls = event.data?.cache
  if (!Array.isArray(urls)) return
  event.waitUntil(
    caches.open(CACHE).then((cache) =>
      Promise.all(urls.map((url) => cache.match(url, { ignoreVary: true }).then((hit) => hit ?? cache.add(url).catch(() => {})))),
    ),
  )
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET' || new URL(request.url).origin !== location.origin) return

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone()
          caches.open(CACHE).then((cache) => cache.put('./', copy))
          return response
        })
        .catch(() => caches.match('./', { ignoreVary: true })),
    )
    return
  }

  event.respondWith(
    caches.match(request, { ignoreVary: true }).then(
      (hit) =>
        hit ??
        fetch(request).then((response) => {
          if (response.ok) {
            const copy = response.clone()
            caches.open(CACHE).then((cache) => cache.put(request, copy))
          }
          return response
        }),
    ),
  )
})

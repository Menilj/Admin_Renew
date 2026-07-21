// This file can remain empty, but it must exist and be registered 
// for browsers to recognize your website as an installable app.
self.addEventListener('fetch', (event) => {
  // Classic empty fetch handler to satisfy PWA installation requirements
});



// Configuration variables
const UPSTASH_REDIS_REST_URL = "https://complete-macaw-182307.upstash.io";
const UPSTASH_REDIS_REST_TOKEN = "ggAAAAAAAsgjAAIgcDKzSKKk8-7Fu15DWptsyelBao6ovIw3nb4xfBoYs756Ow";
const CACHE_TTL_SECONDS = 60; // How long to store data in Upstash

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

// Network interceptor proxy
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Checks for standard Firebase REST traffic
  const isFirebaseTraffic = url.host.includes("firebaseio.com") || url.host.includes("://googleapis.com");

  if (isFirebaseTraffic && event.request.method === "GET") {
    // Generate a unique URL cache key for Upstash Redis
    const cacheKey = encodeURIComponent(url.pathname + url.search);
    const redisGetUrl = `${UPSTASH_REDIS_REST_URL}/get/${cacheKey}`;

    event.respondWith(
      fetch(redisGetUrl, {
        headers: { Authorization: `Bearer ${UPSTASH_REDIS_REST_TOKEN}` }
      })
      .then((redisRes) => redisRes.json())
      .then((redisData) => {
        // Cache Hit: Instantly return cached Upstash data
        if (redisData.result) {
          return new Response(redisData.result, {
            headers: { 
              "Content-Type": "application/json",
              "X-Cache": "HIT-UPSTASH"
            }
          });
        }

        // Cache Miss: Fall back to pulling live data from Firebase
        return fetch(event.request).then((firebaseRes) => {
          return firebaseRes.text().then((textData) => {
            
            // Push fresh Firebase data to Upstash in the background
            const redisSetUrl = `${UPSTASH_REDIS_REST_URL}/set/${cacheKey}/EX/${CACHE_TTL_SECONDS}`;
            fetch(redisSetUrl, {
              method: "POST",
              headers: { Authorization: `Bearer ${UPSTASH_REDIS_REST_TOKEN}` },
              body: textData
            }).catch((err) => console.warn("Background Redis sync failed:", err));

            // Return live data to client app
            return new Response(textData, {
              status: firebaseRes.status,
              statusText: firebaseRes.statusText,
              headers: firebaseRes.headers
            });
          });
        });
      })
      .catch((err) => {
        // Absolute network safety fallback
        console.error("Redis proxy error, bypassing straight to live Firebase", err);
        return fetch(event.request);
      })
    );
  }
});


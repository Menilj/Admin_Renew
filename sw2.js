const UPSTASH_REDIS_REST_URL = "https://complete-macaw-182307.upstash.io";
const UPSTASH_REDIS_REST_TOKEN = "ggAAAAAAAsgjAAIgcDKzSKKk8-7Fu15DWptsyelBao6ovIw3nb4xfBoYs756Ow";

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // 1. Intercept only Firebase database requests (adjust host if using Firestore)
  if (url.host.includes("firebaseio.com") && event.request.method === "GET") {
    
    // Create a unique key for Redis based on the query path
    const cacheKey = encodeURIComponent(url.pathname + url.search);
    const redisGetUrl = `${UPSTASH_REDIS_REST_URL}/get/${cacheKey}`;

    event.respondWith(
      // 2. Check Upstash Redis cache first
      fetch(redisGetUrl, {
        headers: { Authorization: `Bearer ${UPSTASH_REDIS_REST_TOKEN}` }
      })
      .then((redisRes) => redisRes.json())
      .then((redisData) => {
        if (redisData.result) {
          // Cache Hit: Return data instantly from Redis
          return new Response(redisData.result, {
            headers: { "Content-Type": "application/json" }
          });
        }

        // Cache Miss: Fetch fresh data from the real Firebase database
        return fetch(event.request).then((firebaseRes) => {
          // Clone the response stream to read it and return it
          return firebaseRes.text().then((textData) => {
            
            // 3. Save to Upstash Redis in the background (Expires in 60 seconds)
            const redisSetUrl = `${UPSTASH_REDIS_REST_URL}/set/${cacheKey}/EX/60`;
            fetch(redisSetUrl, {
              method: "POST",
              headers: { Authorization: `Bearer ${UPSTASH_REDIS_REST_TOKEN}` },
              body: textData
            }).catch(err => console.error("Redis set error:", err));

            // Return the live data back to your Admin app immediately
            return new Response(textData, {
              status: firebaseRes.status,
              statusText: firebaseRes.statusText,
              headers: firebaseRes.headers
            });
          });
        });
      })
      .catch(() => {
        // Fallback safety: If Upstash fails or rates out, hit Firebase directly
        return fetch(event.request);
      })
    );
  }
});

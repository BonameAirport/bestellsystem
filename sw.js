// ─── SERVICE WORKER ──────────────────────────────────────
const CACHE_NAME = 'boname-v2';
const ORDERS_CACHE = 'boname-orders-v1';
const IMAGES_CACHE = 'boname-images-v1';

const STATIC_FILES = [
  '/',
  '/index.html',
  '/airside.html',
  '/lager.html',
  '/airside-lager.html',
  '/empfaenger.html',
  '/airside-empfaenger.html',
  '/inventur.html',
];

// Install
self.addEventListener('install', function(e){
  e.waitUntil(
    caches.open(CACHE_NAME).then(function(cache){
      return cache.addAll(STATIC_FILES);
    }).then(function(){
      return self.skipWaiting();
    })
  );
});

// Activate
self.addEventListener('activate', function(e){
  e.waitUntil(
    caches.keys().then(function(keys){
      return Promise.all(
        keys.filter(function(key){
          return key !== CACHE_NAME && key !== ORDERS_CACHE && key !== IMAGES_CACHE;
        }).map(function(key){ return caches.delete(key); })
      );
    }).then(function(){
      return self.clients.claim();
    })
  );
});

// Fetch
self.addEventListener('fetch', function(e){
  var url = e.request.url;

  // Supabase Storage images → Cache First
  if(url.includes('supabase.co/storage')){
    e.respondWith(
      caches.match(e.request).then(function(cached){
        if(cached) return cached;
        return fetch(e.request).then(function(response){
          if(response && response.ok){
            var clone = response.clone();
            caches.open(IMAGES_CACHE).then(function(cache){
              cache.put(e.request, clone);
            });
          }
          return response;
        }).catch(function(){
          return caches.match(e.request);
        });
      })
    );
    return;
  }

  // Supabase orders API → Network First, fallback to cache
  if(url.includes('supabase.co/rest/v1/orders')){
    e.respondWith(
      fetch(e.request.clone()).then(function(response){
        if(response && response.ok){
          var clone = response.clone();
          caches.open(ORDERS_CACHE).then(function(cache){
            cache.put(e.request, clone);
          });
        }
        return response;
      }).catch(function(){
        return caches.match(e.request).then(function(cached){
          if(cached) return cached;
          return new Response(JSON.stringify([]),{
            headers:{'Content-Type':'application/json'}
          });
        });
      })
    );
    return;
  }

  // Other Supabase API → Network First
  if(url.includes('supabase.co')){
    e.respondWith(
      fetch(e.request).catch(function(){
        return new Response(JSON.stringify({error:'Offline'}),{
          headers:{'Content-Type':'application/json'}
        });
      })
    );
    return;
  }

  // Static files → Cache First
  e.respondWith(
    caches.match(e.request).then(function(cached){
      if(cached) return cached;
      return fetch(e.request).then(function(response){
        if(response && response.status === 200 && e.request.method === 'GET'){
          var clone = response.clone();
          caches.open(CACHE_NAME).then(function(cache){
            cache.put(e.request, clone);
          });
        }
        return response;
      }).catch(function(){
        if(e.request.destination === 'document'){
          return caches.match('/index.html');
        }
      });
    })
  );
});

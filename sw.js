// ─── SERVICE WORKER ──────────────────────────────────────
const CACHE_NAME = 'boname-v1';
const STATIC_FILES = [
  '/',
  '/index.html',
  '/airside.html',
  '/lager.html',
  '/airside-lager.html',
  '/empfaenger.html',
  'https://fonts.googleapis.com/css2?family=Sora:wght@400;600;700;800&display=swap',
  'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js'
];

// Install – cache static files
self.addEventListener('install', function(e){
  e.waitUntil(
    caches.open(CACHE_NAME).then(function(cache){
      return cache.addAll(STATIC_FILES.filter(function(url){
        return !url.startsWith('https://fonts') && !url.startsWith('https://cdnjs');
      }));
    }).then(function(){
      return self.skipWaiting();
    })
  );
});

// Activate – delete old caches
self.addEventListener('activate', function(e){
  e.waitUntil(
    caches.keys().then(function(keys){
      return Promise.all(
        keys.filter(function(key){ return key !== CACHE_NAME; })
            .map(function(key){ return caches.delete(key); })
      );
    }).then(function(){
      return self.clients.claim();
    })
  );
});

// Fetch – Cache First for static, Network First for API
self.addEventListener('fetch', function(e){
  var url = e.request.url;

  // API requests → Network First
  if(url.includes('supabase.co')){
    e.respondWith(
      fetch(e.request).catch(function(){
        return new Response(JSON.stringify({error:'Offline – keine Verbindung'}),{
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
        // Offline fallback
        if(e.request.destination === 'document'){
          return caches.match('/index.html');
        }
      });
    })
  );
});

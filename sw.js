// ─────────────────────────────────────────────────────────────────
//  SERVICE WORKER – bona'me Bestellsystem
//  Version: v4 (nach Refactor – neue Dateistruktur)
//
//  Cache-Strategien:
//  - Static Files (HTML, JS, CSS)  → Cache First, Network Fallback
//  - Supabase API (orders, etc.)   → Network First, Cache Fallback
//  - Supabase Storage (Bilder)     → Cache First (lange gültig)
//  - Google Fonts                  → Cache First
// ─────────────────────────────────────────────────────────────────

const CACHE_VERSION    = 'boname-v4';
const CACHE_STATIC     = CACHE_VERSION + '-static';
const CACHE_API        = CACHE_VERSION + '-api';
const CACHE_IMAGES     = CACHE_VERSION + '-images';
const CACHE_FONTS      = CACHE_VERSION + '-fonts';

// Alle Caches dieser App
const ALL_CACHES = [CACHE_STATIC, CACHE_API, CACHE_IMAGES, CACHE_FONTS];

// ─── Static Files – werden beim Install gecacht ──────────────────
const STATIC_FILES = [
  '/',
  '/index.html',

  // ─── Bestellseiten ───
  '/airside.html',
  '/lager.html',
  '/airside-lager.html',

  // ─── Empfänger & Tools ───
  '/empfaenger.html',
  '/airside-empfaenger.html',
  '/inventur.html',
  '/dashboard.html',
  '/register.html',

  // ─── Core JS (Reihenfolge wie im HTML) ───
  '/config-base.js',
  '/config-airside-lager.js',
  '/config-lager.js',
  '/config-airside.js',
  '/app-core.js',
  '/admin.js',
  '/pdf-export.js',
  '/staff.js',
  '/app.js',

  // ─── PWA ───
  '/manifest.json',
];

// ─── INSTALL ─────────────────────────────────────────────────────
self.addEventListener('install', function(e){
  e.waitUntil(
    caches.open(CACHE_STATIC)
      .then(function(cache){
        // addAll schlägt fehl wenn eine Datei 404 – daher einzeln
        return Promise.allSettled(
          STATIC_FILES.map(function(url){
            return cache.add(url).catch(function(err){
              console.warn('[SW] Konnte nicht cachen:', url, err.message);
            });
          })
        );
      })
      .then(function(){
        console.log('[SW] Install abgeschlossen – v4');
        return self.skipWaiting();
      })
  );
});

// ─── ACTIVATE ────────────────────────────────────────────────────
// Alte Cache-Versionen löschen
self.addEventListener('activate', function(e){
  e.waitUntil(
    caches.keys()
      .then(function(keys){
        return Promise.all(
          keys
            .filter(function(key){
              // Lösche alles was nicht zur aktuellen Version gehört
              return !ALL_CACHES.includes(key);
            })
            .map(function(key){
              console.log('[SW] Alter Cache gelöscht:', key);
              return caches.delete(key);
            })
        );
      })
      .then(function(){
        console.log('[SW] Aktiviert – v4');
        return self.clients.claim();
      })
  );
});

// ─── FETCH ───────────────────────────────────────────────────────
self.addEventListener('fetch', function(e){
  var url = e.request.url;
  var method = e.request.method;

  // Nur GET cachen
  if(method !== 'GET') return;

  // ─── Google Fonts → Cache First ─────────────────────────────
  if(url.includes('fonts.googleapis.com') || url.includes('fonts.gstatic.com')){
    e.respondWith(cacheFirst(e.request, CACHE_FONTS));
    return;
  }

  // ─── Supabase Storage (Bilder) → Cache First (7 Tage) ────────
  if(url.includes('supabase.co/storage')){
    e.respondWith(cacheFirst(e.request, CACHE_IMAGES));
    return;
  }

  // ─── Supabase REST API → Network First ───────────────────────
  // Bestellungen, Artikel, Kontakte etc. → immer frisch vom Server
  // Bei Offline → Cache-Fallback
  if(url.includes('supabase.co/rest/v1')){
    e.respondWith(networkFirst(e.request, CACHE_API));
    return;
  }

  // ─── Supabase Auth → Network Only ────────────────────────────
  // Login/Token niemals cachen
  if(url.includes('supabase.co/auth')){
    e.respondWith(fetch(e.request).catch(function(){
      return new Response(
        JSON.stringify({ error: 'Offline – Login nicht möglich' }),
        { headers: { 'Content-Type': 'application/json' } }
      );
    }));
    return;
  }

  // ─── Static Files (HTML, JS, CSS) → Cache First ──────────────
  // Lokale Dateien kommen aus dem Cache, werden im Hintergrund aktualisiert
  if(url.includes(self.location.origin)){
    e.respondWith(staleWhileRevalidate(e.request));
    return;
  }

  // ─── Alles andere → Network ──────────────────────────────────
  e.respondWith(fetch(e.request));
});


// ─────────────────────────────────────────────────────────────────
//  CACHE-STRATEGIEN
// ─────────────────────────────────────────────────────────────────

/**
 * Cache First: Cache → Network → Cache aktualisieren
 * Gut für: Bilder, Fonts (selten geändert)
 */
function cacheFirst(request, cacheName){
  return caches.open(cacheName).then(function(cache){
    return cache.match(request).then(function(cached){
      if(cached) return cached;
      return fetch(request).then(function(response){
        if(response && response.ok){
          cache.put(request, response.clone());
        }
        return response;
      }).catch(function(){
        return new Response('Offline', { status: 503 });
      });
    });
  });
}

/**
 * Network First: Network → Cache → Fallback
 * Gut für: API-Calls (immer frische Daten wenn online)
 */
function networkFirst(request, cacheName){
  return fetch(request.clone())
    .then(function(response){
      if(response && response.ok){
        caches.open(cacheName).then(function(cache){
          cache.put(request, response.clone());
        });
      }
      return response;
    })
    .catch(function(){
      return caches.open(cacheName).then(function(cache){
        return cache.match(request).then(function(cached){
          if(cached) return cached;
          // Leeres Array für API-Calls zurückgeben wenn offline
          return new Response(JSON.stringify([]), {
            headers: { 'Content-Type': 'application/json' }
          });
        });
      });
    });
}

/**
 * Stale While Revalidate: Cache sofort zurückgeben,
 * im Hintergrund aktualisieren.
 * Gut für: HTML, JS, CSS (schnelles Laden + immer aktuell)
 */
function staleWhileRevalidate(request){
  return caches.open(CACHE_STATIC).then(function(cache){
    return cache.match(request).then(function(cached){
      var networkFetch = fetch(request).then(function(response){
        if(response && response.ok && request.method === 'GET'){
          cache.put(request, response.clone());
        }
        return response;
      }).catch(function(){
        return cached;
      });

      // Sofort aus Cache zurückgeben (oder auf Network warten)
      return cached || networkFetch;
    });
  });
}


// ─────────────────────────────────────────────────────────────────
//  BACKGROUND SYNC (Bestellungen offline senden)
// ─────────────────────────────────────────────────────────────────
// Falls eine Bestellung gesendet wird wenn offline,
// wird sie gespeichert und beim nächsten Online-Sein nachgesendet.

self.addEventListener('sync', function(e){
  if(e.tag === 'sync-orders'){
    e.waitUntil(syncPendingOrders());
  }
});

async function syncPendingOrders(){
  try {
    var db = await openDB();
    var pending = await getAll(db, 'pending_orders');
    for(var order of pending){
      try {
        var r = await fetch(order.url, {
          method: 'POST',
          headers: order.headers,
          body: order.body,
        });
        if(r.ok){
          await deleteRecord(db, 'pending_orders', order.id);
          console.log('[SW] Ausstehende Bestellung gesendet:', order.id);
        }
      } catch(err){
        console.warn('[SW] Sync fehlgeschlagen für:', order.id);
      }
    }
  } catch(e){
    console.warn('[SW] Background Sync nicht verfügbar');
  }
}

// ─── IndexedDB Helpers ───────────────────────────────────────────
function openDB(){
  return new Promise(function(resolve, reject){
    var req = indexedDB.open('boname-offline', 1);
    req.onupgradeneeded = function(e){
      e.target.result.createObjectStore('pending_orders', { keyPath: 'id', autoIncrement: true });
    };
    req.onsuccess = function(e){ resolve(e.target.result); };
    req.onerror = function(){ reject(req.error); };
  });
}

function getAll(db, store){
  return new Promise(function(resolve, reject){
    var tx = db.transaction(store, 'readonly');
    var req = tx.objectStore(store).getAll();
    req.onsuccess = function(){ resolve(req.result); };
    req.onerror = function(){ reject(req.error); };
  });
}

function deleteRecord(db, store, id){
  return new Promise(function(resolve, reject){
    var tx = db.transaction(store, 'readwrite');
    var req = tx.objectStore(store).delete(id);
    req.onsuccess = function(){ resolve(); };
    req.onerror = function(){ reject(req.error); };
  });
}

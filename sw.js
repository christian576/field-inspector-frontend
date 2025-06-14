// sw.js - Service Worker para Field Inspector Pro
const CACHE_NAME = 'field-inspector-v1.0.0';
const API_CACHE_NAME = 'field-inspector-api-v1.0.0';

// Archivos a cachear para funcionamiento offline
const urlsToCache = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png'
];

// Instalar Service Worker
self.addEventListener('install', event => {
  console.log('SW: Installing...');
  
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('SW: Caching app shell');
        return cache.addAll(urlsToCache);
      })
      .then(() => {
        console.log('SW: Installation complete');
        return self.skipWaiting();
      })
  );
});

// Activar Service Worker
self.addEventListener('activate', event => {
  console.log('SW: Activating...');
  
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME && cacheName !== API_CACHE_NAME) {
            console.log('SW: Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      console.log('SW: Activation complete');
      return self.clients.claim();
    })
  );
});

// Interceptar requests
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);
  
  // Solo manejar requests del mismo origen o de la API
  if (url.origin !== location.origin && !url.origin.includes('railway.app')) {
    return;
  }
  
  // Manejar requests de API
  if (url.pathname.startsWith('/api/') || url.hostname.includes('railway.app')) {
    event.respondWith(handleApiRequest(request));
    return;
  }
  
  // Manejar requests de archivos estáticos
  event.respondWith(handleStaticRequest(request));
});

// Manejar requests de API
async function handleApiRequest(request) {
  try {
    // Para GET requests, intentar cache-first
    if (request.method === 'GET') {
      const cachedResponse = await caches.match(request);
      
      if (cachedResponse && !navigator.onLine) {
        console.log('SW: Serving API from cache (offline):', request.url);
        return cachedResponse;
      }
      
      try {
        const networkResponse = await fetch(request);
        
        if (networkResponse.ok) {
          const cache = await caches.open(API_CACHE_NAME);
          cache.put(request, networkResponse.clone());
          console.log('SW: API response cached:', request.url);
        }
        
        return networkResponse;
      } catch (networkError) {
        if (cachedResponse) {
          console.log('SW: Network failed, serving from cache:', request.url);
          return cachedResponse;
        }
        throw networkError;
      }
    }
    
    // Para POST/PUT/DELETE, siempre intentar la red
    return await fetch(request);
    
  } catch (error) {
    console.error('SW: API request failed:', error);
    
    return new Response(
      JSON.stringify({
        success: false,
        error: 'Sin conexión. Los datos se guardarán localmente.',
        offline: true
      }),
      {
        status: 503,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
}

// Manejar requests de archivos estáticos
async function handleStaticRequest(request) {
  try {
    const cachedResponse = await caches.match(request);
    
    if (cachedResponse) {
      console.log('SW: Serving from cache:', request.url);
      return cachedResponse;
    }
    
    const networkResponse = await fetch(request);
    
    if (networkResponse.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, networkResponse.clone());
      console.log('SW: Cached new resource:', request.url);
    }
    
    return networkResponse;
    
  } catch (error) {
    console.error('SW: Static request failed:', error);
    
    if (request.destination === 'document') {
      const cachedResponse = await caches.match('/index.html');
      if (cachedResponse) {
        return cachedResponse;
      }
    }
    
    return new Response('Resource not available offline', { status: 503 });
  }
}

// Sincronización en background
self.addEventListener('sync', event => {
  console.log('SW: Background sync triggered:', event.tag);
  
  if (event.tag === 'background-sync-records') {
    event.waitUntil(syncOfflineRecords());
  }
});

// Función para sincronizar registros offline
async function syncOfflineRecords() {
  try {
    console.log('SW: Starting background sync of offline records');
    
    const clients = await self.clients.matchAll();
    clients.forEach(client => {
      client.postMessage({
        type: 'SYNC_START'
      });
    });
    
    // Simular sync (en producción sería real)
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    clients.forEach(client => {
      client.postMessage({
        type: 'SYNC_COMPLETE'
      });
    });
    
    console.log('SW: Background sync completed');
    
  } catch (error) {
    console.error('SW: Background sync failed:', error);
    
    const clients = await self.clients.matchAll();
    clients.forEach(client => {
      client.postMessage({
        type: 'SYNC_ERROR',
        error: error.message
      });
    });
  }
}

// Notificaciones push
self.addEventListener('push', event => {
  console.log('SW: Push message received');
  
  const options = {
    body: event.data ? event.data.text() : 'Nueva actualización disponible',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    vibrate: [100, 50, 100],
    data: {
      url: '/'
    },
    actions: [
      {
        action: 'open',
        title: 'Abrir App'
      },
      {
        action: 'close',
        title: 'Cerrar'
      }
    ]
  };
  
  event.waitUntil(
    self.registration.showNotification('Field Inspector', options)
  );
});

// Manejar clicks en notificaciones
self.addEventListener('notificationclick', event => {
  console.log('SW: Notification clicked');
  
  event.notification.close();
  
  if (event.action === 'open' || !event.action) {
    event.waitUntil(
      clients.openWindow(event.notification.data.url || '/')
    );
  }
});

// Manejar mensajes desde el cliente
self.addEventListener('message', event => {
  console.log('SW: Message received:', event.data);
  
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  
  if (event.data && event.data.type === 'REQUEST_SYNC') {
    self.registration.sync.register('background-sync-records');
  }
});

console.log('SW: Service Worker loaded');

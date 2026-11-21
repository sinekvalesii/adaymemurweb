const C="am-v3", K=["./","index.html","style.css","app.js","config.js","favicon.svg"];
self.addEventListener("install",e=>{self.skipWaiting();e.waitUntil(caches.open(C).then(c=>c.addAll(K)))});
self.addEventListener("activate",e=>e.waitUntil(self.clients.claim()));
self.addEventListener("fetch",e=>{if(e.request.method!=="GET")return;e.respondWith(fetch(e.request).then(r=>{if(r.ok&&new URL(e.request.url).origin===location.origin){const c=r.clone();caches.open(C).then(x=>x.put(e.request,c))}return r}).catch(()=>caches.match(e.request)))});
self.addEventListener("push",e=>{let d={};try{d=e.data.json()}catch{}e.waitUntil(self.registration.showNotification(d.title||"Aday Memur",{body:d.body||"",icon:"icon-512.png",badge:"favicon.svg",data:{url:d.url||"./"}}))});
self.addEventListener("notificationclick",e=>{e.notification.close();e.waitUntil(clients.openWindow(e.notification.data.url))});

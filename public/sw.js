/* CCA Auctions – Service Worker (Web Push) */

// Listen for push events from the server
self.addEventListener('push', (event) => {
    let data = {};
    try {
        data = event.data ? event.data.json() : {};
    } catch {
        data = { title: 'CCA Auctions', body: event.data ? event.data.text() : '' };
    }

    const title = data.title || 'CCA Auctions';
    const options = {
        body: data.body || 'New auction update.',
        icon: data.icon || '/icon.png',
        badge: '/icon.png',
        data: { url: data.url || '/' },
    };

    event.waitUntil(self.registration.showNotification(title, options));
});

// On notification click – focus or open the app
self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    const targetUrl = (event.notification.data && event.notification.data.url) || '/';
    event.waitUntil(
        clients
            .matchAll({ type: 'window', includeUncontrolled: true })
            .then((clientList) => {
                for (const client of clientList) {
                    if (client.url === targetUrl && 'focus' in client) {
                        return client.focus();
                    }
                }
                return clients.openWindow(targetUrl);
            })
    );
});

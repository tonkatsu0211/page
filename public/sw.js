self.addEventListener('push', function(event) {
  let data = { title: '通知', body: '新しいメッセージがあります。' };

  if (event.data) {
    try {
      data = event.data.json();
    } catch (e) {
      data.body = event.data.text();
    }
  }

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: 'https://y3sjh2.csb.app/fabicon.png?v=1',
      badge: 'https://y3sjh2.csb.app/fabicon.png?v=1',
      // 必要なら追加オプションもここに
      // vibrate: [200, 100, 200],
      // tag: 'chat-message',
      // renotify: true,
    })
  );
});

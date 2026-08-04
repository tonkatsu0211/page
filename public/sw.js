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
      icon: 'https://cdn.glitch.global/76a1f4d2-2815-4fbf-afcd-888d6db7e806/icon.ico?v=1749512639750',
      badge: 'https://cdn.glitch.global/76a1f4d2-2815-4fbf-afcd-888d6db7e806/icon.ico?v=1749512639750',
      // 必要なら追加オプションもここに
      // vibrate: [200, 100, 200],
      // tag: 'chat-message',
      // renotify: true,
    })
  );
});

/**
 * アプリケーションメイン
 */
let drawer = null;

// DOM読み込み完了時に初期化
document.addEventListener('DOMContentLoaded', function() {
    initializeApp();
});

function initializeApp() {
    const canvas = document.getElementById('canvas');
    if (!canvas) {
        console.error('Canvas element not found');
        return;
    }

    drawer = new Drawer(canvas);

    // 入力フィールドのイベントリスナー
    const textboxTop = document.getElementById('textboxTop');
    const textboxBottom = document.getElementById('textboxBottom');

    if (textboxTop) {
        textboxTop.addEventListener('input', onTextChange);
    }

    if (textboxBottom) {
        textboxBottom.addEventListener('input', onTextChange);
    }

    // フォント読み込み完了を待つ
    if (document.fonts) {
        document.fonts.ready.then(function() {
            console.log('Fonts loaded');
            drawer.refresh();
        });
    }

    // 初期描画
    onTextChange();
}

function onTextChange() {
    const textboxTop = document.getElementById('textboxTop');
    const textboxBottom = document.getElementById('textboxBottom');

    if (drawer && textboxTop && textboxBottom) {
        drawer.topText.value = textboxTop.value || '5000兆円';
        drawer.bottomText.value = textboxBottom.value || '欲しい！';
        drawer.refresh();
    }
}

// グローバル関数（HTMLから呼び出されるため）
function saveImage() {
    if (drawer) {
        drawer.saveImage();
    }
}

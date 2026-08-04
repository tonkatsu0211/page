/**
 * 定数定義
 */
const CONFIG = {
    CANVAS_WIDTH: 1500,
    CANVAS_HEIGHT: 290,
    TOP_TEXT: {
        FONT: 'notobk',
        FONT_SIZE: 100,
        INITIAL_X: 70,
        INITIAL_Y: 100,
        SKEW_X: -0.45
    },
    BOTTOM_TEXT: {
        FONT: 'notoserifbk',
        FONT_SIZE: 100,
        INITIAL_X: 250,
        INITIAL_Y: 230,
        SKEW_X: -0.45
    },
    STROKE_WIDTHS: {
        BLACK_OUTER: 22,
        SILVER_OUTER: 20,
        BLACK_MIDDLE: 16,
        GOLD: 10,
        BLACK_INNER: 6,
        WHITE: 6,
        RED: 4
    },
    //API_ENDPOINT: '/api/upload',
    RATE_LIMIT_MESSAGE_DURATION: 5000 // 5秒
};

/**
 * トースト通知を表示
 */
function showToast(message, type = 'info') {
    const toastContainer = document.getElementById('toast-container') || createToastContainer();
    
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    
    toastContainer.appendChild(toast);
    
    // アニメーション
    setTimeout(() => toast.classList.add('show'), 10);
    
    // 自動削除
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

function createToastContainer() {
    const container = document.createElement('div');
    container.id = 'toast-container';
    document.body.appendChild(container);
    return container;
}

/**
 * API呼び出し
 */
async function callAPI(url, data) {
    try {
        const headers = {
            'Content-Type': 'application/json; charset=utf-8'
        };
        
        // サーバーが発行したセッション情報を追加
        if (window.SESSION_ID && window.UPLOAD_TOKEN) {
            headers['X-Session-ID'] = window.SESSION_ID;
            headers['X-Upload-Token'] = window.UPLOAD_TOKEN;
        }
        
        const response = await fetch(url, {
            method: 'POST',
            headers: headers,
            body: JSON.stringify(data)
        });
        
        const result = await response.json();
        
        if (!response.ok) {
            throw new Error(result.error || `HTTP error! status: ${response.status}`);
        }
        
        return result;
    } catch (error) {
        console.error('API Error:', error);
        throw error;
    }
}

/**
 * Drawer クラス
 * キャンバス描画とユーザーインタラクションを管理
 */
class Drawer {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.ctx.lineJoin = 'round';
        this.ctx.lineCap = 'round';

        this.topText = new TopText(this.ctx);
        this.bottomText = new BottomText(this.ctx);

        this.useTransparent = true;
        this.isDragging = false;
        this.dragStartX = 0;
        this.dragStartTextX = 0;
        this.lastSaveTime = 0;

        this.initEventListeners();
        this.clear();
    }

    initEventListeners() {
        // マウスイベント
        this.canvas.addEventListener('mousedown', this.onMouseDown.bind(this));
        this.canvas.addEventListener('mousemove', this.onMouseMove.bind(this));
        this.canvas.addEventListener('mouseup', this.onMouseUp.bind(this));
        this.canvas.addEventListener('mouseleave', this.onMouseLeave.bind(this));

        // タッチイベント
        this.canvas.addEventListener('touchstart', this.onTouchStart.bind(this), { passive: false });
        this.canvas.addEventListener('touchmove', this.onTouchMove.bind(this), { passive: false });
        this.canvas.addEventListener('touchend', this.onTouchEnd.bind(this), { passive: false });
    }

    refresh() {
        this.clear();
        this.topText.draw();
        this.bottomText.draw();
    }

    clear() {
        this.ctx.setTransform(1, 0, 0, 1, 0, 0);
        if (!this.useTransparent) {
            this.ctx.fillStyle = 'white';
            this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        } else {
            this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        }
    }

    // マウス/タッチイベントハンドラ
    onMouseDown(e) {
        this.startDrag(e.clientX, e.clientY);
    }

    onMouseMove(e) {
        this.updateDrag(e.clientX, e.clientY);
        this.updateCursor(e.clientY);
    }

    onMouseUp(e) {
        this.endDrag();
    }

    onMouseLeave(e) {
        this.endDrag();
        document.body.style.cursor = 'auto';
    }

    onTouchStart(e) {
        e.preventDefault();
        const touch = e.touches[0];
        this.startDrag(touch.clientX, touch.clientY);
    }

    onTouchMove(e) {
        e.preventDefault();
        const touch = e.touches[0];
        this.updateDrag(touch.clientX, touch.clientY);
    }

    onTouchEnd(e) {
        e.preventDefault();
        this.endDrag();
    }

    startDrag(clientX, clientY) {
        const rect = this.canvas.getBoundingClientRect();
        const canvasY = clientY - rect.top;
        const bottomTextTop = this.topText.y;
        const bottomTextBottom = this.canvas.height;

        if (canvasY >= bottomTextTop && canvasY <= bottomTextBottom) {
            this.isDragging = true;
            this.dragStartX = clientX;
            this.dragStartTextX = this.bottomText.x;
        }
    }

    updateDrag(clientX, clientY) {
        if (this.isDragging) {
            const dx = clientX - this.dragStartX;
            this.bottomText.x = this.dragStartTextX + dx;
            this.refresh();
        }
    }

    updateCursor(clientY) {
        const rect = this.canvas.getBoundingClientRect();
        const canvasY = clientY - rect.top;
        const bottomTextTop = this.topText.y;
        const bottomTextBottom = this.canvas.height;

        if (canvasY >= bottomTextTop && canvasY <= bottomTextBottom) {
            document.body.style.cursor = 'move';
        } else {
            document.body.style.cursor = 'auto';
        }
    }

    endDrag() {
        this.isDragging = false;
        this.dragStartX = 0;
        this.dragStartTextX = 0;
    }

    async saveImage() {
        // レート制限チェック
        const now = Date.now();
        if (now - this.lastSaveTime < CONFIG.RATE_LIMIT_MESSAGE_DURATION) {
            showToast('連続して保存することはできません。少しお待ちください。', 'warning');
            return;
        }

        try {
            showToast('画像を生成中...', 'info');

            // 画像データの取得
            const width = Math.max(
                this.topText.x + this.topText.width,
                this.bottomText.x + this.bottomText.width
            );
            const height = this.canvas.height;

            const imageData = this.ctx.getImageData(0, 0, width, height);
            const tempCanvas = document.createElement('canvas');
            tempCanvas.width = imageData.width;
            tempCanvas.height = imageData.height;

            const tempCtx = tempCanvas.getContext('2d');
            tempCtx.putImageData(imageData, 0, 0);

            // PNG形式で取得
            const dataURL = tempCanvas.toDataURL('image/png');

            /*// サイレントモードのチェック
            const silentModeCheckbox = document.getElementById('silentMode');
            const isSilentMode = silentModeCheckbox && !silentModeCheckbox.checked;*/

            /*// サーバーに送信（サイレントモードでない場合のみ）
            if (!isSilentMode) {
                try {
                    const result = await callAPI(CONFIG.API_ENDPOINT, { data: dataURL });
                    showToast('画像を保存しました！', 'success');
                    this.lastSaveTime = now;
                } catch (apiError) {
                    console.error('API Error:', apiError);
                    showToast('サーバーへの保存に失敗しました', 'error');
                }
            } else {*/
                //showToast('サイレントモード：ローカルにのみ保存しました', 'info');
                this.lastSaveTime = now;
            //}

            // ローカルダウンロード
            this.downloadImage(tempCanvas);

        } catch (error) {
            console.error('Save Error:', error);
            showToast('画像の保存に失敗しました', 'error');
        }
    }

    downloadImage(canvas) {
        const link = document.createElement('a');
        link.href = canvas.toDataURL('image/png');
        link.download = `5000choyen_${Date.now()}.png`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }
}

/**
 * BottomText クラス
 * キャンバス下部に表示される銀色のテキスト
 */
class BottomText {
    constructor(ctx) {
        this.ctx = ctx;
        this.value = '';
        this.font = `${CONFIG.BOTTOM_TEXT.FONT_SIZE}px ${CONFIG.BOTTOM_TEXT.FONT}`;
        this.x = CONFIG.BOTTOM_TEXT.INITIAL_X;
        this.y = CONFIG.BOTTOM_TEXT.INITIAL_Y;
        this.width = 0;
    }

    draw() {
        this.ctx.font = this.font;
        this.ctx.setTransform(1, 0, CONFIG.BOTTOM_TEXT.SKEW_X, 1, 0, 0);

        // 黒色の外枠
        this.drawStroke('#000', 22, 5, 2);

        // 銀色のグラデーション（外枠）
        this.drawOuterSilverGradient();

        // 紺色の枠
        this.drawStroke('#10193A', 17, 0, 0);

        // 白色の枠
        this.drawStroke('#DDD', 8, 0, 0);

        // 紺色のグラデーション
        this.drawNavyGradient();

        // 銀色のグラデーション（塗り）
        this.drawInnerSilverGradient();

        // テキスト幅を計算
        this.width = this.ctx.measureText(this.value).width + 30;
    }

    drawStroke(color, lineWidth, offsetX, offsetY) {
        this.ctx.strokeStyle = color;
        this.ctx.lineWidth = lineWidth;
        this.ctx.strokeText(this.value, this.x + offsetX, this.y + offsetY);
    }

    drawOuterSilverGradient() {
        const grad = this.ctx.createLinearGradient(0, this.y - 80, 0, this.y + 18);
        grad.addColorStop(0, 'rgb(0,15,36)');
        grad.addColorStop(0.25, 'rgb(250,250,250)');
        grad.addColorStop(0.5, 'rgb(150,150,150)');
        grad.addColorStop(0.75, 'rgb(55,58,59)');
        grad.addColorStop(0.85, 'rgb(25,20,31)');
        grad.addColorStop(0.91, 'rgb(240,240,240)');
        grad.addColorStop(0.95, 'rgb(166,175,194)');
        grad.addColorStop(1, 'rgb(50,50,50)');
        this.ctx.strokeStyle = grad;
        this.ctx.lineWidth = 19;
        this.ctx.strokeText(this.value, this.x + 5, this.y + 2);
    }

    drawNavyGradient() {
        const grad = this.ctx.createLinearGradient(0, this.y - 80, 0, this.y);
        grad.addColorStop(0, 'rgb(16,25,58)');
        grad.addColorStop(0.03, 'rgb(255,255,255)');
        grad.addColorStop(0.08, 'rgb(16,25,58)');
        grad.addColorStop(0.2, 'rgb(16,25,58)');
        grad.addColorStop(1, 'rgb(16,25,58)');
        this.ctx.strokeStyle = grad;
        this.ctx.lineWidth = 7;
        this.ctx.strokeText(this.value, this.x, this.y);
    }

    drawInnerSilverGradient() {
        const grad = this.ctx.createLinearGradient(0, this.y - 80, 0, this.y);
        grad.addColorStop(0, 'rgb(245,246,248)');
        grad.addColorStop(0.15, 'rgb(255,255,255)');
        grad.addColorStop(0.35, 'rgb(195,213,220)');
        grad.addColorStop(0.5, 'rgb(160,190,201)');
        grad.addColorStop(0.51, 'rgb(160,190,201)');
        grad.addColorStop(0.52, 'rgb(196,215,222)');
        grad.addColorStop(1.0, 'rgb(255,255,255)');
        this.ctx.fillStyle = grad;
        this.ctx.fillText(this.value, this.x, this.y - 3);
    }
}

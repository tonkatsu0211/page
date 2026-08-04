/**
 * TopText クラス
 * キャンバス上部に表示される金色のテキスト
 */
class TopText {
    constructor(ctx) {
        this.ctx = ctx;
        this.value = '';
        this.font = `${CONFIG.TOP_TEXT.FONT_SIZE}px ${CONFIG.TOP_TEXT.FONT}`;
        this.x = CONFIG.TOP_TEXT.INITIAL_X;
        this.y = CONFIG.TOP_TEXT.INITIAL_Y;
        this.width = 0;
    }

    draw() {
        this.ctx.font = this.font;
        this.ctx.setTransform(1, 0, CONFIG.TOP_TEXT.SKEW_X, 1, 0, 0);

        // 黒色の外枠
        this.drawStroke('#000', CONFIG.STROKE_WIDTHS.BLACK_OUTER, 4, 4);

        // 銀色のグラデーション
        this.drawSilverGradient();

        // 黒色の中枠
        this.drawStroke('#000000', CONFIG.STROKE_WIDTHS.BLACK_MIDDLE, 0, 0);

        // 金色のグラデーション
        this.drawGoldGradient();

        // 黒色の内枠
        this.drawStroke('#000', CONFIG.STROKE_WIDTHS.BLACK_INNER, 2, -3);

        // 白色のハイライト
        this.drawStroke('#FFFFFF', CONFIG.STROKE_WIDTHS.WHITE, 0, -3);

        // 赤色のグラデーション（ストローク）
        this.drawRedStroke();

        // 赤色のグラデーション（塗り）
        this.drawRedFill();

        // テキスト幅を計算
        this.width = this.ctx.measureText(this.value).width + 30;
    }

    drawStroke(color, lineWidth, offsetX, offsetY) {
        this.ctx.strokeStyle = color;
        this.ctx.lineWidth = lineWidth;
        this.ctx.strokeText(this.value, this.x + offsetX, this.y + offsetY);
    }

    drawSilverGradient() {
        const grad = this.ctx.createLinearGradient(0, 24, 0, 122);
        grad.addColorStop(0.0, 'rgb(0,15,36)');
        grad.addColorStop(0.10, 'rgb(255,255,255)');
        grad.addColorStop(0.18, 'rgb(55,58,59)');
        grad.addColorStop(0.25, 'rgb(55,58,59)');
        grad.addColorStop(0.5, 'rgb(200,200,200)');
        grad.addColorStop(0.75, 'rgb(55,58,59)');
        grad.addColorStop(0.85, 'rgb(25,20,31)');
        grad.addColorStop(0.91, 'rgb(240,240,240)');
        grad.addColorStop(0.95, 'rgb(166,175,194)');
        grad.addColorStop(1, 'rgb(50,50,50)');
        this.ctx.strokeStyle = grad;
        this.ctx.lineWidth = CONFIG.STROKE_WIDTHS.SILVER_OUTER;
        this.ctx.strokeText(this.value, this.x + 4, this.y + 4);
    }

    drawGoldGradient() {
        const grad = this.ctx.createLinearGradient(0, 20, 0, 100);
        grad.addColorStop(0, 'rgb(253,241,0)');
        grad.addColorStop(0.25, 'rgb(245,253,187)');
        grad.addColorStop(0.4, 'rgb(255,255,255)');
        grad.addColorStop(0.75, 'rgb(253,219,9)');
        grad.addColorStop(0.9, 'rgb(127,53,0)');
        grad.addColorStop(1, 'rgb(243,196,11)');
        this.ctx.strokeStyle = grad;
        this.ctx.lineWidth = CONFIG.STROKE_WIDTHS.GOLD;
        this.ctx.strokeText(this.value, this.x, this.y);
    }

    drawRedStroke() {
        const grad = this.ctx.createLinearGradient(0, 20, 0, 100);
        grad.addColorStop(0, 'rgb(255, 100, 0)');
        grad.addColorStop(0.5, 'rgb(123, 0, 0)');
        grad.addColorStop(0.51, 'rgb(240, 0, 0)');
        grad.addColorStop(1, 'rgb(5, 0, 0)');
        this.ctx.lineWidth = CONFIG.STROKE_WIDTHS.RED;
        this.ctx.strokeStyle = grad;
        this.ctx.strokeText(this.value, this.x, this.y - 3);
    }

    drawRedFill() {
        const grad = this.ctx.createLinearGradient(0, 20, 0, 100);
        grad.addColorStop(0, 'rgb(230, 0, 0)');
        grad.addColorStop(0.5, 'rgb(123, 0, 0)');
        grad.addColorStop(0.51, 'rgb(240, 0, 0)');
        grad.addColorStop(1, 'rgb(5, 0, 0)');
        this.ctx.fillStyle = grad;
        this.ctx.fillText(this.value, this.x, this.y - 3);
    }
}

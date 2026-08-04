window.onerror = function(msg, url, line, col, error) {
    debugLog("ERROR: " + msg + " at " + line + ":" + col);
};  

const DROP_SPEED = 1000;
const BLOCK_SIZE = 30;
const PLAY_SCREEN_WIDTH = 10;
const PLAY_SCREEN_HEIGHT = 20;
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const CANVAS_WIDTH = BLOCK_SIZE * PLAY_SCREEN_WIDTH;
const CANVAS_HEIGHT = BLOCK_SIZE * PLAY_SCREEN_HEIGHT;
canvas.width = CANVAS_WIDTH;
canvas.height = CANVAS_HEIGHT;
const TET_SIZE = 4;
const TETRO_SHAPES = {
I: [
[0,0,0,0],
[1,1,1,1],
[0,0,0,0],
[0,0,0,0]
],
J: [
[0,0,1,0],
[0,0,1,0],
[0,1,1,0],
[0,0,0,0]
],
L: [
[0,1,0,0],
[0,1,0,0],
[0,1,1,0],
[0,0,0,0]
],
O: [
[0,0,0,0],
[0,1,1,0],
[0,1,1,0],
[0,0,0,0]
],
S: [
[0,0,0,0],
[0,0,1,1],
[0,1,1,0],
[0,0,0,0]
],
Z: [
[0,0,0,0],
[1,1,0,0],
[0,1,1,0],
[0,0,0,0]
],
T: [
[0,0,0,0],
[1,1,1,0],
[0,1,0,0],
[0,0,0,0]
]
};
const tetColors = { I:'#0FF', J:'#00F', L:'#F80', O:'#AA0', S:'#0F0', Z:'#F00', T:'#A0F' };
class Bag {
constructor() {
this.bag = [];
}
next() {
if (this.bag.length === 0) {
this.bag = ['I','O','T','S','Z','J','L'];
for (let i = this.bag.length - 1; i > 0; i--) {
const j = Math.floor(Math.random() * (i + 1));
[this.bag[i], this.bag[j]] = [this.bag[j], this.bag[i]];
}
}
return this.bag.pop();
}
}
const bag = new Bag();
let nextQueue = [];
const NEXT_COUNT = 5;
let holdPiece = null;
let canHold = true;
let current = null;
const SCREEN = [];
let timerId = NaN;
let isGameOver = false;
let lockDelay = 0;
const LOCK_DELAY_MAX = 500;
let DAS_SETTINGS = { DAS: 150, ARR: 50, SDF: 50, DCD: 100 };
let inputState = { left:false, right:false, soft:false };
let holdTimers = { left:0, right:0 };
let lastTime = performance.now();
const SRS = {
JLSTZ: {
'0>R': [[0,0],[-1,0],[-1,1],[0,-2],[-1,-2]],
'R>0': [[0,0],[1,0],[1,-1],[0,2],[1,2]],
'R>2': [[0,0],[1,0],[1,-1],[0,2],[1,2]],
'2>R': [[0,0],[-1,0],[-1,1],[0,-2],[-1,-2]],
'2>L': [[0,0],[1,0],[1,1],[0,-2],[1,-2]],
'L>2': [[0,0],[-1,0],[-1,-1],[0,2],[-1,2]],
'L>0': [[0,0],[-1,0],[-1,-1],[0,2],[-1,2]],
'0>L': [[0,0],[1,0],[1,1],[0,-2],[1,-2]]
},
I: {
'0>R': [[0,0],[-2,0],[1,0],[-2,-1],[1,2]],
'R>0': [[0,0],[2,0],[-1,0],[2,1],[-1,-2]],
'R>2': [[0,0],[-1,0],[2,0],[-1,2],[2,-1]],
'2>R': [[0,0],[1,0],[-2,0],[1,-2],[-2,1]],
'2>L': [[0,0],[2,0],[-1,0],[2,1],[-1,-2]],
'L>2': [[0,0],[-2,0],[1,0],[-2,-1],[1,2]],
'L>0': [[0,0],[1,0],[-2,0],[1,-2],[-2,1]],
'0>L': [[0,0],[-1,0],[2,0],[-1,2],[2,-1]]
}
};
const rotateMatrix = (m, dir) => {
const n = [];
for (let y = 0; y < TET_SIZE; y++) {
n[y] = [];
for (let x = 0; x < TET_SIZE; x++) {
if (dir === 1) n[y][x] = m[TET_SIZE - 1 - x][y];
else n[y][x] = m[x][TET_SIZE - 1 - y];
}
}
return n;
};
const createPiece = (type) => {
const matrix = JSON.parse(JSON.stringify(TETRO_SHAPES[type]));
return { type, matrix, x: Math.floor(PLAY_SCREEN_WIDTH/2 - TET_SIZE/2), y:0, rot:0 };
};
const spawnNext = () => {
while (nextQueue.length < NEXT_COUNT) nextQueue.push(bag.next());
const type = nextQueue.shift();
current = createPiece(type);
while (nextQueue.length < NEXT_COUNT) nextQueue.push(bag.next());
canHold = true;
lockDelay = 0;
if (!canMove(0,0,current.matrix,current.x,current.y)) {
isGameOver = true;
clearInterval(timerId);
}
};
const hold = () => {
if (!canHold) return;
if (!holdPiece) {
holdPiece = current.type;
spawnNext();
} else {
const tmp = holdPiece;
holdPiece = current.type;
current = createPiece(tmp);
}
canHold = false;
lockDelay = 0;
};
const getGhostY = (piece) => {
let gy = piece.y;
while (!collide(piece.matrix,piece.x,gy+1)) gy++;
return gy;
};
const collide = (matrix,x,y) => {
for (let py = 0; py < TET_SIZE; py++) {
for (let px = 0; px < TET_SIZE; px++) {
if (matrix[py][px]) {
const nx = x + px;
const ny = y + py;
if (nx < 0 || ny < 0 || nx >= PLAY_SCREEN_WIDTH || ny >= PLAY_SCREEN_HEIGHT) return true;
if (SCREEN[ny][nx]) return true;
}
}
}
return false;
};
const canMove = (moveX, moveY, newTet = current ? current.matrix : null, x = current ? current.x : 0, y = current ? current.y : 0) => {
if (!newTet) return false;
for (let py = 0; py < TET_SIZE; py++) {
for (let px = 0; px < TET_SIZE; px++) {
if (newTet[py][px]) {
const nx = x + px + moveX;
const ny = y + py + moveY;
if (nx < 0 || ny < 0 || nx >= PLAY_SCREEN_WIDTH || ny >= PLAY_SCREEN_HEIGHT) return false;
if (SCREEN[ny][nx]) return false;
}
}
}
return true;
};
const tryRotate = (dir) => {
const oldRot = current.rot;
const newRot = (oldRot + (dir === 1 ? 1 : -1) + 4) % 4;
const newMatrix = rotateMatrix(current.matrix, dir === 1 ? 1 : -1);
const key = current.type === 'I' ? 'I' : 'JLSTZ';
const kicks = SRS[key][`${oldRot}>${newRot === 1 ? 'R' : newRot === 3 ? 'L' : newRot}`] || SRS[key][`${oldRot}>${newRot}`] || [[0,0]];
for (const k of kicks) {
const dx = k[0], dy = k[1];
if (!collide(newMatrix,current.x+dx,current.y+dy)) {
current.matrix = newMatrix;
current.rot = newRot;
current.x += dx;
current.y += dy;
lockDelay = 0;
return true;
}
}
return false;
};
const fixPiece = () => {
for (let py = 0; py < TET_SIZE; py++) {
for (let px = 0; px < TET_SIZE; px++) {
if (current.matrix[py][px]) {
const nx = current.x + px;
const ny = current.y + py;
if (ny >= 0 && ny < PLAY_SCREEN_HEIGHT && nx >= 0 && nx < PLAY_SCREEN_WIDTH) SCREEN[ny][nx] = current.type;
}
}
}
canHold = true;
lockDelay = 0;
clearLines();
spawnNext();
};
const clearLines = () => {
for (let y = PLAY_SCREEN_HEIGHT - 1; y >= 0; y--) {
let full = true;
for (let x = 0; x < PLAY_SCREEN_WIDTH; x++) {
if (!SCREEN[y][x]) { full = false; break; }
}
if (full) {
for (let ny = y; ny > 0; ny--) for (let nx = 0; nx < PLAY_SCREEN_WIDTH; nx++) SCREEN[ny][nx] = SCREEN[ny-1][nx];
for (let nx = 0; nx < PLAY_SCREEN_WIDTH; nx++) SCREEN[0][nx] = 0;
y++;
}
}
};
const hardDrop = () => {
while (!collide(current.matrix,current.x,current.y+1)) current.y++;
fixPiece();
};
const dropStep = () => {
if (isGameOver) return;
if (!collide(current.matrix,current.x,current.y+1)) {
current.y++;
lockDelay = 0;
} else {
lockDelay += DROP_SPEED;
if (lockDelay >= LOCK_DELAY_MAX) {
fixPiece();
}
}
};
const drawBlock = (x,y,t) => {
const drawX = x * BLOCK_SIZE;
const drawY = y * BLOCK_SIZE;
ctx.fillStyle = t ? tetColors[t] : '#000';
ctx.fillRect(drawX, drawY, BLOCK_SIZE, BLOCK_SIZE);
ctx.strokeStyle = 'black';
ctx.strokeRect(drawX, drawY, BLOCK_SIZE, BLOCK_SIZE);
};
const drawPlayScreen = () => {
ctx.fillStyle = '#000';
ctx.fillRect(0,0,CANVAS_WIDTH,CANVAS_HEIGHT);
for (let y = 0; y < PLAY_SCREEN_HEIGHT; y++) for (let x = 0; x < PLAY_SCREEN_WIDTH; x++) if (SCREEN[y][x]) drawBlock(x,y,SCREEN[y][x]);
const ghostY = getGhostY(current);
for (let py = 0; py < TET_SIZE; py++) for (let px = 0; px < TET_SIZE; px++) if (current.matrix[py][px]) {
const gx = current.x + px;
const gy = ghostY + py;
ctx.globalAlpha = 0.35;
drawBlock(gx,gy,current.type);
ctx.globalAlpha = 1;
}
for (let py = 0; py < TET_SIZE; py++) for (let px = 0; px < TET_SIZE; px++) if (current.matrix[py][px]) drawBlock(current.x+px,current.y+py,current.type);
if (isGameOver) {
const msg = 'GAME OVER';
ctx.font = "40px 'Meiryo UI'";
const w = ctx.measureText(msg).width;
ctx.fillStyle = 'white';
ctx.fillText(msg, CANVAS_WIDTH/2 - w/2, CANVAS_HEIGHT/2 - 20);
}
};
const initScreen = () => {
for (let y = 0; y < PLAY_SCREEN_HEIGHT; y++) {
SCREEN[y] = [];
for (let x = 0; x < PLAY_SCREEN_WIDTH; x++) SCREEN[y][x] = 0;
}
};
const nextCanvas = document.getElementById('nextCanvas');
const nextCtx = nextCanvas.getContext('2d');
nextCanvas.width = BLOCK_SIZE * 4;
nextCanvas.height = BLOCK_SIZE * 4 * NEXT_COUNT;
nextCanvas.style.background = '#222';
const holdBox = document.getElementById('holdBox');
const dasInput = document.getElementById('dasInput');
const arrInput = document.getElementById('arrInput');
const sdfInput = document.getElementById('sdfInput');
const dcdInput = document.getElementById('dcdInput');
const dasDisplay = document.createElement('div');
const arrDisplay = document.createElement('div');
const sdfDisplay = document.createElement('div');
const dcdDisplay = document.createElement('div');
dasDisplay.style.fontFamily = arrDisplay.style.fontFamily = sdfDisplay.style.fontFamily = dcdDisplay.style.fontFamily = 'monospace';
dasDisplay.style.fontSize = arrDisplay.style.fontSize = sdfDisplay.style.fontSize = dcdDisplay.style.fontSize = '12px';
if (dasInput && dasInput.parentNode) dasInput.parentNode.appendChild(dasDisplay);
if (arrInput && arrInput.parentNode) arrInput.parentNode.appendChild(arrDisplay);
if (sdfInput && sdfInput.parentNode) sdfInput.parentNode.appendChild(sdfDisplay);
if (dcdInput && dcdInput.parentNode) dcdInput.parentNode.appendChild(dcdDisplay);
let dcdTimer = 0;
const frameToMs = f => f * (1000 / 60);
const bToMs = b => b * (1000 / 120);
const msToFrame = ms => ms / (1000 / 60);
const msToB = ms => ms / (1000 / 120);
const round1 = n => Math.round(n * 10) / 10;
const formatFBms = (ms, prefer) => {
if (prefer === 'F') return `${round1(msToFrame(ms))}F (${Math.round(ms)}ms)`;
if (prefer === 'B') return `${round1(msToB(ms))}B (${Math.round(ms)}ms)`;
return `${Math.round(ms)}ms`;
};
const parseFB = v => {
if (v === null || v === undefined) return null;
v = String(v).trim().toUpperCase();
if (v === '') return null;
if (v.endsWith('F')) {
const n = parseFloat(v.slice(0, -1));
if (isNaN(n)) return null;
return frameToMs(Math.round(n * 10) / 10);
}
if (v.endsWith('B')) {
const n = parseFloat(v.slice(0, -1));
if (isNaN(n)) return null;
return bToMs(Math.round(n * 10) / 10);
}
const n = parseFloat(v);
if (isNaN(n)) return null;
return n;
};
const drawMini = function(ctx2, x, y, size, color){
ctx2.fillStyle = color;
ctx2.fillRect(x, y, size, size);
ctx2.strokeStyle = 'black';
ctx2.strokeRect(x, y, size, size);
};
const drawPiecePreview = function(ctx2, type, cellSize, ox, oy){
const m = TETRO_SHAPES[type];
const w = 4 * cellSize;
const h = 4 * cellSize;
const cx = ox + Math.floor((nextCanvas.width - w) / 2);
const cy = oy + Math.floor((BLOCK_SIZE * 4 - h) / 2);
for (let py = 0; py < 4; py++) {
for (let px = 0; px < 4; px++) {
if (m[py][px]) drawMini(ctx2, cx + px * cellSize, cy + py * cellSize, cellSize, tetColors[type]);
}
}
};
const drawNext = function(){
nextCtx.fillStyle = '#222';
nextCtx.fillRect(0, 0, nextCanvas.width, nextCanvas.height);
const cellSize = Math.floor(BLOCK_SIZE * 0.45);
for (let i = 0; i < NEXT_COUNT; i++) {
const t = nextQueue[i];
if (!t) continue;
drawPiecePreview(nextCtx, t, cellSize, 0, i * (BLOCK_SIZE * 4));
}
};
const drawHold = function(){
holdBox.innerHTML = '';
if (!holdPiece) return;
const c = document.createElement('canvas');
c.width = BLOCK_SIZE * 4;
c.height = BLOCK_SIZE * 4;
const cx2 = c.getContext('2d');
cx2.fillStyle = '#222';
cx2.fillRect(0, 0, c.width, c.height);
const cellSize = Math.floor(BLOCK_SIZE * 0.5);
drawPiecePreview(cx2, holdPiece, cellSize, 0, 0);
holdBox.appendChild(c);
};
function drawPlayScreen(){
    ctx.fillStyle = '#000';
    ctx.fillRect(0,0,CANVAS_WIDTH,CANVAS_HEIGHT);
  
    for (let y = 0; y < PLAY_SCREEN_HEIGHT; y++)
    for (let x = 0; x < PLAY_SCREEN_WIDTH; x++)
      if (SCREEN[y][x])
        drawBlock(x,y,SCREEN[y][x]);
  
    const ghostY = getGhostY(current);
    for (let py = 0; py < TET_SIZE; py++)
    for (let px = 0; px < TET_SIZE; px++)
      if (current.matrix[py][px]) {
        const gx = current.x + px;
        const gy = ghostY + py;
        ctx.globalAlpha = 0.35;
        drawBlock(gx,gy,current.type);
        ctx.globalAlpha = 1;
      }
  
    for (let py = 0; py < TET_SIZE; py++)
    for (let px = 0; px < TET_SIZE; px++)
      if (current.matrix[py][px]) drawBlock(current.x+px,current.y+py,current.type);
  
    if (isGameOver) {
      const msg = 'GAME OVER';
      ctx.font = "40px 'Meiryo UI'";
      const w = ctx.measureText(msg).width;
      ctx.fillStyle = 'white';
      ctx.fillText(msg, CANVAS_WIDTH/2 - w/2, CANVAS_HEIGHT/2 - 20);
    }
  }
const originalDrawPlayScreen = drawPlayScreen;
drawPlayScreen = function(){
originalDrawPlayScreen();
drawNext();
drawHold();
};
const applyDefaultInputValues = function(){
if (dasInput) dasInput.type = 'text';
if (arrInput) arrInput.type = 'text';
if (sdfInput) sdfInput.type = 'text';
if (dcdInput) dcdInput.type = 'text';
if (dasInput) dasInput.value = '9F';
if (arrInput) arrInput.value = '1B';
if (sdfInput) sdfInput.value = '3B';
if (dcdInput) dcdInput.value = '5F';
const d1 = parseFB(dasInput.value);
const d2 = parseFB(arrInput.value);
const d3 = parseFB(sdfInput.value);
const d4 = parseFB(dcdInput.value);
if (d1 !== null) DAS_SETTINGS.DAS = d1;
if (d2 !== null) DAS_SETTINGS.ARR = d2;
if (d3 !== null) DAS_SETTINGS.SDF = d3;
if (d4 !== null) DAS_SETTINGS.DCD = d4;
updateSettingDisplays();
};
const updateSettingDisplays = function(){
if (dasDisplay) dasDisplay.textContent = formatFBms(DAS_SETTINGS.DAS, 'F');
if (arrDisplay) arrDisplay.textContent = formatFBms(DAS_SETTINGS.ARR, 'B');
if (sdfDisplay) sdfDisplay.textContent = formatFBms(DAS_SETTINGS.SDF, 'B');
if (dcdDisplay) dcdDisplay.textContent = formatFBms(DAS_SETTINGS.DCD, 'F');
};
if (dasInput) dasInput.addEventListener('input', e => {
const ms = parseFB(e.target.value);
if (ms !== null) DAS_SETTINGS.DAS = ms;
updateSettingDisplays();
});
if (arrInput) arrInput.addEventListener('input', e => {
const ms = parseFB(e.target.value);
if (ms !== null) DAS_SETTINGS.ARR = ms;
updateSettingDisplays();
});
if (sdfInput) sdfInput.addEventListener('input', e => {
const ms = parseFB(e.target.value);
if (ms !== null) DAS_SETTINGS.SDF = ms;
updateSettingDisplays();
});
if (dcdInput) dcdInput.addEventListener('input', e => {
const ms = parseFB(e.target.value);
if (ms !== null) DAS_SETTINGS.DCD = ms;
updateSettingDisplays();
});
document.addEventListener('keydown', (e) => {
if (isGameOver) return;
switch (e.code) {
case 'ArrowLeft':
if (!inputState.left) {
inputState.left = true;
if (canMove(-1,0)) current.x--;
lockDelay = 0;
holdTimers.left = 0;
dcdTimer = 0;
}
break;
case 'ArrowRight':
if (!inputState.right) {
inputState.right = true;
if (canMove(1,0)) current.x++;
lockDelay = 0;
holdTimers.right = 0;
dcdTimer = 0;
}
break;
case 'ArrowDown':
inputState.soft = true;
if (canMove(0,1)) current.y++;
lockDelay = 0;
break;
case 'Space':
hardDrop();
break;
case 'KeyZ':
tryRotate(-1);
break;
case 'KeyX':
tryRotate(1);
break;
case 'KeyC':
hold();
drawHold();
break;
}
drawPlayScreen();
});
document.addEventListener('keyup', (e) => {
switch (e.code) {
case 'ArrowLeft':
inputState.left = false;
holdTimers.left = 0;
dcdTimer = DAS_SETTINGS.DCD;
break;
case 'ArrowRight':
inputState.right = false;
holdTimers.right = 0;
dcdTimer = DAS_SETTINGS.DCD;
break;
case 'ArrowDown':
inputState.soft = false;
break;
}
});
const updateInput = (dt) => {
if (dcdTimer > 0) dcdTimer -= dt;
const dasBlocked = dcdTimer > 0;
if (inputState.left) {
holdTimers.left += dt;
if (!dasBlocked && holdTimers.left >= DAS_SETTINGS.DAS) {
const repeats = Math.floor((holdTimers.left - DAS_SETTINGS.DAS) / DAS_SETTINGS.ARR);
if (repeats > 0) {
for (let i = 0; i < repeats; i++) {
if (canMove(-1,0)) current.x--;
}
holdTimers.left -= repeats * DAS_SETTINGS.ARR;
lockDelay = 0;
}
}
}
if (inputState.right) {
holdTimers.right += dt;
if (!dasBlocked && holdTimers.right >= DAS_SETTINGS.DAS) {
const repeats = Math.floor((holdTimers.right - DAS_SETTINGS.DAS) / DAS_SETTINGS.ARR);
if (repeats > 0) {
for (let i = 0; i < repeats; i++) {
if (canMove(1,0)) current.x++;
}
holdTimers.right -= repeats * DAS_SETTINGS.ARR;
lockDelay = 0;
}
}
}
if (inputState.soft) {
if (!updateInput.softTimer) updateInput.softTimer = 0;
updateInput.softTimer += dt;
if (updateInput.softTimer >= DAS_SETTINGS.SDF) {
if (canMove(0,1)) current.y++;
updateInput.softTimer = 0;
lockDelay = 0;
}
} else {
updateInput.softTimer = 0;
}
};
const gameLoop = (now) => {
const dt = now - lastTime;
lastTime = now;
updateInput(dt);
if (!isGameOver) {
if (!gameLoop.dropTimer) gameLoop.dropTimer = 0;
gameLoop.dropTimer += dt;
const interval = inputState.soft ? Math.max(50, DROP_SPEED/4) : DROP_SPEED;
if (gameLoop.dropTimer >= interval) {
if (!collide(current.matrix,current.x,current.y+1)) current.y++;
else {
lockDelay += gameLoop.dropTimer;
if (lockDelay >= LOCK_DELAY_MAX) fixPiece();
}
gameLoop.dropTimer = 0;
}
}
drawPlayScreen();
requestAnimationFrame(gameLoop);
};
const startGame = () => {
initScreen();
nextQueue = [];
while (nextQueue.length < NEXT_COUNT) nextQueue.push(bag.next());
spawnNext();
isGameOver = false;
lastTime = performance.now();
applyDefaultInputValues();
requestAnimationFrame(gameLoop);
drawNext();
drawHold();
};
const CONTAINER = document.getElementById('container');
if (CONTAINER) CONTAINER.style.width = CANVAS_WIDTH + 'px';
const init = () => {
startGame();
};
init();

(() => {
    const COLS = 10;
    const ROWS = 20;
    const BLOCK = 30;
    const NEXT_BLOCK = 20;
    const HOLD_BLOCK = 20;

    const COLORS = {
        I: '#00f0f0',
        O: '#f0f000',
        T: '#a000f0',
        S: '#00f000',
        Z: '#f00000',
        J: '#0000f0',
        L: '#f0a000',
    };

    const SHAPES = {
        I: [[0,0],[1,0],[2,0],[3,0]],
        O: [[0,0],[1,0],[0,1],[1,1]],
        T: [[0,0],[1,0],[2,0],[1,1]],
        S: [[1,0],[2,0],[0,1],[1,1]],
        Z: [[0,0],[1,0],[1,1],[2,1]],
        J: [[0,0],[0,1],[1,1],[2,1]],
        L: [[2,0],[0,1],[1,1],[2,1]],
    };

    const WALL_KICKS = {
        normal: {
            '0>1': [[0,0],[-1,0],[-1,-1],[0,2],[-1,2]],
            '1>0': [[0,0],[1,0],[1,1],[0,-2],[1,-2]],
            '1>2': [[0,0],[1,0],[1,1],[0,-2],[1,-2]],
            '2>1': [[0,0],[-1,0],[-1,-1],[0,2],[-1,2]],
            '2>3': [[0,0],[1,0],[1,-1],[0,2],[1,2]],
            '3>2': [[0,0],[-1,0],[-1,1],[0,-2],[-1,-2]],
            '3>0': [[0,0],[-1,0],[-1,1],[0,-2],[-1,-2]],
            '0>3': [[0,0],[1,0],[1,-1],[0,2],[1,2]],
        },
        I: {
            '0>1': [[0,0],[-2,0],[1,0],[-2,1],[1,-2]],
            '1>0': [[0,0],[2,0],[-1,0],[2,-1],[-1,2]],
            '1>2': [[0,0],[-1,0],[2,0],[-1,-2],[2,1]],
            '2>1': [[0,0],[1,0],[-2,0],[1,2],[-2,-1]],
            '2>3': [[0,0],[2,0],[-1,0],[2,-1],[-1,2]],
            '3>2': [[0,0],[-2,0],[1,0],[-2,1],[1,-2]],
            '3>0': [[0,0],[1,0],[-2,0],[1,2],[-2,-1]],
            '0>3': [[0,0],[-1,0],[2,0],[-1,-2],[2,1]],
        }
    };

    const canvas = document.getElementById('gameCanvas');
    const ctx = canvas.getContext('2d');
    const nextCanvas = document.getElementById('nextCanvas');
    const nextCtx = nextCanvas.getContext('2d');
    const holdCanvas = document.getElementById('holdCanvas');
    const holdCtx = holdCanvas.getContext('2d');

    const overlay = document.getElementById('overlay');
    const overlayTitle = document.getElementById('overlayTitle');
    const overlayMessage = document.getElementById('overlayMessage');
    const scoreEl = document.getElementById('score');
    const levelEl = document.getElementById('level');
    const linesEl = document.getElementById('lines');

    let board = [];
    let currentPiece = null;
    let nextPieces = [];
    let holdPiece = null;
    let canHold = true;
    let score = 0;
    let level = 1;
    let totalLines = 0;
    let gameState = 'idle';
    let dropInterval = 1000;
    let lastDrop = 0;
    let lockDelay = 500;
    let lockTimer = null;
    let animationId = null;
    let bag = [];

    function createBoard() {
        return Array.from({ length: ROWS }, () => Array(COLS).fill(null));
    }

    function shuffleBag() {
        const types = Object.keys(SHAPES);
        for (let i = types.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [types[i], types[j]] = [types[j], types[i]];
        }
        return types;
    }

    function getNextType() {
        if (bag.length === 0) bag = shuffleBag();
        return bag.pop();
    }

    function createPiece(type) {
        const cells = SHAPES[type].map(([x, y]) => [x, y]);
        return {
            type,
            cells,
            x: Math.floor((COLS - 4) / 2),
            y: 0,
            rotation: 0,
        };
    }

    function rotateCells(cells, type) {
        if (type === 'O') return cells.map(([x, y]) => [x, y]);
        const size = type === 'I' ? 4 : 3;
        return cells.map(([x, y]) => [size - 1 - y, x]);
    }

    function getAbsoluteCells(piece) {
        return piece.cells.map(([cx, cy]) => [piece.x + cx, piece.y + cy]);
    }

    function isValid(piece) {
        return getAbsoluteCells(piece).every(([x, y]) =>
            x >= 0 && x < COLS && y < ROWS && (y < 0 || board[y][x] === null)
        );
    }

    function tryRotate(piece) {
        if (piece.type === 'O') return true;
        const newCells = rotateCells(piece.cells, piece.type);
        const newRotation = (piece.rotation + 1) % 4;
        const kickKey = `${piece.rotation}>${newRotation}`;
        const kickTable = piece.type === 'I' ? WALL_KICKS.I : WALL_KICKS.normal;
        const kicks = kickTable[kickKey] || [[0, 0]];

        for (const [dx, dy] of kicks) {
            const test = { ...piece, cells: newCells, x: piece.x + dx, y: piece.y - dy, rotation: newRotation };
            if (isValid(test)) {
                piece.cells = newCells;
                piece.x = test.x;
                piece.y = test.y;
                piece.rotation = newRotation;
                return true;
            }
        }
        return false;
    }

    function lockPiece() {
        const abs = getAbsoluteCells(currentPiece);
        for (const [x, y] of abs) {
            if (y < 0) {
                gameOver();
                return;
            }
            board[y][x] = currentPiece.type;
        }
        clearLines();
        spawnPiece();
    }

    function clearLines() {
        let cleared = 0;
        for (let y = ROWS - 1; y >= 0; y--) {
            if (board[y].every(cell => cell !== null)) {
                board.splice(y, 1);
                board.unshift(Array(COLS).fill(null));
                cleared++;
                y++;
            }
        }
        if (cleared > 0) {
            const points = [0, 100, 300, 500, 800];
            score += (points[cleared] || 800) * level;
            totalLines += cleared;
            level = Math.floor(totalLines / 10) + 1;
            dropInterval = Math.max(50, 1000 - (level - 1) * 80);
            updateStats();
        }
    }

    function spawnPiece() {
        currentPiece = createPiece(nextPieces.shift());
        while (nextPieces.length < 3) nextPieces.push(getNextType());
        canHold = true;
        lockTimer = null;

        if (!isValid(currentPiece)) {
            gameOver();
        }
        drawNext();
    }

    function holdCurrentPiece() {
        if (!canHold) return;
        canHold = false;
        const type = currentPiece.type;
        if (holdPiece) {
            currentPiece = createPiece(holdPiece);
            holdPiece = type;
        } else {
            holdPiece = type;
            spawnPiece();
        }
        lockTimer = null;
        drawHold();
    }

    function getGhostY() {
        let ghostY = currentPiece.y;
        const test = { ...currentPiece, y: ghostY };
        while (true) {
            test.y = ghostY + 1;
            if (!isValid(test)) break;
            ghostY++;
        }
        return ghostY;
    }

    function hardDrop() {
        const ghostY = getGhostY();
        score += (ghostY - currentPiece.y) * 2;
        currentPiece.y = ghostY;
        lockPiece();
        updateStats();
    }

    function moveDown() {
        currentPiece.y++;
        if (!isValid(currentPiece)) {
            currentPiece.y--;
            if (lockTimer === null) {
                lockTimer = performance.now();
            }
            return false;
        }
        lockTimer = null;
        return true;
    }

    function moveHorizontal(dir) {
        currentPiece.x += dir;
        if (!isValid(currentPiece)) {
            currentPiece.x -= dir;
            return false;
        }
        if (lockTimer !== null) lockTimer = performance.now();
        return true;
    }

    function drawBlock(context, x, y, color, size, ghost) {
        const padding = 1;
        if (ghost) {
            context.strokeStyle = color;
            context.lineWidth = 1.5;
            context.globalAlpha = 0.3;
            context.strokeRect(x * size + padding, y * size + padding, size - padding * 2, size - padding * 2);
            context.globalAlpha = 1;
            return;
        }
        context.fillStyle = color;
        context.fillRect(x * size + padding, y * size + padding, size - padding * 2, size - padding * 2);

        context.fillStyle = 'rgba(255,255,255,0.15)';
        context.fillRect(x * size + padding, y * size + padding, size - padding * 2, 3);
        context.fillRect(x * size + padding, y * size + padding, 3, size - padding * 2);

        context.fillStyle = 'rgba(0,0,0,0.2)';
        context.fillRect(x * size + padding, y * size + size - padding - 3, size - padding * 2, 3);
        context.fillRect(x * size + size - padding - 3, y * size + padding, 3, size - padding * 2);
    }

    function drawBoard() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        ctx.fillStyle = '#111';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        ctx.strokeStyle = '#1a1a1a';
        ctx.lineWidth = 0.5;
        for (let x = 0; x <= COLS; x++) {
            ctx.beginPath();
            ctx.moveTo(x * BLOCK, 0);
            ctx.lineTo(x * BLOCK, canvas.height);
            ctx.stroke();
        }
        for (let y = 0; y <= ROWS; y++) {
            ctx.beginPath();
            ctx.moveTo(0, y * BLOCK);
            ctx.lineTo(canvas.width, y * BLOCK);
            ctx.stroke();
        }

        for (let y = 0; y < ROWS; y++) {
            for (let x = 0; x < COLS; x++) {
                if (board[y][x]) {
                    drawBlock(ctx, x, y, COLORS[board[y][x]], BLOCK, false);
                }
            }
        }

        if (currentPiece) {
            const ghostY = getGhostY();
            currentPiece.cells.forEach(([cx, cy]) => {
                const gx = currentPiece.x + cx;
                const gy = ghostY + cy;
                if (gy >= 0) drawBlock(ctx, gx, gy, COLORS[currentPiece.type], BLOCK, true);
            });

            getAbsoluteCells(currentPiece).forEach(([x, y]) => {
                if (y >= 0) drawBlock(ctx, x, y, COLORS[currentPiece.type], BLOCK, false);
            });
        }
    }

    function drawPreview(context, type, blockSize, canvasW, canvasH, offsetY) {
        if (!type) return;
        const cells = SHAPES[type];
        const minX = Math.min(...cells.map(c => c[0]));
        const maxX = Math.max(...cells.map(c => c[0]));
        const minY = Math.min(...cells.map(c => c[1]));
        const maxY = Math.max(...cells.map(c => c[1]));
        const w = (maxX - minX + 1) * blockSize;
        const h = (maxY - minY + 1) * blockSize;
        const ox = (canvasW - w) / 2 - minX * blockSize;
        const oy = offsetY + (canvasH - h) / 2 - minY * blockSize;

        cells.forEach(([cx, cy]) => {
            drawBlock(context, 0, 0, COLORS[type], blockSize, false);
            const px = ox + cx * blockSize;
            const py = oy + cy * blockSize;
            const pad = 1;
            context.fillStyle = COLORS[type];
            context.fillRect(px + pad, py + pad, blockSize - pad * 2, blockSize - pad * 2);

            context.fillStyle = 'rgba(255,255,255,0.15)';
            context.fillRect(px + pad, py + pad, blockSize - pad * 2, 3);
            context.fillRect(px + pad, py + pad, 3, blockSize - pad * 2);

            context.fillStyle = 'rgba(0,0,0,0.2)';
            context.fillRect(px + pad, py + pad + blockSize - pad * 2 - 3, blockSize - pad * 2, 3);
            context.fillRect(px + pad + blockSize - pad * 2 - 3, py + pad, 3, blockSize - pad * 2);
        });
    }

    function drawNext() {
        nextCtx.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
        const slotH = nextCanvas.height / 3;
        nextPieces.slice(0, 3).forEach((type, i) => {
            drawPreview(nextCtx, type, NEXT_BLOCK, nextCanvas.width, slotH, i * slotH);
        });
    }

    function drawHold() {
        holdCtx.clearRect(0, 0, holdCanvas.width, holdCanvas.height);
        if (holdPiece) {
            drawPreview(holdCtx, holdPiece, HOLD_BLOCK, holdCanvas.width, holdCanvas.height, 0);
        }
    }

    function updateStats() {
        scoreEl.textContent = score.toLocaleString();
        levelEl.textContent = level;
        linesEl.textContent = totalLines;
    }

    function showOverlay(title, message) {
        overlayTitle.textContent = title;
        overlayMessage.textContent = message;
        overlay.classList.remove('hidden');
    }

    function hideOverlay() {
        overlay.classList.add('hidden');
    }

    function gameOver() {
        gameState = 'over';
        cancelAnimationFrame(animationId);
        showOverlay('GAME OVER', `Score: ${score.toLocaleString()} — Press ENTER to Restart`);
    }

    function startGame() {
        board = createBoard();
        score = 0;
        level = 1;
        totalLines = 0;
        dropInterval = 1000;
        holdPiece = null;
        canHold = true;
        lockTimer = null;
        bag = [];
        nextPieces = [];
        for (let i = 0; i < 3; i++) nextPieces.push(getNextType());
        spawnPiece();
        updateStats();
        drawHold();
        hideOverlay();
        gameState = 'playing';
        lastDrop = performance.now();
        animationId = requestAnimationFrame(gameLoop);
    }

    function togglePause() {
        if (gameState === 'playing') {
            gameState = 'paused';
            cancelAnimationFrame(animationId);
            showOverlay('PAUSED', 'Press P to Resume');
        } else if (gameState === 'paused') {
            gameState = 'playing';
            hideOverlay();
            lastDrop = performance.now();
            animationId = requestAnimationFrame(gameLoop);
        }
    }

    function gameLoop(now) {
        if (gameState !== 'playing') return;

        if (now - lastDrop > dropInterval) {
            moveDown();
            lastDrop = now;
        }

        if (lockTimer !== null && now - lockTimer > lockDelay) {
            lockPiece();
            lockTimer = null;
        }

        drawBoard();
        animationId = requestAnimationFrame(gameLoop);
    }

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            if (gameState === 'idle' || gameState === 'over') {
                startGame();
            }
            return;
        }

        if (e.key === 'p' || e.key === 'P') {
            if (gameState === 'playing' || gameState === 'paused') {
                togglePause();
            }
            return;
        }

        if (gameState !== 'playing') return;

        switch (e.key) {
            case 'ArrowLeft':
                moveHorizontal(-1);
                break;
            case 'ArrowRight':
                moveHorizontal(1);
                break;
            case 'ArrowDown':
                if (moveDown()) score += 1;
                updateStats();
                lastDrop = performance.now();
                break;
            case 'ArrowUp':
                tryRotate(currentPiece);
                break;
            case ' ':
                e.preventDefault();
                hardDrop();
                break;
            case 'c':
            case 'C':
                holdCurrentPiece();
                break;
        }
    });

    showOverlay('테트리스', 'Press ENTER to Start');
})();

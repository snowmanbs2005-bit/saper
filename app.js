const tg = window.Telegram.WebApp;
try {
    tg.expand();
    tg.ready();
} catch(e) {}

const boardEl = document.getElementById('board');
const minesCountEl = document.getElementById('mines-count');
const timerEl = document.getElementById('timer');
const emojiBtn = document.getElementById('emoji-btn');
const btnEasy = document.getElementById('btn-easy');
const btnMed = document.getElementById('btn-med');
const btnHard = document.getElementById('btn-hard');
const btnRestartGame = document.getElementById('btn-restart-game');

const resultModal = document.getElementById('result-modal');
const resultTitle = document.getElementById('result-title');
const resultMessage = document.getElementById('result-message');
const btnRestartModal = document.getElementById('btn-restart-modal');

// Adjust sizes slightly to fit better on standard mobile screens
const LEVELS = {
    easy: { rows: 8, cols: 8, mines: 10, cell: 35 },
    med: { rows: 12, cols: 12, mines: 20, cell: 28 },
    hard: { rows: 16, cols: 16, mines: 40, cell: 22 }
};

let currentLevel = 'easy';
let board = [];
let gameOver = false;
let startTime = null;
let timerInterval = null;
let flagsCount = 0;
let revealedCount = 0;
let firstClick = true;

function initGame() {
    clearInterval(timerInterval);
    timerEl.innerText = '0';
    startTime = null;
    gameOver = false;
    firstClick = true;
    flagsCount = 0;
    revealedCount = 0;
    boardEl.innerHTML = '';
    
    emojiBtn.innerText = '🙂';
    resultModal.classList.remove('show');
    
    const config = LEVELS[currentLevel];
    minesCountEl.innerText = config.mines;
    
    document.documentElement.style.setProperty('--cell-size', `${config.cell}px`);
    boardEl.style.gridTemplateColumns = `repeat(${config.cols}, 1fr)`;
    
    board = [];
    for (let r = 0; r < config.rows; r++) {
        const row = [];
        for (let c = 0; c < config.cols; c++) {
            const cell = {
                r, c,
                isMine: false,
                isRevealed: false,
                isFlagged: false,
                neighborMines: 0,
                element: document.createElement('div')
            };
            cell.element.classList.add('cell');
            
            // Interaction logic
            cell.element.addEventListener('click', () => handleCellClick(r, c));
            cell.element.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                handleRightClick(r, c);
            });
            
            // Long press logic for mobile to set flags
            let touchTimer;
            let touchStartX, touchStartY;
            
            cell.element.addEventListener('touchstart', (e) => {
                if (gameOver) return;
                touchStartX = e.touches[0].clientX;
                touchStartY = e.touches[0].clientY;
                
                emojiBtn.innerText = '😮';
                
                touchTimer = setTimeout(() => {
                    handleRightClick(r, c);
                    // Add small vibration if possible
                    if (tg.HapticFeedback) tg.HapticFeedback.impactOccurred('light');
                    touchTimer = null;
                }, 400); // 400ms for long press
            });
            
            const cancelTouch = (e) => {
                if (!gameOver && emojiBtn.innerText === '😮') emojiBtn.innerText = '🙂';
                if (touchTimer) {
                    clearTimeout(touchTimer);
                    touchTimer = null;
                }
            };
            
            cell.element.addEventListener('touchmove', (e) => {
                const moveX = e.touches[0].clientX;
                const moveY = e.touches[0].clientY;
                // If moved too much, cancel long press
                if (Math.abs(moveX - touchStartX) > 10 || Math.abs(moveY - touchStartY) > 10) {
                    cancelTouch(e);
                }
            });
            
            cell.element.addEventListener('touchend', (e) => {
                cancelTouch(e);
            });
            
            boardEl.appendChild(cell.element);
            row.push(cell);
        }
        board.push(row);
    }
}

function placeMines(firstR, firstC) {
    const config = LEVELS[currentLevel];
    let minesPlaced = 0;
    while (minesPlaced < config.mines) {
        const r = Math.floor(Math.random() * config.rows);
        const c = Math.floor(Math.random() * config.cols);
        
        // 3x3 safe zone around first click
        if (board[r][c].isMine) continue;
        if (Math.abs(r - firstR) <= 1 && Math.abs(c - firstC) <= 1) continue;
        
        board[r][c].isMine = true;
        minesPlaced++;
    }
    
    // Calculate neighbor counts
    for (let r = 0; r < config.rows; r++) {
        for (let c = 0; c < config.cols; c++) {
            if (!board[r][c].isMine) {
                let count = 0;
                for (let i = -1; i <= 1; i++) {
                    for (let j = -1; j <= 1; j++) {
                        const rr = r + i;
                        const cc = c + j;
                        if (rr >= 0 && rr < config.rows && cc >= 0 && cc < config.cols && board[rr][cc].isMine) {
                            count++;
                        }
                    }
                }
                board[r][c].neighborMines = count;
            }
        }
    }
}

function startTimer() {
    startTime = Date.now();
    timerInterval = setInterval(() => {
        const sec = Math.floor((Date.now() - startTime) / 1000);
        timerEl.innerText = sec;
    }, 1000);
}

function handleCellClick(r, c) {
    if (gameOver || board[r][c].isFlagged) return;
    
    if (firstClick) {
        firstClick = false;
        placeMines(r, c);
        startTimer();
    }
    
    const wasRevealed = board[r][c].isRevealed;
    revealCell(r, c);
    
    // If we click an already revealed cell with correct flags around it, auto-reveal
    if (wasRevealed && board[r][c].neighborMines > 0) {
        let flagsAround = 0;
        const config = LEVELS[currentLevel];
        const toReveal = [];
        
        for (let i = -1; i <= 1; i++) {
            for (let j = -1; j <= 1; j++) {
                const rr = r + i;
                const cc = c + j;
                if (rr >= 0 && rr < config.rows && cc >= 0 && cc < config.cols) {
                    if (board[rr][cc].isFlagged) flagsAround++;
                    else if (!board[rr][cc].isRevealed) toReveal.push([rr, cc]);
                }
            }
        }
        
        if (flagsAround === board[r][c].neighborMines) {
            toReveal.forEach(([rr, cc]) => revealCell(rr, cc));
        }
    }
    
    if (!gameOver) checkWinCount();
}

function handleRightClick(r, c) {
    if (gameOver || board[r][c].isRevealed) return;
    
    const cell = board[r][c];
    if (firstClick) {
        firstClick = false;
        startTimer();
    }

    if (!cell.isFlagged) {
        cell.isFlagged = true;
        cell.element.classList.add('flag');
        cell.element.innerText = '🚩';
        flagsCount++;
    } else {
        cell.isFlagged = false;
        cell.element.classList.remove('flag');
        cell.element.innerText = '';
        flagsCount--;
    }
    
    minesCountEl.innerText = LEVELS[currentLevel].mines - flagsCount;
}

function revealCell(r, c) {
    const config = LEVELS[currentLevel];
    if (r < 0 || r >= config.rows || c < 0 || c >= config.cols) return;
    
    const cell = board[r][c];
    if (cell.isRevealed || cell.isFlagged) return;
    
    cell.isRevealed = true;
    cell.element.classList.add('revealed');
    revealedCount++;
    
    if (cell.isMine) {
        cell.element.classList.add('mine');
        cell.element.innerText = '💣';
        triggerLoss();
        return;
    }
    
    if (cell.neighborMines > 0) {
        cell.element.innerText = cell.neighborMines;
        cell.element.setAttribute('data-num', cell.neighborMines);
    } else {
        // empty cell, flood fill
        for (let i = -1; i <= 1; i++) {
            for (let j = -1; j <= 1; j++) {
                revealCell(r + i, c + j);
            }
        }
    }
}

function triggerLoss() {
    gameOver = true;
    clearInterval(timerInterval);
    emojiBtn.innerText = '😵';
    
    // Reveal all mines and wrong flags
    const config = LEVELS[currentLevel];
    for (let r = 0; r < config.rows; r++) {
        for (let c = 0; c < config.cols; c++) {
            const cell = board[r][c];
            if (cell.isMine && !cell.isFlagged && !cell.isRevealed) {
                cell.element.innerHTML = '💣';
                cell.element.classList.add('revealed');
            } else if (!cell.isMine && cell.isFlagged) {
                cell.element.innerHTML = '❌';
                cell.element.classList.add('revealed');
            }
        }
    }
    
    if (tg.HapticFeedback) tg.HapticFeedback.notificationOccurred('error');

    setTimeout(() => {
        resultTitle.innerText = "Поражение";
        resultMessage.innerText = "аааййй леффффф";
        // Show Telegram popup/alert
        if (tg.showAlert) {
            tg.showAlert("аааййй леффффф", () => {
                resultModal.classList.add('show');
            });
        } else {
            resultModal.classList.add('show');
        }
    }, 500);
}

function checkWinCount() {
    if (gameOver) return;
    const config = LEVELS[currentLevel];
    if (revealedCount === config.rows * config.cols - config.mines) {
        triggerWin();
    }
}

function triggerWin() {
    gameOver = true;
    clearInterval(timerInterval);
    emojiBtn.innerText = '😎';
    
    // Flag remaining mines automatically
    const config = LEVELS[currentLevel];
    for (let r = 0; r < config.rows; r++) {
        for (let c = 0; c < config.cols; c++) {
            if (board[r][c].isMine && !board[r][c].isFlagged) {
                board[r][c].isFlagged = true;
                board[r][c].element.classList.add('flag');
                board[r][c].element.innerText = '🚩';
            }
        }
    }
    
    minesCountEl.innerText = '0';
    
    if (tg.HapticFeedback) tg.HapticFeedback.notificationOccurred('success');
    
    setTimeout(() => {
        resultTitle.innerText = "Победа! 🎉";
        const timeSpent = timerEl.innerText;
        resultMessage.innerText = `Уровень: ${currentLevel.toUpperCase()}\nВремя: ${timeSpent} сек.`;
        resultModal.classList.add('show');
    }, 500);
}

document.querySelectorAll('.controls button').forEach(btn => {
    btn.addEventListener('click', (e) => {
        if (e.target.id === 'btn-easy') setLevel('easy');
        else if (e.target.id === 'btn-med') setLevel('med');
        else if (e.target.id === 'btn-hard') setLevel('hard');
    });
});

emojiBtn.addEventListener('click', initGame);
btnRestartGame.addEventListener('click', initGame);
btnRestartModal.addEventListener('click', initGame);

function setLevel(level) {
    currentLevel = level;
    [btnEasy, btnMed, btnHard].forEach(b => b.classList.remove('active'));
    document.getElementById(`btn-${level}`).classList.add('active');
    initGame();
}

// Start
setLevel('easy');

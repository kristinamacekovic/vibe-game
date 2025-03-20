const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const port = process.env.PORT || 3000;

// Serve static files from public directory
app.use(express.static('public'));

// Serve node_modules directory
app.use('/node_modules', express.static('node_modules'));

// Game state
const players = new Map();
let gameStarted = false;
let gameTimer = null;
const MIN_PLAYERS = 2;
const GAME_START_DELAY = 5000;
const INFECTION_TIMER = 60000;

function broadcastGameState() {
    io.emit('gameState', {
        started: gameStarted,
        survivorCount: getSurvivorCount()
    });
}

io.on('connection', (socket) => {
    console.log('\n=== New Connection ===');
    console.log('Player connected:', socket.id);
    console.log('Current players:', Array.from(players.entries()).map(([id, p]) => `${p.username}(${id})`));

    // Send current game state immediately on connection
    socket.emit('gameState', {
        started: gameStarted,
        survivorCount: getSurvivorCount()
    });

    socket.on('newPlayer', (data) => {
        console.log('\n=== New Player ===');
        console.log('Player joined:', socket.id);
        console.log('Username:', data.username);
        console.log('Position:', data.position);
        
        // Store player info
        const playerInfo = {
            id: socket.id,
            username: data.username,
            position: data.position || { x: 0, y: 1, z: 0 },
            rotation: { y: 0 },
            infected: false
        };
        players.set(socket.id, playerInfo);

        // Log current state
        console.log('\nCurrent players after join:');
        players.forEach((player, id) => {
            console.log(`- ${player.username} (${id}): ${JSON.stringify(player.position)}`);
        });

        // Send current players to new player
        const currentPlayers = Array.from(players.values());
        console.log('\nSending current players to new player:', currentPlayers.map(p => `${p.username}(${p.id})`));
        socket.emit('currentPlayers', currentPlayers);

        // Broadcast new player to others
        console.log('Broadcasting new player to others:', playerInfo.username);
        socket.broadcast.emit('playerJoined', playerInfo);

        // Broadcast updated game state to all
        broadcastGameState();

        // Check if we should start the game
        checkGameStart();
        
        console.log('=== End New Player ===\n');
    });

    socket.on('playerMovement', (movementData) => {
        const player = players.get(socket.id);
        if (player) {
            player.position = movementData.position;
            player.rotation = movementData.rotation;
            player.infected = movementData.infected;
            
            socket.broadcast.emit('playerMoved', {
                id: socket.id,
                position: player.position,
                rotation: player.rotation,
                infected: player.infected
            });
        }
    });

    socket.on('infectPlayer', (targetId) => {
        console.log('Infection attempt:', socket.id, 'trying to infect', targetId);
        const targetPlayer = players.get(targetId);
        const sourcePlayer = players.get(socket.id);
        
        if (targetPlayer && !targetPlayer.infected && sourcePlayer && sourcePlayer.infected) {
            console.log('Infection successful');
            targetPlayer.infected = true;
            io.emit('infected', targetId);
            checkGameEnd();
        }
    });

    socket.on('disconnect', () => {
        console.log('\n=== Player Disconnected ===');
        console.log('Player disconnected:', socket.id);
        if (players.has(socket.id)) {
            const player = players.get(socket.id);
            console.log('Username:', player.username);
            players.delete(socket.id);
            io.emit('playerLeft', socket.id);
            
            console.log('Players remaining:', Array.from(players.entries()).map(([id, p]) => `${p.username}(${id})`));
            // Check if game should end due to too few players
            if (gameStarted && players.size < MIN_PLAYERS) {
                endGame();
            } else {
                broadcastGameState();
            }
        }
        console.log('=== End Player Disconnected ===\n');
    });
});

function checkGameStart() {
    if (!gameStarted && players.size >= MIN_PLAYERS) {
        console.log('Starting game in 5 seconds...');
        io.emit('gameState', {
            started: false,
            survivorCount: players.size,
            message: 'Game starting in 5 seconds...'
        });
        setTimeout(startGame, GAME_START_DELAY);
    } else {
        broadcastGameState();
    }
}

function startGame() {
    if (players.size >= MIN_PLAYERS) {
        console.log('Starting game with', players.size, 'players');
        gameStarted = true;
        
        // Reset all players to uninfected
        players.forEach(player => {
            player.infected = false;
        });
        
        // Select random player as infected
        const playerIds = Array.from(players.keys());
        const initialInfected = playerIds[Math.floor(Math.random() * playerIds.length)];
        const infectedPlayer = players.get(initialInfected);
        infectedPlayer.infected = true;
        
        console.log('Initial infected player:', infectedPlayer.username);
        
        // Notify all players of game start and initial infected
        broadcastGameState();
        io.emit('infected', initialInfected);

        // Set game timer
        if (gameTimer) clearTimeout(gameTimer);
        gameTimer = setTimeout(endGame, INFECTION_TIMER);
    }
}

function getSurvivorCount() {
    let count = 0;
    players.forEach(player => {
        if (!player.infected) count++;
    });
    return count;
}

function checkGameEnd() {
    const survivors = getSurvivorCount();
    console.log('Survivors remaining:', survivors);
    
    broadcastGameState();

    if (survivors === 0) {
        endGame();
    }
}

function endGame() {
    if (gameTimer) {
        clearTimeout(gameTimer);
        gameTimer = null;
    }

    // Find winner (last survivor) if any
    let winner = null;
    players.forEach((player, id) => {
        if (!player.infected) {
            winner = id;
        }
    });

    console.log('Game ended. Winner:', winner ? players.get(winner).username : 'None');

    // Reset game state
    gameStarted = false;
    players.forEach(player => {
        player.infected = false;
    });

    // Notify clients of game end
    io.emit('gameOver', winner ? players.get(winner).username : null);
    
    // Broadcast final state
    broadcastGameState();
    
    // Start new game after delay if enough players
    setTimeout(checkGameStart, GAME_START_DELAY);
}

// Add new function to check proximity-based infection
function checkProximityInfection(sourceId, position) {
    const infectionRange = 2.5; // Match client-side infection range
    players.forEach((targetPlayer, targetId) => {
        if (targetId !== sourceId && !targetPlayer.infected) {
            const dx = targetPlayer.position.x - position.x;
            const dz = targetPlayer.position.z - position.z;
            const distance = Math.sqrt(dx * dx + dz * dz);
            
            if (distance < infectionRange) {
                console.log('Server-side infection detected');
                targetPlayer.infected = true;
                io.emit('infected', targetId);
                checkGameEnd();
            }
        }
    });
}

http.listen(port, () => {
    console.log(`Server running on port ${port}`);
}); 
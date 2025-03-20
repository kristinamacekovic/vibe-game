import * as THREE from '/node_modules/three/build/three.module.js';

let scene, camera, renderer, socket;
let players = new Map();
let localPlayer = null;
let username = '';
let isInfected = false;
let gameStarted = false;
let gameTimer = null;
let survivorCount = 0;

// Initialize Three.js scene
function init() {
    console.log('Initializing scene...');
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x87CEEB);

    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    document.body.appendChild(renderer.domElement);

    // Add lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
    directionalLight.position.set(5, 10, 5);
    scene.add(directionalLight);

    // Add ground
    const groundGeometry = new THREE.PlaneGeometry(30, 30);
    const groundMaterial = new THREE.MeshStandardMaterial({ 
        color: 0x808080,
        roughness: 0.8,
        metalness: 0.2
    });
    const ground = new THREE.Mesh(groundGeometry, groundMaterial);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = 0;
    scene.add(ground);

    // Add walls to create arena
    const wallMaterial = new THREE.MeshStandardMaterial({ color: 0x808080 });
    const wallGeometry = new THREE.BoxGeometry(30, 5, 1);
    
    const walls = [
        { position: [0, 2.5, 15], rotation: [0, 0, 0] },
        { position: [0, 2.5, -15], rotation: [0, 0, 0] },
        { position: [15, 2.5, 0], rotation: [0, Math.PI / 2, 0] },
        { position: [-15, 2.5, 0], rotation: [0, Math.PI / 2, 0] }
    ];

    walls.forEach(wall => {
        const wallMesh = new THREE.Mesh(wallGeometry, wallMaterial);
        wallMesh.position.set(...wall.position);
        wallMesh.rotation.set(...wall.rotation);
        scene.add(wallMesh);
    });

    // Position camera higher and further back for better view
    camera.position.set(0, 25, 25);
    camera.lookAt(0, 0, 0);

    // Add game status UI
    createGameUI();

    window.addEventListener('resize', onWindowResize, false);
    console.log('Scene initialized successfully');
}

// Create game UI
function createGameUI() {
    const ui = document.createElement('div');
    ui.id = 'gameUI';
    ui.style.position = 'fixed';
    ui.style.top = '20px';
    ui.style.left = '50%';
    ui.style.transform = 'translateX(-50%)';
    ui.style.color = 'white';
    ui.style.fontFamily = 'Arial, sans-serif';
    ui.style.fontSize = '24px';
    ui.style.textAlign = 'center';
    ui.style.textShadow = '2px 2px 4px rgba(0,0,0,0.5)';
    ui.style.zIndex = '1000';
    document.body.appendChild(ui);
}

// Update game UI
function updateGameUI() {
    const ui = document.getElementById('gameUI');
    if (!gameStarted) {
        ui.innerHTML = 'Waiting for players...';
        return;
    }

    if (isInfected) {
        ui.innerHTML = `You are INFECTED! Chase others!<br>Survivors left: ${survivorCount}`;
        ui.style.color = '#ff4444';
    } else {
        ui.innerHTML = `RUN! Survivors left: ${survivorCount}`;
        ui.style.color = '#44ff44';
    }
}

// Create a player model
function createPlayerModel(infected = false, playerUsername = '') {
    console.log('Creating player model with username:', playerUsername);
    const group = new THREE.Group(); // Create a group to hold player and text

    // Create player body
    const geometry = new THREE.BoxGeometry(1, 2, 1);
    const material = new THREE.MeshStandardMaterial({ 
        color: infected ? 0xff0000 : 0x00ff00,
        roughness: 0.5,
        metalness: 0.5,
        emissive: infected ? 0xff0000 : 0x00ff00,
        emissiveIntensity: infected ? 0.5 : 0
    });
    const player = new THREE.Mesh(geometry, material);
    group.add(player);

    // Add username text
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    canvas.width = 256;
    canvas.height = 64;
    context.fillStyle = '#ffffff';
    context.font = 'bold 48px Arial';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    
    // Add text shadow for better visibility
    context.shadowColor = 'rgba(0, 0, 0, 0.5)';
    context.shadowBlur = 4;
    context.shadowOffsetX = 2;
    context.shadowOffsetY = 2;
    
    context.fillText(playerUsername || username, canvas.width / 2, canvas.height / 2);
    
    const textTexture = new THREE.CanvasTexture(canvas);
    const textMaterial = new THREE.MeshBasicMaterial({
        map: textTexture,
        transparent: true,
        side: THREE.DoubleSide,
        depthTest: false // Make sure text is always visible
    });
    
    const textGeometry = new THREE.PlaneGeometry(2, 0.5);
    const textMesh = new THREE.Mesh(textGeometry, textMaterial);
    textMesh.position.y = 2.5;
    textMesh.renderOrder = 1; // Ensure text renders on top
    group.add(textMesh);

    // Store reference to the body mesh for color updates
    group.bodyMesh = player;
    
    // Add update function to keep text facing camera
    group.onBeforeRender = function() {
        if (camera) {
            textMesh.rotation.copy(camera.rotation);
        }
    };

    return group;
}

// Handle window resize
function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
}

// Initialize socket connection
function initSocket() {
    console.log('\n=== Initializing Socket Connection ===');
    socket = io();

    socket.on('connect', () => {
        console.log('\nConnected to server with ID:', socket.id);
        // Update local player's ID once we have it
        if (localPlayer) {
            console.log('Updating local player ID:', socket.id);
            localPlayer.userData.id = socket.id;
            // Add local player to players Map
            players.set(socket.id, localPlayer);
            console.log('Added local player to players Map');
            console.log('Current players:', Array.from(players.entries()).map(([id, p]) => `${p.userData.username}(${id})`));
        }
    });

    socket.on('gameState', (state) => {
        console.log('Received game state:', state);
        gameStarted = state.started;
        survivorCount = state.survivorCount;
        updateGameUI();
    });

    socket.on('infected', (playerId) => {
        console.log('Infection event received for player:', playerId);
        if (playerId === socket.id) {
            console.log('Local player infected');
            isInfected = true;
            updatePlayerColor(localPlayer, true);
        }
        if (players.has(playerId)) {
            console.log('Updating infected state for player:', playerId);
            const player = players.get(playerId);
            updatePlayerColor(player, true);
        }
        updateGameUI();
    });

    socket.on('currentPlayers', (serverPlayers) => {
        console.log('\n=== Current Players Event ===');
        console.log('My socket ID:', socket.id);
        console.log('Local player username:', localPlayer.userData.username);
        console.log('Received players:', serverPlayers.map(p => `${p.username}(${p.id})`));
        console.log('Current scene players:', Array.from(players.entries()).map(([id, p]) => `${p.userData.username}(${id})`));
        
        // Clear existing remote players (keep local player)
        players.forEach((player, id) => {
            if (id !== socket.id) {
                console.log('Removing remote player from scene:', player.userData?.username);
                scene.remove(player);
                players.delete(id);
            }
        });
        
        // Add all remote players
        serverPlayers.forEach((playerInfo) => {
            console.log('\nProcessing player from server:', playerInfo.username, '(ID:', playerInfo.id, ')');
            console.log('Is this the local player?', playerInfo.id === socket.id);
            
            if (playerInfo.id === socket.id) {
                console.log('Updating local player position:', playerInfo.position);
                // Update local player position from server
                localPlayer.position.copy(playerInfo.position);
                localPlayer.rotation.y = playerInfo.rotation.y;
                return;
            }
            
            console.log('Adding remote player to scene:', playerInfo.username);
            const addedPlayer = addPlayer(playerInfo);
            console.log('Player added successfully:', addedPlayer ? 'yes' : 'no');
        });
        
        console.log('\nFinal players in scene:', Array.from(players.entries()).map(([id, p]) => `${p.userData.username}(${id})`));
        console.log('Scene children count:', scene.children.length);
        console.log('=== End Current Players Event ===\n');
    });

    socket.on('playerJoined', (playerInfo) => {
        console.log('\n=== Player Joined Event ===');
        console.log('New player:', playerInfo.username, 'ID:', playerInfo.id);
        console.log('My socket ID:', socket.id);
        console.log('Current scene players:', Array.from(players.entries()).map(([id, p]) => `${p.userData.username}(${id})`));
        
        // Only add other players, not ourselves
        if (playerInfo.id !== socket.id) {
            console.log('Adding new remote player to scene:', playerInfo.username);
            const addedPlayer = addPlayer(playerInfo);
            console.log('Player added successfully:', addedPlayer ? 'yes' : 'no');
            console.log('Updated players in scene:', Array.from(players.entries()).map(([id, p]) => `${p.userData.username}(${id})`));
        } else {
            console.log('Ignoring local player join event');
        }
        console.log('=== End Player Joined Event ===\n');
    });

    socket.on('playerMoved', (playerInfo) => {
        if (players.has(playerInfo.id)) {
            const player = players.get(playerInfo.id);
            player.position.set(playerInfo.position.x, playerInfo.position.y, playerInfo.position.z);
            player.rotation.y = playerInfo.rotation.y;
        }
    });

    socket.on('playerLeft', (playerId) => {
        console.log('\n=== Player Left Event ===');
        console.log('Player left:', playerId);
        console.log('Current players before removal:', Array.from(players.entries()).map(([id, p]) => `${p.userData.username}(${id})`));
        if (players.has(playerId)) {
            const player = players.get(playerId);
            console.log('Removing player:', player.userData.username);
            scene.remove(player);
            players.delete(playerId);
        }
        console.log('Players remaining:', Array.from(players.entries()).map(([id, p]) => `${p.userData.username}(${id})`));
        console.log('=== End Player Left Event ===\n');
    });

    socket.on('gameOver', (winnerId) => {
        const ui = document.getElementById('gameUI');
        if (winnerId === socket.id) {
            ui.innerHTML = 'You survived! You win! 🎉';
            ui.style.color = '#44ff44';
        } else {
            ui.innerHTML = 'Game Over! Better luck next time!';
            ui.style.color = '#ff4444';
        }
    });
}

// Update player color
function updatePlayerColor(player, infected) {
    if (!player || !player.bodyMesh || !player.bodyMesh.material) {
        console.warn('Invalid player object for color update');
        return;
    }
    console.log('Updating player color, infected:', infected);
    const material = player.bodyMesh.material;
    material.color.setHex(infected ? 0xff0000 : 0x00ff00);
    material.emissive.setHex(infected ? 0xff0000 : 0x00ff00);
    material.emissiveIntensity = infected ? 0.5 : 0;
    material.needsUpdate = true;
}

// Check for infection collision
function checkInfection(targetPlayer, targetId) {
    const distance = localPlayer.position.distanceTo(targetPlayer.position);
    console.log('Checking infection, distance:', distance, 'to player:', targetId);
    if (distance < 2.5) {  // Slightly larger infection range
        console.log('Infection range reached, emitting infectPlayer event');
        socket.emit('infectPlayer', targetId);
    }
}

// Add a new player to the scene
function addPlayer(playerInfo) {
    console.log('=== Adding Player ===');
    console.log('Player info:', playerInfo);
    
    // Remove existing player if present
    if (players.has(playerInfo.id)) {
        console.log('Removing existing player:', playerInfo.id);
        const existingPlayer = players.get(playerInfo.id);
        scene.remove(existingPlayer);
        players.delete(playerInfo.id);
    }
    
    // Create new player model
    const playerModel = createPlayerModel(playerInfo.infected, playerInfo.username);
    playerModel.position.set(
        playerInfo.position.x,
        playerInfo.position.y || 1,
        playerInfo.position.z
    );
    playerModel.rotation.y = playerInfo.rotation.y;
    
    // Store username and ID in userData for debugging
    playerModel.userData = { 
        username: playerInfo.username,
        id: playerInfo.id
    };
    
    scene.add(playerModel);
    players.set(playerInfo.id, playerModel);
    
    console.log('Player added to scene:', playerInfo.username);
    console.log('All players:', Array.from(players.entries()).map(([id, p]) => `${p.userData.username}(${id})`));
    console.log('=== End Adding Player ===');
    
    return playerModel;
}

// Start the game
window.startGame = function() {
    console.log('Starting game...');
    const usernameInput = document.getElementById('username-input');
    username = usernameInput.value.trim();
    
    if (username) {
        document.getElementById('username-modal').classList.remove('visible');
        init();
        initSocket();
        
        // Create local player with random starting position
        const randomX = (Math.random() - 0.5) * 20;
        const randomZ = (Math.random() - 0.5) * 20;
        localPlayer = createPlayerModel(false, username);
        localPlayer.position.set(randomX, 1, randomZ);
        localPlayer.userData = { 
            username: username,
            id: socket?.id || null  // Use socket.id if available
        };
        scene.add(localPlayer);
        
        // If socket is already connected, add to players Map
        if (socket && socket.id) {
            players.set(socket.id, localPlayer);
        }
        
        // Send new player info to server with position
        socket.emit('newPlayer', {
            username: username,
            position: {
                x: randomX,
                y: 1,
                z: randomZ
            }
        });
        
        // Start game loop
        animate();
    }
};

// Handle player movement
function handleMovement() {
    if (!localPlayer) return;

    const speed = 0.2;
    const rotationSpeed = 0.05;

    // Calculate new position
    let newPosition = localPlayer.position.clone();
    if (keys.ArrowUp) newPosition.z -= speed;
    if (keys.ArrowDown) newPosition.z += speed;
    if (keys.ArrowLeft) newPosition.x -= speed;
    if (keys.ArrowRight) newPosition.x += speed;

    // Check boundaries
    newPosition.x = Math.max(-14, Math.min(14, newPosition.x));
    newPosition.z = Math.max(-14, Math.min(14, newPosition.z));
    
    localPlayer.position.copy(newPosition);

    if (keys.KeyQ) localPlayer.rotation.y += rotationSpeed;
    if (keys.KeyE) localPlayer.rotation.y -= rotationSpeed;

    // Check for infections if player is infected
    if (isInfected) {
        players.forEach((player, id) => {
            checkInfection(player, id);
        });
    }

    // Emit position to server
    socket.emit('playerMovement', {
        position: localPlayer.position,
        rotation: localPlayer.rotation,
        infected: isInfected
    });
}

// Track keyboard input
const keys = {
    ArrowUp: false,
    ArrowDown: false,
    ArrowLeft: false,
    ArrowRight: false,
    KeyQ: false,
    KeyE: false
};

window.addEventListener('keydown', (e) => {
    if (keys.hasOwnProperty(e.code)) {
        keys[e.code] = true;
    }
});

window.addEventListener('keyup', (e) => {
    if (keys.hasOwnProperty(e.code)) {
        keys[e.code] = false;
    }
});

// Animation loop
function animate() {
    requestAnimationFrame(animate);
    handleMovement();

    // Update all player billboards to face camera
    players.forEach(player => {
        if (player.onBeforeRender) {
            player.onBeforeRender();
        }
    });
    if (localPlayer && localPlayer.onBeforeRender) {
        localPlayer.onBeforeRender();
    }

    renderer.render(scene, camera);
}

// Show username modal on load
document.getElementById('username-modal').classList.add('visible'); 
import * as THREE from 'three';

// Three.js setup
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

// Add platform
const platformGeometry = new THREE.BoxGeometry(20, 1, 20);
const platformMaterial = new THREE.MeshBasicMaterial({ color: 0x404040 });
const platform = new THREE.Mesh(platformGeometry, platformMaterial);
scene.add(platform);

// UI elements
const notifications = document.getElementById('notifications');
const gameStatus = document.getElementById('game-status');

function showNotification(message, duration = 3000) {
    notifications.textContent = message;
    notifications.style.display = 'block';
    setTimeout(() => {
        notifications.style.display = 'none';
    }, duration);
}

function updateGameStatus(message) {
    gameStatus.textContent = message;
}

// Player class
class Player {
    constructor(id, username, position = { x: 0, y: 1, z: 0 }, isInfected = false) {
        this.id = id;
        this.username = username;
        this.isInfected = isInfected;
        
        // Create player mesh with larger size and emissive material
        const geometry = new THREE.BoxGeometry(1, 2, 1);
        const material = new THREE.MeshPhongMaterial({ 
            color: isInfected ? 0xff0000 : 0x00ff00,
            emissive: isInfected ? 0x600000 : 0x006000,
            shininess: 30
        });
        this.mesh = new THREE.Mesh(geometry, material);
        
        // Set initial position
        this.mesh.position.set(position.x, position.y, position.z);

        // Create player name label
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        canvas.width = 256;
        canvas.height = 64;
        context.font = '24px Arial';
        context.fillStyle = 'white';
        context.textAlign = 'center';
        context.fillText(username, canvas.width/2, canvas.height/2);
        
        const texture = new THREE.CanvasTexture(canvas);
        const labelMaterial = new THREE.SpriteMaterial({ map: texture });
        this.label = new THREE.Sprite(labelMaterial);
        this.label.scale.set(2, 0.5, 1);
        this.label.position.y = 2.5;
        this.mesh.add(this.label);
    }

    setInfected(infected) {
        this.isInfected = infected;
        if (this.mesh.material) {
            this.mesh.material.color.setHex(infected ? 0xff0000 : 0x00ff00);
            this.mesh.material.emissive.setHex(infected ? 0x600000 : 0x006000);
        }
    }

    updatePosition(position) {
        this.mesh.position.set(position.x, position.y, position.z);
    }
}

// Game state
const players = new Map();
let playerId = null;
let localPlayer = null;
let username = '';
const moveSpeed = 0.2;
const keys = { ArrowUp: false, ArrowDown: false, ArrowLeft: false, ArrowRight: false };

// Initialize Socket.IO
const socket = io(window.location.origin);

// Socket event handlers
socket.on('connect', () => {
    playerId = socket.id;
    showUsernameModal();
    updateGameStatus('Waiting for players...');
});

socket.on('currentPlayers', (playersList) => {
    console.log('Received current players:', playersList);
    playersList.forEach(playerInfo => {
        if (playerInfo.id !== playerId && !players.has(playerInfo.id)) {
            console.log('Creating player:', playerInfo.username);
            const player = new Player(playerInfo.id, playerInfo.username, playerInfo.position, playerInfo.infected);
            players.set(playerInfo.id, player);
            scene.add(player.mesh);
            console.log('Added player mesh to scene:', playerInfo.username);
            showNotification(`${playerInfo.username} is already in the game`);
        }
    });
    updatePlayerCount();
});

socket.on('playerJoined', (playerData) => {
    console.log('Player joined:', playerData);
    if (playerData.id !== playerId && !players.has(playerData.id)) {
        console.log('Creating new player:', playerData.username);
        const player = new Player(playerData.id, playerData.username, playerData.position, playerData.infected);
        players.set(playerData.id, player);
        scene.add(player.mesh);
        console.log('Added new player mesh to scene:', playerData.username);
        showNotification(`${playerData.username} joined the game`);
        updatePlayerCount();
    }
});

socket.on('playerLeft', (id) => {
    const player = players.get(id);
    if (player) {
        showNotification(`${player.username} left the game`);
        scene.remove(player.mesh);
        players.delete(id);
        updatePlayerCount();
    }
});

socket.on('playerMoved', (playerData) => {
    const player = players.get(playerData.id);
    if (player) {
        player.updatePosition(playerData.position);
        player.mesh.rotation.y = playerData.rotation.y;
        player.setInfected(playerData.infected);
    }
});

socket.on('infected', (playerId) => {
    const player = players.get(playerId);
    if (player) {
        player.setInfected(true);
        showNotification(`${player.username} was infected!`);
    }
    if (playerId === socket.id) {
        localPlayer.setInfected(true);
        showNotification('You were infected! Chase others!');
    }
});

socket.on('gameState', (state) => {
    if (state.started) {
        updateGameStatus(`Game in progress - ${state.survivorCount} survivors remaining`);
    } else if (state.message) {
        updateGameStatus(state.message);
    } else {
        updateGameStatus(`Waiting for players (${players.size + 1}/2 ready)`);
    }
});

function updatePlayerCount() {
    const totalPlayers = players.size + (localPlayer ? 1 : 0);
    if (totalPlayers < 2) {
        updateGameStatus(`Waiting for more players (${totalPlayers}/2 needed)`);
    }
}

// Input handling
document.addEventListener('keydown', (event) => {
    if (keys.hasOwnProperty(event.code)) {
        keys[event.code] = true;
    }
});

document.addEventListener('keyup', (event) => {
    if (keys.hasOwnProperty(event.code)) {
        keys[event.code] = false;
    }
});

// Game loop
function animate() {
    requestAnimationFrame(animate);
    
    if (localPlayer) {
        // Handle movement
        if (keys.ArrowUp) localPlayer.mesh.position.z -= moveSpeed;
        if (keys.ArrowDown) localPlayer.mesh.position.z += moveSpeed;
        if (keys.ArrowLeft) localPlayer.mesh.position.x -= moveSpeed;
        if (keys.ArrowRight) localPlayer.mesh.position.x += moveSpeed;

        // Keep player on platform
        localPlayer.mesh.position.x = Math.max(-10, Math.min(10, localPlayer.mesh.position.x));
        localPlayer.mesh.position.z = Math.max(-10, Math.min(10, localPlayer.mesh.position.z));

        // Emit movement
        socket.emit('playerMovement', {
            position: localPlayer.mesh.position,
            rotation: localPlayer.mesh.rotation,
            infected: localPlayer.isInfected
        });

        // Check for infections if player is infected
        if (localPlayer.isInfected) {
            players.forEach((player, id) => {
                if (!player.isInfected) {
                    const dx = player.mesh.position.x - localPlayer.mesh.position.x;
                    const dz = player.mesh.position.z - localPlayer.mesh.position.z;
                    const distance = Math.sqrt(dx * dx + dz * dz);
                    
                    if (distance < 2.5) {
                        socket.emit('infectPlayer', id);
                    }
                }
            });
        }
    }

    renderer.render(scene, camera);
}

// Set up camera
camera.position.y = 15;
camera.position.z = 15;
camera.rotation.x = -Math.PI / 4; // Tilt the camera down

// Username modal handling
function showUsernameModal() {
    const modal = document.getElementById('username-modal');
    modal.classList.add('visible');
}

// Make startGame available globally
window.startGame = function() {
    const usernameInput = document.getElementById('username-input');
    username = usernameInput.value.trim();
    
    if (username) {
        const modal = document.getElementById('username-modal');
        modal.classList.remove('visible');
        
        // Create local player
        localPlayer = new Player(playerId, username);
        scene.add(localPlayer.mesh);
        
        // Notify server
        socket.emit('newPlayer', {
            username: username,
            position: { x: 0, y: 1, z: 0 }
        });
        
        showNotification('You joined the game!');
        updatePlayerCount();
        
        // Start animation loop
        animate();
    }
}

// Handle window resize
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

// Add lighting to the scene (add this after scene creation)
const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
scene.add(ambientLight);

const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
directionalLight.position.set(10, 20, 10);
scene.add(directionalLight); 
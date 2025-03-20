import * as THREE from 'three';

// Three.js setup
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer();
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

// Add platform
const platformGeometry = new THREE.BoxGeometry(20, 1, 20);
const platformMaterial = new THREE.MeshBasicMaterial({ color: 0x404040 });
const platform = new THREE.Mesh(platformGeometry, platformMaterial);
scene.add(platform);

// Player class
class Player {
    constructor(id, position = { x: 0, y: 1, z: 0 }, isInfected = false) {
        this.id = id;
        this.isInfected = isInfected;
        
        // Create player mesh
        const geometry = new THREE.BoxGeometry(1, 2, 1);
        const material = new THREE.MeshBasicMaterial({ color: isInfected ? 0xff0000 : 0x00ff00 });
        this.mesh = new THREE.Mesh(geometry, material);
        
        // Set initial position
        this.mesh.position.set(position.x, position.y, position.z);
    }

    setInfected(infected) {
        this.isInfected = infected;
        this.mesh.material.color.setHex(infected ? 0xff0000 : 0x00ff00);
    }
}

// Game state
const players = new Map();
let playerId = null;
let localPlayer = null;
const moveSpeed = 0.2;
const keys = { ArrowUp: false, ArrowDown: false, ArrowLeft: false, ArrowRight: false };

// Initialize Socket.IO
const socket = io(window.location.origin);

// Socket event handlers
socket.on('connect', () => {
    playerId = socket.id;
    showUsernameModal();
});

socket.on('currentPlayers', (playersList) => {
    playersList.forEach(playerInfo => {
        if (playerInfo.id !== playerId && !players.has(playerInfo.id)) {
            const player = new Player(playerInfo.id, playerInfo.position, playerInfo.infected);
            players.set(playerInfo.id, player);
            scene.add(player.mesh);
        }
    });
});

socket.on('playerJoined', (playerData) => {
    if (playerData.id !== playerId && !players.has(playerData.id)) {
        const player = new Player(playerData.id, playerData.position, playerData.infected);
        players.set(playerData.id, player);
        scene.add(player.mesh);
    }
});

socket.on('playerLeft', (playerId) => {
    const player = players.get(playerId);
    if (player) {
        scene.remove(player.mesh);
        players.delete(playerId);
    }
});

socket.on('playerMoved', (playerData) => {
    const player = players.get(playerData.id);
    if (player) {
        player.mesh.position.set(playerData.position.x, playerData.position.y, playerData.position.z);
        player.mesh.rotation.y = playerData.rotation.y;
        player.setInfected(playerData.infected);
    }
});

socket.on('infected', (playerId) => {
    const player = players.get(playerId);
    if (player) {
        player.setInfected(true);
    }
    if (playerId === socket.id) {
        localPlayer.setInfected(true);
    }
});

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
camera.position.y = 20;
camera.position.z = 0;
camera.lookAt(0, 0, 0);

// Username modal handling
function showUsernameModal() {
    const modal = document.getElementById('username-modal');
    modal.classList.add('visible');
}

// Make startGame available globally
window.startGame = function() {
    const usernameInput = document.getElementById('username-input');
    const username = usernameInput.value.trim();
    
    if (username) {
        const modal = document.getElementById('username-modal');
        modal.classList.remove('visible');
        
        // Create local player
        localPlayer = new Player(playerId);
        scene.add(localPlayer.mesh);
        
        // Notify server
        socket.emit('newPlayer', {
            username: username,
            position: { x: 0, y: 1, z: 0 }
        });
        
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
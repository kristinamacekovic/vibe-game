// Initialize Socket.IO
const socket = io(window.location.origin);

socket.on('playerJoined', (playerData) => {
    console.log('Received playerJoined event for player:', playerData.id, '(local:', playerData.id === playerId, ')');
    
    // Don't add the player if they already exist
    if (players.has(playerData.id)) {
        console.log('Player already exists, skipping:', playerData.id);
        return;
    }

    // Don't add the local player here - it's already added in the connection handler
    if (playerData.id === playerId) {
        console.log('Skipping local player in playerJoined event');
        return;
    }

    const player = new Player(playerData.id, playerData.position, playerData.isInfected);
    players.set(playerData.id, player);
    scene.add(player.mesh);
    console.log('Added remote player:', playerData.id);
}); 
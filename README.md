# Vibe Game

A chill multiplayer web game where players can hang out and move around in a 3D space.

## Architecture

```mermaid
graph TB
    subgraph Client
        UI[HTML/CSS UI]
        Three[Three.js Renderer]
        GameState[Game State]
        Controls[Input Controls]
        
        subgraph Player Components
            LocalPlayer[Local Player]
            RemotePlayers[Remote Players]
            PlayerMesh[3D Player Mesh]
        end
        
        Controls --> GameState
        GameState --> Three
        PlayerMesh --> Three
        UI --> GameState
    end

    subgraph Server
        SocketIO[Socket.IO Server]
        PlayerManager[Player Manager]
        GameLogic[Game Logic]
        
        subgraph Game State
            Players[Players Map]
            Infections[Infection State]
            GameStatus[Game Status]
        end
        
        PlayerManager --> Players
        GameLogic --> Infections
        GameLogic --> GameStatus
    end

    %% Communication
    Client -- Socket Events --> Server
    Server -- State Updates --> Client
    
    %% Event Types
    Events[Key Events:]
    Events --> E1[playerJoined]
    Events --> E2[playerLeft]
    Events --> E3[playerMoved]
    Events --> E4[infected]
    Events --> E5[gameState]

classDef clientNode fill:#e1f5fe,stroke:#01579b
classDef serverNode fill:#f3e5f5,stroke:#4a148c
classDef eventNode fill:#fff3e0,stroke:#e65100

class UI,Three,GameState,Controls,LocalPlayer,RemotePlayers,PlayerMesh clientNode
class SocketIO,PlayerManager,GameLogic,Players,Infections,GameStatus serverNode
class Events,E1,E2,E3,E4,E5 eventNode
```

## Features

- Instant play - no downloads required
- Multiplayer support
- Simple and intuitive controls
- Real-time player movement

## Setup

1. Install dependencies:
```bash
npm install
```

2. Start the server:
```bash
npm start
```

3. Open your browser and navigate to `http://localhost:3000`

## Controls

- Arrow Keys: Move around
- Q/E: Rotate left/right

## Development

To run the server in development mode with auto-reload:
```bash
npm run dev
``` 
# Vibe Game

A multiplayer web game where players can interact and chase each other.

## Setup

1. Install dependencies:
```bash
npm install
```

2. Run the server:
```bash
npm start
```

For development with auto-reload:
```bash
npm run dev
```

## Deployment

This application is ready to be deployed to platforms like Render.com or Heroku.

### Environment Variables

- `PORT`: The port number for the server (default: 3000)

## Game Rules

- Players can move around using arrow keys or WASD
- Infected players (red) can chase and infect other players
- Survivors (green) must run away from infected players
- Last survivor wins! 
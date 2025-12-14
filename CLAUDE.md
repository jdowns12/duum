# DUUM Game

## Quick Reference
- **Port**: 5054
- **Service**: `sudo systemctl restart doom`
- **Local**: http://192.168.1.5:5054
- **Version**: v1.4.0 (November 30, 2025)

## Purpose
Browser-based DOOM-style raycasting 3D shooter game with leaderboards.

## Key Features
- Raycasting 3D engine (classic DOOM style)
- 24x24 tile map with 4 connected rooms
- Multiple weapons: Pistol, Shotgun (7-pellet), Chaingun
- Resources: Health, Ammo, Tokens (for doors), Nuke power-up
- Dual difficulty: Easy (aim assist) / Normal (manual)
- Mobile-friendly with touchscreen joystick
- Leaderboard by difficulty
- Settings: Sensitivity, button size, fullscreen

## Game Mechanics
- Enemies spawn and scale with progression
- Tokens unlock doors (farther = more expensive)
- Mystery boxes give random rewards
- Nuke has 2-minute cooldown

## Map Layout (v1.4.0)
- Room 1: Starting arena with cover pillars
- Room 2: Side corridor
- Room 3: Back hall with pillars
- Room 4: Boss arena

## Key Files
- `app.py` - Flask application
- `models.py` - HighScore and GameSession models
- `database.py` - SQLAlchemy initialization
- `config.py` - Port 5054, DEBUG=False
- `static/js/game.js` (3525 lines) - Game engine
- `templates/game.html` - Game view
- `templates/leaderboard.html` - Score rankings

## Database
- SQLite at `data/doom.db`
- Tracks: player name, score, level, kills, time, mode

## Mobile Controls
- Movement joystick (bottom-left)
- Turn buttons (left/right arrows)
- Fire button (bottom-right, large red)
- Nuke button (radioactive symbol)

## Dependencies
- Flask, Flask-SQLAlchemy, python-dotenv

## Notes
- No git repo
- Development server (not production WSGI)
- Local access only

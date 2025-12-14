// DOOM-style Raycasting Engine
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const minimapCanvas = document.getElementById('minimap');
const minimapCtx = minimapCanvas.getContext('2d');

// Responsive game settings
let SCREEN_WIDTH, SCREEN_HEIGHT, HUD_HEIGHT;

function updateScreenSize() {
    // Only consider it mobile if it has touch AND coarse pointer (actual touch device)
    const isMobile = window.matchMedia('(pointer: coarse)').matches;
    HUD_HEIGHT = isMobile ? 50 : 60;
    // Mobile controls now overlay on canvas, don't subtract height
    SCREEN_WIDTH = window.innerWidth;
    SCREEN_HEIGHT = window.innerHeight - HUD_HEIGHT;
    canvas.width = SCREEN_WIDTH;
    canvas.height = SCREEN_HEIGHT;

    const minimapSize = window.innerWidth <= 600 ? 60 : (isMobile ? 80 : 100);
    minimapCanvas.width = minimapSize;
    minimapCanvas.height = minimapSize;
}

updateScreenSize();

const MAP_SIZE = 24;
const TILE_SIZE = 64;
const FOV = Math.PI / 3;
const HALF_FOV = FOV / 2;
const MAX_DEPTH = MAP_SIZE * TILE_SIZE;

// Map (1 = wall, 0 = empty, 2 = enemy spawn, 3 = locked door, 4 = unlocked door)
// Large map with multiple rooms connected by locked doors
// Room 1: Starting arena (top-left)
// Room 2: Side corridor (top-right) - door at col 15
// Room 3: Back hall (bottom-left) - door at row 11
// Room 4: Boss arena (bottom-right) - door at row 17
const map = [
    //0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1 2 3
    [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],  // 0
    [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,2,0,0,0,0,0,2,1],  // 1 - Room 1 + Room 2 (locked)
    [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,0,0,0,1,0,0,0,1],  // 2
    [1,0,0,1,0,0,0,0,0,0,0,0,1,0,0,1,0,0,0,0,0,0,0,1],  // 3 - Pillars
    [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,0,1,0,0,0,1,0,1],  // 4
    [1,0,0,0,0,0,1,0,0,1,0,0,0,0,0,3,0,0,0,0,0,0,0,1],  // 5 - DOOR to Room 2
    [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,0,0,0,1,0,0,0,1],  // 6
    [1,0,0,1,0,0,0,0,0,0,0,0,1,0,0,1,0,1,0,0,0,1,0,1],  // 7
    [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,2,0,0,0,0,0,2,1],  // 8
    [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,1,1,1,1,1,1,1,1],  // 9
    [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,1,1,1,1,1,1,1,1],  // 10
    [1,1,1,1,1,3,1,1,1,1,3,1,1,1,1,1,1,1,1,1,1,1,1,1],  // 11 - DOORS to Room 3
    [1,2,0,0,0,0,0,0,0,0,0,0,0,0,2,1,1,1,1,1,1,1,1,1],  // 12 - Room 3: Back hall
    [1,0,0,1,0,0,0,1,0,0,1,0,0,1,0,1,1,1,1,1,1,1,1,1],  // 13
    [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,1,1,1,1,1,1,1,1],  // 14
    [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,1,1,1,1,1,1,1,1],  // 15
    [1,2,0,1,0,0,0,1,0,0,1,0,0,1,2,1,1,1,1,1,1,1,1,1],  // 16
    [1,1,1,1,1,3,1,1,1,1,3,1,1,1,1,1,1,1,1,1,1,1,1,1],  // 17 - DOORS to Room 4
    [1,2,0,0,0,0,0,0,0,0,0,0,0,0,2,1,1,1,1,1,1,1,1,1],  // 18 - Room 4: Boss arena
    [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,1,1,1,1,1,1,1,1],  // 19
    [1,0,0,1,0,0,0,0,0,0,0,0,1,0,0,1,1,1,1,1,1,1,1,1],  // 20
    [1,0,0,0,0,0,0,1,1,0,0,0,0,0,0,1,1,1,1,1,1,1,1,1],  // 21 - Center pillars
    [1,2,0,0,0,0,0,0,0,0,0,0,0,0,2,1,1,1,1,1,1,1,1,1],  // 22
    [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1]   // 23
];

// Load sensitivity from localStorage
const savedSensitivity = parseInt(localStorage.getItem('duum_sensitivity')) || 5;
const baseRotSpeed = 0.03;

// Player - spawn in center of Room 1 (starting arena)
let player = {
    x: TILE_SIZE * 7.5,  // Center of Room 1 (cols 1-14)
    y: TILE_SIZE * 5.5,  // Center vertically in Room 1
    angle: Math.PI / 2,  // Face downward (toward doors)
    speed: 3,
    rotSpeed: baseRotSpeed * (savedSensitivity / 5) // Scale by sensitivity
};

// Settings functions (for game over screen)
window.openSettings = function() {
    document.getElementById('settingsModal').classList.add('active');
    const savedSens = localStorage.getItem('duum_sensitivity') || 5;
    document.getElementById('sensitivitySlider').value = savedSens;
    document.getElementById('sensitivityValue').textContent = savedSens;

    const savedBtnSize = localStorage.getItem('duum_button_size') || 100;
    document.getElementById('buttonSizeSlider').value = savedBtnSize;
    document.getElementById('buttonSizeValue').textContent = savedBtnSize + '%';
};

window.closeSettings = function() {
    document.getElementById('settingsModal').classList.remove('active');
};

// Background Music
const bgMusic = document.getElementById('bgMusic');
let musicMuted = localStorage.getItem('duum_music_muted') === 'true';

function initMusic() {
    if (bgMusic) {
        bgMusic.volume = 0.5;
        bgMusic.muted = musicMuted;
        updateMusicButton();
        // Autoplay requires user interaction, so we try on first click/touch
        const startMusic = () => {
            bgMusic.play().catch(() => {});
            document.removeEventListener('click', startMusic);
            document.removeEventListener('touchstart', startMusic);
            document.removeEventListener('keydown', startMusic);
        };
        document.addEventListener('click', startMusic);
        document.addEventListener('touchstart', startMusic);
        document.addEventListener('keydown', startMusic);
    }
}

function updateMusicButton() {
    const btn = document.getElementById('musicBtn');
    if (btn) {
        btn.textContent = musicMuted ? 'UNMUTE' : 'MUTE';
    }
}

window.toggleMusic = function() {
    musicMuted = !musicMuted;
    localStorage.setItem('duum_music_muted', musicMuted);
    if (bgMusic) {
        bgMusic.muted = musicMuted;
    }
    updateMusicButton();
};

initMusic();

window.saveSettings = function() {
    const sensValue = document.getElementById('sensitivitySlider').value;
    localStorage.setItem('duum_sensitivity', sensValue);
    player.rotSpeed = baseRotSpeed * (sensValue / 5);

    const btnSizeValue = document.getElementById('buttonSizeSlider').value;
    localStorage.setItem('duum_button_size', btnSizeValue);
    applyButtonSize(btnSizeValue);

    closeSettings();
};

// Apply button size scaling to mobile controls
function applyButtonSize(percent) {
    const scale = percent / 100;
    const controls = {
        'joystickArea': { width: 120, height: 120 },
        'joystickBase': { width: 100, height: 100 },
        'joystickThumb': { width: 45, height: 45 },
        'fireButton': { width: 90, height: 90 },
        'flipButton': { width: 65, height: 65 }
    };

    for (const [id, sizes] of Object.entries(controls)) {
        const el = document.getElementById(id);
        if (el) {
            el.style.width = (sizes.width * scale) + 'px';
            el.style.height = (sizes.height * scale) + 'px';
        }
    }
}

// Fullscreen toggle
window.toggleFullscreen = function() {
    if (!document.fullscreenElement && !document.webkitFullscreenElement && !document.mozFullScreenElement) {
        // Enter fullscreen
        const elem = document.documentElement;
        if (elem.requestFullscreen) {
            elem.requestFullscreen();
        } else if (elem.webkitRequestFullscreen) {
            elem.webkitRequestFullscreen();
        } else if (elem.mozRequestFullScreen) {
            elem.mozRequestFullScreen();
        } else if (elem.msRequestFullscreen) {
            elem.msRequestFullscreen();
        }
    } else {
        // Exit fullscreen
        if (document.exitFullscreen) {
            document.exitFullscreen();
        } else if (document.webkitExitFullscreen) {
            document.webkitExitFullscreen();
        } else if (document.mozCancelFullScreen) {
            document.mozCancelFullScreen();
        } else if (document.msExitFullscreen) {
            document.msExitFullscreen();
        }
    }
};

// Update fullscreen button text
function updateFullscreenBtn() {
    const btn = document.getElementById('fullscreenBtn');
    if (btn) {
        if (document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement) {
            btn.textContent = 'EXIT FULLSCREEN';
        } else {
            btn.textContent = 'ENTER FULLSCREEN';
        }
    }
}

document.addEventListener('fullscreenchange', updateFullscreenBtn);
document.addEventListener('webkitfullscreenchange', updateFullscreenBtn);
document.addEventListener('mozfullscreenchange', updateFullscreenBtn);

// Setup slider event listeners
document.addEventListener('DOMContentLoaded', () => {
    const sensSlider = document.getElementById('sensitivitySlider');
    if (sensSlider) {
        sensSlider.addEventListener('input', (e) => {
            document.getElementById('sensitivityValue').textContent = e.target.value;
        });
    }

    const btnSizeSlider = document.getElementById('buttonSizeSlider');
    if (btnSizeSlider) {
        btnSizeSlider.addEventListener('input', (e) => {
            document.getElementById('buttonSizeValue').textContent = e.target.value + '%';
        });
    }

    // Apply saved button size on load
    const savedBtnSize = localStorage.getItem('duum_button_size') || 100;
    applyButtonSize(savedBtnSize);
});

// Game state
let gameState = {
    health: 100,
    ammo: 50,
    score: 0,
    kills: 0,
    tokens: 0,
    level: 1,
    startTime: Date.now(),
    gameOver: false,
    floorScrollDir: 1, // 1 = left, -1 = right
    doorsOpened: 0,
    firstDoorWarningShown: false,
    waveModifier: null, // Current wave modifier
    tokenMultiplier: 1.0, // Token multiplier for wave modifiers
    mode: 'normal' // Will be set from URL/localStorage
};

// Wave modifiers (roguelike effects)
const WAVE_MODIFIERS = [
    { id: 'double_points', name: 'DOUBLE TOKENS', color: '#ffcc00', description: '2x token rewards!' },
    { id: 'tough_crowd', name: 'TOUGH CROWD', color: '#8B0000', description: 'Enemies have +25% health' },
    { id: 'speed_demons', name: 'SPEED DEMONS', color: '#ff4444', description: 'Enemies move 20% faster' },
    { id: 'jackpot', name: 'JACKPOT WAVE', color: '#00ff00', description: '1.5x tokens from kills!' },
    { id: 'armored', name: 'ARMORED START', color: '#00ffff', description: '+25 bonus health!' },
    { id: 'ammo_drop', name: 'AMMO RAIN', color: '#ff8800', description: '+30 bonus ammo!' }
];

// Door system
let doors = [];

// Initialize doors by scanning the map for locked door tiles (type 3)
// Doors block passage until purchased with tokens
function initDoors() {
    doors = [];

    // Scan map for locked doors (tile type 3)
    for (let y = 0; y < MAP_SIZE; y++) {
        for (let x = 0; x < MAP_SIZE; x++) {
            if (map[y][x] === 3) {
                // Price increases based on distance from player spawn (center of Room 1)
                const distFromStart = Math.sqrt(Math.pow(x - 7.5, 2) + Math.pow(y - 5.5, 2));
                const basePrice = 20 + Math.floor(distFromStart * 3);
                const price = basePrice + Math.floor(Math.random() * 15);

                doors.push({
                    x: x,
                    y: y,
                    price: price,
                    unlocked: false
                });
            }
        }
    }
}

// Door proximity state
let nearbyDoor = null;

// Enemies
let enemies = [];

// Input
const keys = {};

// Mobile controls state
let mobileInput = {
    moveX: 0,      // Joystick horizontal (strafe)
    moveY: 0       // Joystick vertical (forward/back)
};

// Game mode ('easy' or 'normal') - read from URL or localStorage
const urlParams = new URLSearchParams(window.location.search);
const gameMode = urlParams.get('mode') || localStorage.getItem('duum_mode') || 'normal';
localStorage.setItem('duum_mode', gameMode); // Remember the mode

// Middle finger / Nuke state
let isFlipping = false;
let flipTimer = null;
let nukeCooldown = 0; // Timestamp when nuke becomes available
const NUKE_COOLDOWN_MS = 120000; // 2 minutes

// Nuke pickup
let nukePickup = null;

// Ammo pickup
let ammoPickup = null;

// Weapon system - DOOM-style with pellet counts and spread
const WEAPONS = {
    pistol: { name: 'PISTOL', damage: 15, color: '#888888', fireRate: 200, pellets: 1, spread: 0 },
    shotgun: { name: 'SHOTGUN', damage: 8, color: '#8B4513', fireRate: 600, pellets: 7, spread: 0.15 },  // 7 pellets like DOOM, 8 dmg each = 56 max
    plasma: { name: 'PLASMA', damage: 25, color: '#00ffff', fireRate: 100, pellets: 1, spread: 0 },
    chaingun: { name: 'CHAINGUN', damage: 12, color: '#ff8800', fireRate: 50, pellets: 1, spread: 0.05 },  // Slight spread
    bfg: { name: 'BFG 9000', damage: 100, color: '#00ff00', fireRate: 1500, pellets: 1, spread: 0 }
};

// Enemy hitbox sizes - per-type for better gameplay feel
const ENEMY_HITBOXES = {
    'blue':           { radius: 18 },
    'black':          { radius: 16 },  // Faster = smaller hitbox
    'white':          { radius: 20 },  // Tankier = bigger hitbox
    'small':          { radius: 10 },  // Hard to hit
    'fire':           { radius: 18 },
    'boss':           { radius: 30 },  // Big target
    'zombie':         { radius: 16 },
    'zombie_crawler': { radius: 12 },  // Low profile
    'zombie_tank':    { radius: 25 },  // Big boy
    'zombie_fire':    { radius: 16 }
};

// Hit feedback state
let hitMarker = { active: false, time: 0 };
let damageNumbers = []; // { x, y, damage, time, screenX, screenY }

let currentWeapon = 'pistol';
let lastFireTime = 0;
let weaponPickups = []; // Array of {x, y, type}

// Spawn weapon pickup in an area (after door opens)
function spawnWeaponPickup(nearX, nearY) {
    // Chance to spawn based on doors opened (more doors = better weapons)
    const roll = Math.random();
    const doorsOpened = gameState.doorsOpened;

    let weaponType = null;

    // Early game: shotgun
    if (doorsOpened <= 2 && roll < 0.5) {
        weaponType = 'shotgun';
    }
    // Mid game: plasma or chaingun
    else if (doorsOpened <= 4 && roll < 0.6) {
        weaponType = roll < 0.3 ? 'plasma' : 'chaingun';
    }
    // Late game: chance for BFG
    else if (doorsOpened > 4 && roll < 0.7) {
        if (roll < 0.15) {
            weaponType = 'bfg';
        } else if (roll < 0.4) {
            weaponType = 'plasma';
        } else {
            weaponType = 'chaingun';
        }
    }

    if (!weaponType) return;

    // Find empty spot near the door
    const searchRadius = 3;
    for (let dy = -searchRadius; dy <= searchRadius; dy++) {
        for (let dx = -searchRadius; dx <= searchRadius; dx++) {
            const tx = nearX + dx;
            const ty = nearY + dy;
            if (tx >= 0 && tx < MAP_SIZE && ty >= 0 && ty < MAP_SIZE) {
                if (map[ty][tx] === 0 || map[ty][tx] === 4) {
                    weaponPickups.push({
                        x: tx * TILE_SIZE + TILE_SIZE / 2,
                        y: ty * TILE_SIZE + TILE_SIZE / 2,
                        type: weaponType
                    });
                    return;
                }
            }
        }
    }
}

// Check if player picks up weapon
function checkWeaponPickup() {
    for (let i = weaponPickups.length - 1; i >= 0; i--) {
        const pickup = weaponPickups[i];
        const dx = player.x - pickup.x;
        const dy = player.y - pickup.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < TILE_SIZE * 0.7) {
            // Pick up weapon
            currentWeapon = pickup.type;
            weaponPickups.splice(i, 1);
            // Show weapon announcement
            showWeaponAnnouncement(WEAPONS[pickup.type].name);
            updateHUD();
        }
    }
}

// Weapon announcement state
let weaponAnnouncement = {
    showing: false,
    text: '',
    timer: null
};

function showWeaponAnnouncement(weaponName) {
    weaponAnnouncement.showing = true;
    weaponAnnouncement.text = 'GOT ' + weaponName + '!';
    if (weaponAnnouncement.timer) clearTimeout(weaponAnnouncement.timer);
    weaponAnnouncement.timer = setTimeout(() => {
        weaponAnnouncement.showing = false;
    }, 2000);
}

// Mystery box system
let mysteryBoxes = []; // Array of {x, y, price}
let mysteryBoxAnnouncement = {
    showing: false,
    text: '',
    color: '#ff00ff',
    timer: null
};

// Spawn mystery box after door opens or wave clears
function spawnMysteryBox() {
    // 30% chance to spawn
    if (Math.random() > 0.3) return;

    // Find empty spot
    for (let attempts = 0; attempts < 30; attempts++) {
        const x = Math.floor(Math.random() * (MAP_SIZE - 2)) + 1;
        const y = Math.floor(Math.random() * (MAP_SIZE - 2)) + 1;
        if (map[y][x] === 0 || map[y][x] === 4) {
            const price = 10 + Math.floor(Math.random() * 15) + (gameState.doorsOpened * 5);
            mysteryBoxes.push({
                x: x * TILE_SIZE + TILE_SIZE / 2,
                y: y * TILE_SIZE + TILE_SIZE / 2,
                price: price
            });
            return;
        }
    }
}

// Check if player is near mystery box
let nearbyMysteryBox = null;
function checkMysteryBoxProximity() {
    nearbyMysteryBox = null;
    for (let i = 0; i < mysteryBoxes.length; i++) {
        const box = mysteryBoxes[i];
        const dx = player.x - box.x;
        const dy = player.y - box.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < TILE_SIZE * 0.8) {
            nearbyMysteryBox = { box, index: i };
            return;
        }
    }
}

// Open mystery box
function openMysteryBox() {
    if (!nearbyMysteryBox) return;
    if (gameState.tokens < nearbyMysteryBox.box.price) return;

    gameState.tokens -= nearbyMysteryBox.box.price;
    mysteryBoxes.splice(nearbyMysteryBox.index, 1);
    nearbyMysteryBox = null;

    // Random reward
    const roll = Math.random();
    let rewardText = '';
    let rewardColor = '#ff00ff';

    if (roll < 0.20) {
        // Health boost
        const healthGain = 25 + Math.floor(Math.random() * 25);
        gameState.health = Math.min(150, gameState.health + healthGain);
        rewardText = '+' + healthGain + ' HEALTH!';
        rewardColor = '#00ff00';
    } else if (roll < 0.40) {
        // Ammo boost
        const ammoGain = 20 + Math.floor(Math.random() * 30);
        gameState.ammo = Math.min(150, gameState.ammo + ammoGain);
        rewardText = '+' + ammoGain + ' AMMO!';
        rewardColor = '#00ffff';
    } else if (roll < 0.55) {
        // Token jackpot
        const tokenGain = 15 + Math.floor(Math.random() * 25);
        gameState.tokens += tokenGain;
        rewardText = '+' + tokenGain + ' TOKENS!';
        rewardColor = '#ffcc00';
    } else if (roll < 0.70) {
        // Random weapon
        const weapons = ['shotgun', 'plasma', 'chaingun'];
        if (gameState.doorsOpened > 4) weapons.push('bfg');
        const randomWeapon = weapons[Math.floor(Math.random() * weapons.length)];
        currentWeapon = randomWeapon;
        rewardText = 'GOT ' + WEAPONS[randomWeapon].name + '!';
        rewardColor = WEAPONS[randomWeapon].color;
    } else if (roll < 0.85) {
        // Double damage buff (temporary)
        gameState.doubleDamage = true;
        gameState.doubleDamageEnd = Date.now() + 15000; // 15 seconds
        rewardText = 'DOUBLE DAMAGE! (15s)';
        rewardColor = '#ff4444';
    } else {
        // Bad luck - spawn enemies!
        const numEnemies = 2 + Math.floor(Math.random() * 3);
        spawnEnemiesFarFromPlayer(numEnemies);
        rewardText = 'DEMONS SUMMONED!';
        rewardColor = '#ff0000';
    }

    // Show announcement
    mysteryBoxAnnouncement.showing = true;
    mysteryBoxAnnouncement.text = rewardText;
    mysteryBoxAnnouncement.color = rewardColor;
    if (mysteryBoxAnnouncement.timer) clearTimeout(mysteryBoxAnnouncement.timer);
    mysteryBoxAnnouncement.timer = setTimeout(() => {
        mysteryBoxAnnouncement.showing = false;
    }, 2500);

    updateHUD();
}

// Gun animation state
let gunState = {
    shooting: false,
    frame: 0,
    recoil: 0
};

// Wave announcement state
let waveAnnouncement = {
    showing: false,
    wave: 1,
    timer: null
};

// Damage flash state
let damageFlashTimer = null;

// Show damage overlay
function showDamageFlash() {
    const overlay = document.getElementById('damageOverlay');
    if (overlay) {
        overlay.classList.add('active');
        if (damageFlashTimer) clearTimeout(damageFlashTimer);
        damageFlashTimer = setTimeout(() => {
            overlay.classList.remove('active');
        }, 1000);
    }
}

// Confetti particles
let confetti = [];

// Emoji rain particles
let emojiRain = [];
let emojiRainActive = false;
let emojiRainTimer = null;
const rainEmojis = ['💀', '👹', '🔥', '💥', '⚡', '☠️', '👾', '🎮', '🩸', '😈', '💦', '🍆', '💦', '🍆', '💦', '🍆'];

function startEmojiRain() {
    emojiRainActive = true;
    emojiRain = []; // Clear existing
    if (emojiRainTimer) clearTimeout(emojiRainTimer);
    emojiRainTimer = setTimeout(() => {
        emojiRainActive = false;
    }, 3000); // 3 seconds
}

function spawnEmojiRain() {
    // Only spawn when active (after clearing a wave)
    if (!emojiRainActive) return;

    // Spawn emojis (1/3 as many)
    if (Math.random() < 0.17) {
        emojiRain.push({
            x: Math.random() * SCREEN_WIDTH,
            y: -30,
            emoji: rainEmojis[Math.floor(Math.random() * rainEmojis.length)],
            speed: 3 + Math.random() * 4,
            size: 20 + Math.random() * 25,
            wobble: Math.random() * Math.PI * 2,
            wobbleSpeed: 0.05 + Math.random() * 0.1
        });
    }
}

function updateEmojiRain() {
    for (let i = emojiRain.length - 1; i >= 0; i--) {
        const e = emojiRain[i];
        e.y += e.speed;
        e.wobble += e.wobbleSpeed;
        e.x += Math.sin(e.wobble) * 1.5; // Wobble side to side

        // Remove if off screen (falls through whole screen, walls/floor cover it)
        if (e.y > SCREEN_HEIGHT + 50) {
            emojiRain.splice(i, 1);
        }
    }
    // Keep array reasonable size
    if (emojiRain.length > 80) {
        emojiRain.splice(0, 10);
    }
}

function renderEmojiRain() {
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    emojiRain.forEach(e => {
        ctx.font = `${e.size}px Arial`;
        // Full opacity - in front of sky, behind walls/floor
        ctx.globalAlpha = 1.0;
        ctx.fillText(e.emoji, e.x, e.y);
    });
    ctx.globalAlpha = 1;
    ctx.restore();
}

function spawnConfetti(screenX, screenY) {
    const colors = ['#ff0000', '#00ff00', '#0000ff', '#ffff00', '#ff00ff', '#00ffff', '#ff8800', '#88ff00'];
    for (let i = 0; i < 50; i++) {
        confetti.push({
            x: screenX,
            y: screenY,
            vx: (Math.random() - 0.5) * 15,
            vy: (Math.random() - 1) * 10,
            color: colors[Math.floor(Math.random() * colors.length)],
            size: Math.random() * 8 + 4,
            rotation: Math.random() * Math.PI * 2,
            rotSpeed: (Math.random() - 0.5) * 0.3,
            life: 1.0
        });
    }
}

function updateConfetti() {
    for (let i = confetti.length - 1; i >= 0; i--) {
        const p = confetti[i];
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.5; // Gravity
        p.rotation += p.rotSpeed;
        p.life -= 0.015;
        if (p.life <= 0 || p.y > SCREEN_HEIGHT) {
            confetti.splice(i, 1);
        }
    }
}

function renderConfetti() {
    confetti.forEach(p => {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rotation);
        ctx.globalAlpha = p.life;
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
        ctx.restore();
    });
    ctx.globalAlpha = 1;
}

// Left Joystick state (movement)
let joystick = {
    active: false,
    startX: 0,
    startY: 0,
    currentX: 0,
    currentY: 0,
    maxDistance: 50
};

// Turn input state (for turn zones)
let turnInput = {
    left: false,
    right: false
};

// Check if a tile position is reachable from the player (flood fill)
function isReachableFromPlayer(tileX, tileY) {
    const playerTileX = Math.floor(player.x / TILE_SIZE);
    const playerTileY = Math.floor(player.y / TILE_SIZE);

    // BFS to check if we can reach the target from player
    const visited = new Set();
    const queue = [{ x: playerTileX, y: playerTileY }];
    visited.add(`${playerTileX},${playerTileY}`);

    while (queue.length > 0) {
        const current = queue.shift();

        if (current.x === tileX && current.y === tileY) {
            return true;
        }

        // Check all 4 neighbors
        const neighbors = [
            { x: current.x + 1, y: current.y },
            { x: current.x - 1, y: current.y },
            { x: current.x, y: current.y + 1 },
            { x: current.x, y: current.y - 1 }
        ];

        for (const n of neighbors) {
            const key = `${n.x},${n.y}`;
            if (visited.has(key)) continue;
            if (n.x < 0 || n.x >= MAP_SIZE || n.y < 0 || n.y >= MAP_SIZE) continue;

            const tile = map[n.y][n.x];
            // Can pass through empty (0), spawn points (2), and unlocked doors (4)
            if (tile === 0 || tile === 2 || tile === 4) {
                visited.add(key);
                queue.push(n);
            }
        }
    }

    return false;
}

// Initialize enemies
function initEnemies() {
    enemies = [];

    // Every 5 waves, enemies take 1 more hit (+15 health per 5 waves)
    let extraHealth = Math.floor(gameState.level / 5) * 15;
    // Zombies get stronger each wave (speed and damage scaling)
    let zombieSpeedBonus = Math.min(gameState.level * 0.05, 1.0); // Max +1.0 speed
    const zombieDamageBonus = Math.floor(gameState.level / 3) * 2; // +2 damage every 3 waves

    // Apply wave modifier effects to enemies
    let healthMultiplier = 1.0;
    let speedMultiplier = 1.0;
    if (gameState.waveModifier) {
        if (gameState.waveModifier.id === 'tough_crowd') {
            healthMultiplier = 1.25; // +25% health
        }
        if (gameState.waveModifier.id === 'speed_demons') {
            speedMultiplier = 1.2; // +20% speed
        }
    }

    // Boss wave every 10 waves - spawn single big enemy
    const isBossWave = gameState.level % 10 === 0 && gameState.level > 0;

    // Wave type: zombies on odd waves, floating beings on even waves (like Black Ops dogs/zombies)
    const isZombieWave = gameState.level % 2 === 1;
    // Every 5th wave (except boss) is a mixed wave
    const isMixedWave = gameState.level % 5 === 0 && !isBossWave;

    if (isBossWave) {
        // Find a valid spawn point for boss far from player BUT reachable
        let bossX = 0, bossY = 0;
        let bestDist = 0;

        // Try 50 random spots and pick the farthest REACHABLE from player
        for (let attempt = 0; attempt < 50; attempt++) {
            const x = Math.floor(Math.random() * (MAP_SIZE - 2)) + 1;
            const y = Math.floor(Math.random() * (MAP_SIZE - 2)) + 1;

            if ((map[y][x] === 0 || map[y][x] === 2) && isReachableFromPlayer(x, y)) {
                const px = x * TILE_SIZE + TILE_SIZE / 2;
                const py = y * TILE_SIZE + TILE_SIZE / 2;
                const dist = Math.sqrt((px - player.x) ** 2 + (py - player.y) ** 2);

                if (dist > bestDist) {
                    bestDist = dist;
                    bossX = px;
                    bossY = py;
                }
            }
        }

        // Spawn boss - red with yellow streaks, 75 health (5 shots) + scaling
        const bossHealth = Math.floor((75 + extraHealth) * healthMultiplier);
        enemies.push({
            x: bossX,
            y: bossY,
            health: bossHealth,
            maxHealth: bossHealth,
            speed: 1.2 * speedMultiplier,
            damage: 20,
            lastAttack: 0,
            type: 'boss',
            size: 1.2,
            animTime: Math.random() * Math.PI * 2 // Random start phase for animation
        });
    } else {
        // Normal wave - spawn 4 regular enemies at random REACHABLE locations away from player
        const numEnemies = 4;
        const minDistFromPlayer = TILE_SIZE * 3; // Minimum distance from player

        for (let i = 0; i < numEnemies; i++) {
            // Find a random spot far from player that is REACHABLE
            let spawnX = 0, spawnY = 0;
            let attempts = 0;

            while (attempts < 100) {
                const x = Math.floor(Math.random() * (MAP_SIZE - 2)) + 1;
                const y = Math.floor(Math.random() * (MAP_SIZE - 2)) + 1;

                if ((map[y][x] === 0 || map[y][x] === 2) && isReachableFromPlayer(x, y)) {
                    const px = x * TILE_SIZE + TILE_SIZE / 2;
                    const py = y * TILE_SIZE + TILE_SIZE / 2;
                    const dist = Math.sqrt((px - player.x) ** 2 + (py - player.y) ** 2);

                    if (dist >= minDistFromPlayer) {
                        spawnX = px;
                        spawnY = py;
                        break;
                    }
                }
                attempts++;
            }

            // If no good spot found, pick any REACHABLE valid spot
            if (spawnX === 0 && spawnY === 0) {
                for (let y = 1; y < MAP_SIZE - 1; y++) {
                    for (let x = 1; x < MAP_SIZE - 1; x++) {
                        if ((map[y][x] === 0 || map[y][x] === 2) && isReachableFromPlayer(x, y)) {
                            spawnX = x * TILE_SIZE + TILE_SIZE / 2;
                            spawnY = y * TILE_SIZE + TILE_SIZE / 2;
                            break;
                        }
                    }
                    if (spawnX !== 0) break;
                }
            }

            let type, speed, health, size, isZombie;

            // Determine if this enemy is a zombie based on wave type
            if (isMixedWave) {
                // Mixed wave - 50/50 split
                isZombie = i < numEnemies / 2;
            } else {
                isZombie = isZombieWave;
            }

            if (isZombie) {
                // Zombie enemies - ground-based walking enemies
                const zombieRoll = Math.random();
                if (zombieRoll < 0.05) {
                    // Fire zombie - spawns 3 more on death
                    type = 'zombie_fire';
                    speed = 1.0 + zombieSpeedBonus;
                    health = 25;
                    size = 1.0;
                } else if (zombieRoll < 0.25) {
                    // Fast zombie - crawler type
                    type = 'zombie_crawler';
                    speed = 1.8 + zombieSpeedBonus;
                    health = 20;
                    size = 0.6;
                } else if (zombieRoll < 0.45) {
                    // Tank zombie - slow but tough
                    type = 'zombie_tank';
                    speed = 0.7 + zombieSpeedBonus * 0.5;
                    health = 50;
                    size = 1.3;
                } else {
                    // Regular zombie
                    type = 'zombie';
                    speed = 1.0 + zombieSpeedBonus;
                    health = 30;
                    size = 1.0;
                }
            } else {
                // Floating beings - original enemy types
                const roll = Math.random();
                if (roll < 0.05) {
                    // Fire enemy - looks like fire emoji, spawns 3 enemies on death
                    type = 'fire';
                    speed = 1.3;
                    health = 25;
                    size = 1.0;
                } else if (roll < 0.20) {
                    // White enemy - more health (ghost-like)
                    type = 'white';
                    speed = 1;
                    health = 31;
                    size = 1.0;
                } else if (roll < 0.45) {
                    // Black enemy - faster (shadow)
                    type = 'black';
                    speed = 1.5;
                    health = 30;
                    size = 1.0;
                } else if (roll < 0.60) {
                    // Small enemy - 50% size, very fast (imp)
                    type = 'small';
                    speed = 2.2;
                    health = 15;
                    size = 0.5;
                } else {
                    // Blue enemy - standard (specter)
                    type = 'blue';
                    speed = 1;
                    health = 30;
                    size = 1.0;
                }
            }

            const totalHealth = Math.floor((health + extraHealth) * healthMultiplier);
            const baseDamage = type === 'small' || type === 'zombie_crawler' ? 5 : 10;
            enemies.push({
                x: spawnX,
                y: spawnY,
                health: totalHealth,
                maxHealth: totalHealth,
                speed: speed * speedMultiplier,
                damage: baseDamage + (isZombie ? zombieDamageBonus : 0),
                lastAttack: 0,
                type: type,
                size: size,
                animTime: Math.random() * Math.PI * 2, // Random start phase for animation
                hitboxRadius: size * 15 // Hitbox radius based on size
            });
        }
    }
}

// Spawn enemies far from player (for fire enemy death)
function spawnEnemiesFarFromPlayer(count) {
    const extraHealth = Math.floor(gameState.level / 5) * 15;
    const zombieSpeedBonus = Math.min(gameState.level * 0.05, 1.0);
    const zombieDamageBonus = Math.floor(gameState.level / 3) * 2;

    // Apply wave modifier effects
    let healthMultiplier = 1.0;
    let speedMultiplier = 1.0;
    if (gameState.waveModifier) {
        if (gameState.waveModifier.id === 'tough_crowd') healthMultiplier = 1.25;
        if (gameState.waveModifier.id === 'speed_demons') speedMultiplier = 1.2;
    }

    // Match current wave type (odd = zombie, even = floating)
    const isZombieWave = gameState.level % 2 === 1;
    const floatingTypes = ['blue', 'black', 'white', 'small'];
    const zombieTypes = ['zombie', 'zombie_crawler', 'zombie_tank'];

    for (let i = 0; i < count; i++) {
        let bestX = 0, bestY = 0, bestDist = 0;

        // Try 20 random spots and pick the farthest REACHABLE spot from player
        for (let attempt = 0; attempt < 20; attempt++) {
            const x = Math.floor(Math.random() * (MAP_SIZE - 2)) + 1;
            const y = Math.floor(Math.random() * (MAP_SIZE - 2)) + 1;

            // Only spawn in reachable areas (not behind locked doors)
            if ((map[y][x] === 0 || map[y][x] === 2) && isReachableFromPlayer(x, y)) {
                const px = x * TILE_SIZE + TILE_SIZE / 2;
                const py = y * TILE_SIZE + TILE_SIZE / 2;
                const dist = Math.sqrt((px - player.x) ** 2 + (py - player.y) ** 2);

                if (dist > bestDist) {
                    bestDist = dist;
                    bestX = px;
                    bestY = py;
                }
            }
        }

        if (bestDist > 0) {
            let type, health, speed, size, damage;

            if (isZombieWave) {
                type = zombieTypes[Math.floor(Math.random() * zombieTypes.length)];
                if (type === 'zombie_crawler') {
                    health = 20;
                    speed = 1.8 + zombieSpeedBonus;
                    size = 0.6;
                    damage = 5 + zombieDamageBonus;
                } else if (type === 'zombie_tank') {
                    health = 50;
                    speed = 0.7 + zombieSpeedBonus * 0.5;
                    size = 1.3;
                    damage = 10 + zombieDamageBonus;
                } else {
                    health = 30;
                    speed = 1.0 + zombieSpeedBonus;
                    size = 1.0;
                    damage = 10 + zombieDamageBonus;
                }
            } else {
                type = floatingTypes[Math.floor(Math.random() * floatingTypes.length)];
                health = type === 'white' ? 31 : (type === 'small' ? 15 : 30);
                speed = type === 'black' ? 1.5 : (type === 'small' ? 2.2 : 1);
                size = type === 'small' ? 0.5 : 1.0;
                damage = type === 'small' ? 5 : 10;
            }

            const totalHealth = Math.floor((health + extraHealth) * healthMultiplier);
            enemies.push({
                x: bestX,
                y: bestY,
                health: totalHealth,
                maxHealth: totalHealth,
                speed: speed * speedMultiplier,
                damage: damage,
                lastAttack: 0,
                type: type,
                size: size,
                animTime: Math.random() * Math.PI * 2,
                hitboxRadius: size * 15
            });
        }
    }
}

// Check if position is valid (no wall collision)
// Tile types: 0=empty, 1=wall, 2=spawn, 3=locked door, 4=unlocked door
function isValidPosition(x, y, radius = 10) {
    // Check multiple points around the entity for collision
    const points = [
        { x: x, y: y },
        { x: x - radius, y: y },
        { x: x + radius, y: y },
        { x: x, y: y - radius },
        { x: x, y: y + radius }
    ];

    for (const p of points) {
        const mapX = Math.floor(p.x / TILE_SIZE);
        const mapY = Math.floor(p.y / TILE_SIZE);
        if (mapX < 0 || mapX >= MAP_SIZE || mapY < 0 || mapY >= MAP_SIZE) return false;
        const tile = map[mapY][mapX];
        // Block on walls (1) and locked doors (3)
        if (tile === 1 || tile === 3) return false;
    }
    return true;
}

// Check if a tile is reachable from the player's current position (BFS flood-fill)
// This ensures enemies only spawn in areas the player can actually reach
function isReachableFromPlayer(tileX, tileY) {
    const playerTileX = Math.floor(player.x / TILE_SIZE);
    const playerTileY = Math.floor(player.y / TILE_SIZE);

    // If it's the same tile, it's reachable
    if (playerTileX === tileX && playerTileY === tileY) return true;

    const visited = new Set();
    const queue = [{ x: playerTileX, y: playerTileY }];
    visited.add(`${playerTileX},${playerTileY}`);

    while (queue.length > 0) {
        const current = queue.shift();

        // Found the target tile
        if (current.x === tileX && current.y === tileY) return true;

        // Check all 4 neighbors
        const neighbors = [
            { x: current.x + 1, y: current.y },
            { x: current.x - 1, y: current.y },
            { x: current.x, y: current.y + 1 },
            { x: current.x, y: current.y - 1 }
        ];

        for (const n of neighbors) {
            const key = `${n.x},${n.y}`;
            if (visited.has(key)) continue;
            if (n.x < 0 || n.x >= MAP_SIZE || n.y < 0 || n.y >= MAP_SIZE) continue;

            const tile = map[n.y][n.x];
            // Can walk through empty (0), spawn points (2), and unlocked doors (4)
            // Cannot walk through walls (1) or locked doors (3)
            if (tile === 0 || tile === 2 || tile === 4) {
                visited.add(key);
                queue.push(n);
            }
        }
    }

    return false;
}

// Cast a single ray
function castRay(angle) {
    const sin = Math.sin(angle);
    const cos = Math.cos(angle);

    for (let depth = 0; depth < MAX_DEPTH; depth++) {
        const targetX = player.x + cos * depth;
        const targetY = player.y + sin * depth;

        const mapX = Math.floor(targetX / TILE_SIZE);
        const mapY = Math.floor(targetY / TILE_SIZE);

        if (mapX >= 0 && mapX < MAP_SIZE && mapY >= 0 && mapY < MAP_SIZE) {
            const tile = map[mapY][mapX];
            // Hit a wall
            if (tile === 1) {
                return {
                    depth: depth,
                    texture: (targetX % TILE_SIZE) / TILE_SIZE,
                    vertical: Math.abs(cos) > Math.abs(sin),
                    tileType: 1
                };
            }
            // Hit a locked door (blocks like wall but renders differently)
            if (tile === 3) {
                return {
                    depth: depth,
                    texture: (targetX % TILE_SIZE) / TILE_SIZE,
                    vertical: Math.abs(cos) > Math.abs(sin),
                    tileType: 3
                };
            }
            // Unlocked doors (4) are passable - ray continues through
        }
    }
    return { depth: MAX_DEPTH, texture: 0, vertical: false, tileType: 0 };
}

// Static floor texture (16-bit style) - pre-rendered for performance
let floorCanvas = null;
let floorCtx = null;

function generateStaticFloor() {
    floorCanvas = document.createElement('canvas');
    floorCanvas.width = SCREEN_WIDTH;
    floorCanvas.height = Math.ceil(SCREEN_HEIGHT / 2);
    floorCtx = floorCanvas.getContext('2d');

    // Stone colors (16-bit palette)
    const stoneColors = ['#3a3a3a', '#424242', '#4a4a4a', '#383838', '#454545'];
    const groutColor = '#252525';

    const pixelSize = 8; // Large pixels for retro look and performance

    // Draw static floor with perspective shading
    for (let y = 0; y < floorCanvas.height; y += pixelSize) {
        // Calculate shade based on distance (top = far = dark, bottom = near = light)
        const shade = 0.3 + (y / floorCanvas.height) * 0.5;

        for (let x = 0; x < floorCanvas.width; x += pixelSize) {
            // Create tile pattern
            const tileX = Math.floor(x / 48);
            const tileY = Math.floor((y + x * 0.3) / 48); // Slight perspective skew
            const isGrout = (x % 48 < 4) || ((y + Math.floor(x * 0.1)) % 48 < 4);

            let baseColor;
            if (isGrout) {
                baseColor = groutColor;
            } else {
                // Use consistent color per tile
                const colorIndex = (tileX + tileY) % stoneColors.length;
                baseColor = stoneColors[colorIndex];
            }

            // Parse color and apply shade
            const r = parseInt(baseColor.slice(1, 3), 16);
            const g = parseInt(baseColor.slice(3, 5), 16);
            const b = parseInt(baseColor.slice(5, 7), 16);

            floorCtx.fillStyle = `rgb(${Math.floor(r * shade)},${Math.floor(g * shade)},${Math.floor(b * shade)})`;
            floorCtx.fillRect(x, y, pixelSize, pixelSize);
        }
    }
}

// Render 3D view
function render3D() {
    const NUM_RAYS = Math.min(SCREEN_WIDTH, 800); // Limit rays on mobile for performance
    const SCALE = SCREEN_WIDTH / NUM_RAYS;

    // Sky gradient
    const skyGradient = ctx.createLinearGradient(0, 0, 0, SCREEN_HEIGHT / 2);
    skyGradient.addColorStop(0, '#1a0000');
    skyGradient.addColorStop(1, '#4a0000');
    ctx.fillStyle = skyGradient;
    ctx.fillRect(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT / 2);

    // Render static floor with scroll effect
    if (!floorCanvas || floorCanvas.width !== SCREEN_WIDTH) {
        generateStaticFloor();
    }
    // Scroll based on direction (switches each round)
    const scrollX = (-(Date.now() / 10) * gameState.floorScrollDir) % SCREEN_WIDTH;
    const wiggleY = (Math.random() - 0.5) * 3;
    // Draw twice to create seamless loop
    ctx.drawImage(floorCanvas, scrollX, Math.floor(SCREEN_HEIGHT / 2) + wiggleY);
    ctx.drawImage(floorCanvas, scrollX + SCREEN_WIDTH * gameState.floorScrollDir, Math.floor(SCREEN_HEIGHT / 2) + wiggleY);

    // Cast rays and draw walls
    for (let ray = 0; ray < NUM_RAYS; ray++) {
        const rayAngle = player.angle - HALF_FOV + (ray / NUM_RAYS) * FOV;
        const hit = castRay(rayAngle);

        // Fix fisheye
        const correctedDepth = hit.depth * Math.cos(rayAngle - player.angle);

        // Wall height
        const wallHeight = (TILE_SIZE * SCREEN_HEIGHT) / correctedDepth;
        const wallTop = (SCREEN_HEIGHT - wallHeight) / 2;

        const intensity = Math.max(0.3, 1 - correctedDepth / MAX_DEPTH);

        // Check if this is a door (tileType 3)
        if (hit.tileType === 3) {
            // Bronze/brown door with pulsing glow effect
            const pulse = Math.sin(Date.now() / 200) * 0.15 + 0.85;
            const baseR = Math.floor(180 * intensity * pulse);
            const baseG = Math.floor(100 * intensity * pulse);
            const baseB = Math.floor(40 * intensity * pulse);
            ctx.fillStyle = `rgb(${baseR}, ${baseG}, ${baseB})`;
            ctx.fillRect(ray * SCALE, wallTop, SCALE + 1, wallHeight);

            // Door frame detail (darker edges)
            if (hit.texture < 0.1 || hit.texture > 0.9) {
                ctx.fillStyle = `rgb(${Math.floor(60 * intensity)}, ${Math.floor(30 * intensity)}, ${Math.floor(10 * intensity)})`;
                ctx.fillRect(ray * SCALE, wallTop, SCALE + 1, wallHeight);
            }
        } else {
            // Rainbow wall colors based on ray position
            const hue = (ray / NUM_RAYS) * 360 + (Date.now() / 20) % 360; // Animated rainbow
            const saturation = hit.vertical ? 100 : 70;
            const lightness = Math.floor(50 * intensity);

            ctx.fillStyle = `hsl(${hue}, ${saturation}%, ${lightness}%)`;
            ctx.fillRect(ray * SCALE, wallTop, SCALE + 1, wallHeight);
        }
    }
}

// Render enemies
function renderEnemies() {
    enemies.forEach(enemy => {
        // Update animation time for this enemy
        enemy.animTime = (enemy.animTime || 0) + 0.15;

        // Calculate distance and angle to enemy
        const dx = enemy.x - player.x;
        const dy = enemy.y - player.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        let angle = Math.atan2(dy, dx) - player.angle;

        // Normalize angle
        while (angle < -Math.PI) angle += 2 * Math.PI;
        while (angle > Math.PI) angle -= 2 * Math.PI;

        // Check if enemy is in view
        if (Math.abs(angle) < HALF_FOV + 0.1) {
            // Calculate screen position
            const screenX = (0.5 + angle / FOV) * SCREEN_WIDTH;
            const enemyScale = enemy.size || 1.0; // Use enemy size property
            const size = (TILE_SIZE * SCREEN_HEIGHT) / dist * 0.7 * enemyScale;

            // Only render if not behind a wall
            const rayHit = castRay(player.angle + angle);
            if (dist < rayHit.depth) {
                const intensity = Math.max(0.3, 1 - dist / (MAX_DEPTH / 2));

                // Animation values for zombies (bobbing and arm swing)
                const bobOffset = Math.sin(enemy.animTime * 2) * size * 0.05;
                const armSwing = Math.sin(enemy.animTime * 3) * 0.4;

                // Check if this is a zombie type
                const isZombieType = enemy.type.startsWith('zombie');

                // Draw enemy body based on type
                if (isZombieType) {
                    // ZOMBIE RENDERING WITH ANIMATION
                    const bodyY = SCREEN_HEIGHT / 2 - size / 2 + bobOffset;

                    // Determine zombie colors based on subtype
                    let skinColor, shirtColor, pantsColor;
                    if (enemy.type === 'zombie_fire') {
                        skinColor = { r: 200, g: 100, b: 50 }; // Orange-ish burning
                        shirtColor = { r: 255, g: 100, b: 0 }; // Fire orange
                        pantsColor = { r: 80, g: 40, b: 20 };
                    } else if (enemy.type === 'zombie_crawler') {
                        skinColor = { r: 100, g: 120, b: 100 }; // Sickly green
                        shirtColor = { r: 60, g: 80, b: 60 };
                        pantsColor = { r: 40, g: 50, b: 40 };
                    } else if (enemy.type === 'zombie_tank') {
                        skinColor = { r: 80, g: 80, b: 100 }; // Bluish grey
                        shirtColor = { r: 50, g: 50, b: 70 };
                        pantsColor = { r: 30, g: 30, b: 40 };
                    } else {
                        // Regular zombie - grey/green rotting flesh
                        skinColor = { r: 120, g: 140, b: 110 };
                        shirtColor = { r: 80, g: 60, b: 50 }; // Torn brown shirt
                        pantsColor = { r: 50, g: 50, b: 60 }; // Dark pants
                    }

                    // Draw legs (behind body)
                    const legSwing = Math.sin(enemy.animTime * 3) * size * 0.15;
                    ctx.fillStyle = `rgb(${Math.floor(pantsColor.r * intensity)}, ${Math.floor(pantsColor.g * intensity)}, ${Math.floor(pantsColor.b * intensity)})`;
                    // Left leg
                    ctx.fillRect(screenX - size * 0.25, bodyY + size * 0.6 + legSwing, size * 0.2, size * 0.4);
                    // Right leg
                    ctx.fillRect(screenX + size * 0.05, bodyY + size * 0.6 - legSwing, size * 0.2, size * 0.4);

                    // Draw torso/body
                    ctx.fillStyle = `rgb(${Math.floor(shirtColor.r * intensity)}, ${Math.floor(shirtColor.g * intensity)}, ${Math.floor(shirtColor.b * intensity)})`;
                    ctx.fillRect(screenX - size * 0.3, bodyY + size * 0.3, size * 0.6, size * 0.4);

                    // Torn shirt detail
                    ctx.fillStyle = `rgb(${Math.floor(skinColor.r * intensity)}, ${Math.floor(skinColor.g * intensity)}, ${Math.floor(skinColor.b * intensity)})`;
                    ctx.fillRect(screenX - size * 0.1, bodyY + size * 0.35, size * 0.15, size * 0.2);

                    // Draw head
                    ctx.fillStyle = `rgb(${Math.floor(skinColor.r * intensity)}, ${Math.floor(skinColor.g * intensity)}, ${Math.floor(skinColor.b * intensity)})`;
                    ctx.fillRect(screenX - size * 0.25, bodyY, size * 0.5, size * 0.35);

                    // Draw zombie arms (animated swing)
                    const armLength = size * 0.4;
                    const armWidth = size * 0.12;

                    // Left arm - swinging forward
                    ctx.save();
                    ctx.translate(screenX - size * 0.35, bodyY + size * 0.35);
                    ctx.rotate(-0.5 + armSwing); // Arms reaching forward
                    ctx.fillStyle = `rgb(${Math.floor(skinColor.r * intensity)}, ${Math.floor(skinColor.g * intensity)}, ${Math.floor(skinColor.b * intensity)})`;
                    ctx.fillRect(-armWidth / 2, 0, armWidth, armLength);
                    // Zombie hand/claw
                    ctx.fillStyle = `rgb(${Math.floor(skinColor.r * 0.7 * intensity)}, ${Math.floor(skinColor.g * 0.7 * intensity)}, ${Math.floor(skinColor.b * 0.7 * intensity)})`;
                    ctx.fillRect(-armWidth / 2 - 2, armLength - 5, armWidth + 4, size * 0.1);
                    ctx.restore();

                    // Right arm - swinging backward (opposite)
                    ctx.save();
                    ctx.translate(screenX + size * 0.35, bodyY + size * 0.35);
                    ctx.rotate(-0.5 - armSwing); // Opposite swing
                    ctx.fillStyle = `rgb(${Math.floor(skinColor.r * intensity)}, ${Math.floor(skinColor.g * intensity)}, ${Math.floor(skinColor.b * intensity)})`;
                    ctx.fillRect(-armWidth / 2, 0, armWidth, armLength);
                    // Zombie hand/claw
                    ctx.fillStyle = `rgb(${Math.floor(skinColor.r * 0.7 * intensity)}, ${Math.floor(skinColor.g * 0.7 * intensity)}, ${Math.floor(skinColor.b * 0.7 * intensity)})`;
                    ctx.fillRect(-armWidth / 2 - 2, armLength - 5, armWidth + 4, size * 0.1);
                    ctx.restore();

                    // Zombie eyes (glowing)
                    const eyeGlow = enemy.type === 'zombie_fire' ? { r: 255, g: 150, b: 0 } : { r: 255, g: 50, b: 50 };
                    ctx.fillStyle = `rgb(${Math.floor(eyeGlow.r * intensity)}, ${Math.floor(eyeGlow.g * intensity)}, ${Math.floor(eyeGlow.b * intensity)})`;
                    const eyeSize = size / 10;
                    const eyeY = bodyY + size * 0.1;
                    ctx.fillRect(screenX - size * 0.15, eyeY, eyeSize, eyeSize);
                    ctx.fillRect(screenX + size * 0.05, eyeY, eyeSize, eyeSize);

                    // Zombie mouth (open, scary)
                    ctx.fillStyle = `rgb(${Math.floor(40 * intensity)}, ${Math.floor(20 * intensity)}, ${Math.floor(20 * intensity)})`;
                    ctx.fillRect(screenX - size * 0.1, bodyY + size * 0.22, size * 0.2, size * 0.08);

                    // Blood/gore details
                    ctx.fillStyle = `rgb(${Math.floor(150 * intensity)}, ${Math.floor(20 * intensity)}, ${Math.floor(20 * intensity)})`;
                    ctx.fillRect(screenX - size * 0.2, bodyY + size * 0.15, size * 0.05, size * 0.1);
                    ctx.fillRect(screenX + size * 0.15, bodyY + size * 0.45, size * 0.08, size * 0.15);

                    // Fire effect for fire zombie
                    if (enemy.type === 'zombie_fire') {
                        ctx.font = `${size * 0.4}px Arial`;
                        ctx.textAlign = 'center';
                        ctx.textBaseline = 'middle';
                        ctx.fillText('🔥', screenX, bodyY - size * 0.1);
                    }
                } else if (enemy.type === 'boss') {
                    // Boss - pure red with yellow streaks
                    ctx.fillStyle = `rgb(${Math.floor(220 * intensity)}, ${Math.floor(20 * intensity)}, ${Math.floor(20 * intensity)})`;
                    ctx.fillRect(screenX - size / 2, SCREEN_HEIGHT / 2 - size / 2, size, size);
                    // Yellow streaks
                    ctx.fillStyle = `rgb(${Math.floor(255 * intensity)}, ${Math.floor(220 * intensity)}, 0)`;
                    for (let i = 0; i < 4; i++) {
                        const streakY = SCREEN_HEIGHT / 2 - size / 2 + size * (0.2 + i * 0.2);
                        ctx.fillRect(screenX - size / 2, streakY, size, size / 12);
                    }
                } else if (enemy.type === 'black') {
                    // Black enemy - floating shadow with ghostly effect
                    const floatOffset = Math.sin(enemy.animTime) * size * 0.05;
                    ctx.fillStyle = `rgb(${Math.floor(20 * intensity)}, ${Math.floor(20 * intensity)}, ${Math.floor(20 * intensity)})`;
                    ctx.fillRect(screenX - size / 2, SCREEN_HEIGHT / 2 - size / 2 + floatOffset, size, size);
                } else if (enemy.type === 'white') {
                    // White enemy - ghost with float
                    const floatOffset = Math.sin(enemy.animTime) * size * 0.08;
                    ctx.fillStyle = `rgb(${Math.floor(240 * intensity)}, ${Math.floor(240 * intensity)}, ${Math.floor(240 * intensity)})`;
                    ctx.fillRect(screenX - size / 2, SCREEN_HEIGHT / 2 - size / 2 + floatOffset, size, size);
                } else if (enemy.type === 'small') {
                    // Small fast enemy - green/lime color with quick bob
                    const quickBob = Math.sin(enemy.animTime * 4) * size * 0.1;
                    ctx.fillStyle = `rgb(${Math.floor(50 * intensity)}, ${Math.floor(220 * intensity)}, ${Math.floor(50 * intensity)})`;
                    ctx.fillRect(screenX - size / 2, SCREEN_HEIGHT / 2 - size / 2 + quickBob, size, size);
                } else if (enemy.type === 'fire') {
                    // Fire enemy - render as fire emoji
                    ctx.font = `${size}px Arial`;
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.fillText('🔥', screenX, SCREEN_HEIGHT / 2);
                } else {
                    // Blue enemy - floating specter
                    const floatOffset = Math.sin(enemy.animTime * 1.5) * size * 0.06;
                    ctx.fillStyle = `rgb(${Math.floor(30 * intensity)}, ${Math.floor(100 * intensity)}, ${Math.floor(255 * intensity)})`;
                    ctx.fillRect(screenX - size / 2, SCREEN_HEIGHT / 2 - size / 2 + floatOffset, size, size);
                }

                // Eyes for non-zombie types
                if (!isZombieType && enemy.type !== 'fire') {
                    if (enemy.type === 'boss') {
                        // Orange/yellow eyes for boss
                        ctx.fillStyle = `rgb(${Math.floor(255 * intensity)}, ${Math.floor(150 * intensity)}, 0)`;
                    } else if (enemy.type === 'black') {
                        // White eyes for black enemies
                        ctx.fillStyle = `rgb(${Math.floor(255 * intensity)}, ${Math.floor(255 * intensity)}, ${Math.floor(255 * intensity)})`;
                    } else if (enemy.type === 'white') {
                        // Red eyes for white enemies
                        ctx.fillStyle = `rgb(${Math.floor(255 * intensity)}, 0, 0)`;
                    } else if (enemy.type === 'small') {
                        // Red eyes for small fast enemies
                        ctx.fillStyle = `rgb(${Math.floor(255 * intensity)}, ${Math.floor(50 * intensity)}, ${Math.floor(50 * intensity)})`;
                    } else {
                        // Yellow eyes for blue enemies
                        ctx.fillStyle = `rgb(${Math.floor(255 * intensity)}, ${Math.floor(255 * intensity)}, 0)`;
                    }
                    const eyeSize = size / 8;
                    const floatOffset = Math.sin(enemy.animTime * (enemy.type === 'small' ? 4 : 1.5)) * size * 0.06;
                    const eyeY = SCREEN_HEIGHT / 2 - size / 4 + floatOffset;
                    const leftEyeX = screenX - size / 4;
                    const rightEyeX = screenX + size / 8;
                    ctx.fillRect(leftEyeX, eyeY, eyeSize, eyeSize);
                    ctx.fillRect(rightEyeX, eyeY, eyeSize, eyeSize);

                    // Angry eyebrows - only show for 0.5 sec after being hit
                    const wasRecentlyHit = enemy.lastHit && (Date.now() - enemy.lastHit < 500);
                    if (wasRecentlyHit) {
                        // Red eyebrows for black enemies, dark brown for others
                        if (enemy.type === 'black') {
                            ctx.fillStyle = `rgb(${Math.floor(200 * intensity)}, ${Math.floor(30 * intensity)}, ${Math.floor(30 * intensity)})`;
                        } else {
                            ctx.fillStyle = `rgb(${Math.floor(40 * intensity)}, ${Math.floor(20 * intensity)}, ${Math.floor(20 * intensity)})`;
                        }
                        const browHeight = size / 16;
                        const browWidth = eyeSize * 1.5;
                        // Left eyebrow - angled down toward center
                        ctx.save();
                        ctx.translate(leftEyeX + eyeSize / 2, eyeY - browHeight);
                        ctx.rotate(0.3); // Tilt inward
                        ctx.fillRect(-browWidth / 2, -browHeight / 2, browWidth, browHeight);
                        ctx.restore();
                        // Right eyebrow - angled down toward center
                        ctx.save();
                        ctx.translate(rightEyeX + eyeSize / 2, eyeY - browHeight);
                        ctx.rotate(-0.3); // Tilt inward
                        ctx.fillRect(-browWidth / 2, -browHeight / 2, browWidth, browHeight);
                        ctx.restore();
                    }
                }

                // Health bar above enemy
                const healthBarWidth = size * 0.8;
                const healthBarHeight = size / 10;
                const healthBarX = screenX - healthBarWidth / 2;
                const healthBarY = SCREEN_HEIGHT / 2 - size / 2 - healthBarHeight - 5 + (isZombieType ? bobOffset : 0);
                const healthPercent = enemy.health / (enemy.maxHealth || 30);

                // Background (dark)
                ctx.fillStyle = '#333';
                ctx.fillRect(healthBarX, healthBarY, healthBarWidth, healthBarHeight);

                // Health (red for floating, green for zombies)
                ctx.fillStyle = isZombieType ? '#00aa00' : '#ff0000';
                ctx.fillRect(healthBarX, healthBarY, healthBarWidth * healthPercent, healthBarHeight);

                // Border
                ctx.strokeStyle = '#fff';
                ctx.lineWidth = 1;
                ctx.strokeRect(healthBarX, healthBarY, healthBarWidth, healthBarHeight);
            }
        }
    });
}

// Render minimap
function renderMinimap() {
    const scale = minimapCanvas.width / MAP_SIZE;

    minimapCtx.fillStyle = '#000';
    minimapCtx.fillRect(0, 0, minimapCanvas.width, minimapCanvas.height);

    // Draw map
    for (let y = 0; y < MAP_SIZE; y++) {
        for (let x = 0; x < MAP_SIZE; x++) {
            const tile = map[y][x];
            if (tile === 1) {
                // Walls
                minimapCtx.fillStyle = '#8B0000';
                minimapCtx.fillRect(x * scale, y * scale, scale, scale);
            } else if (tile === 3) {
                // Locked doors (bronze/gold)
                minimapCtx.fillStyle = '#b4783c';
                minimapCtx.fillRect(x * scale, y * scale, scale, scale);
            } else if (tile === 4) {
                // Unlocked doors (green)
                minimapCtx.fillStyle = '#00aa00';
                minimapCtx.fillRect(x * scale, y * scale, scale, scale);
            }
        }
    }

    // Draw enemies
    minimapCtx.fillStyle = '#ff0';
    enemies.forEach(enemy => {
        const ex = (enemy.x / TILE_SIZE) * scale;
        const ey = (enemy.y / TILE_SIZE) * scale;
        minimapCtx.beginPath();
        minimapCtx.arc(ex, ey, 2, 0, Math.PI * 2);
        minimapCtx.fill();
    });

    // Draw player
    const px = (player.x / TILE_SIZE) * scale;
    const py = (player.y / TILE_SIZE) * scale;

    minimapCtx.fillStyle = '#0f0';
    minimapCtx.beginPath();
    minimapCtx.arc(px, py, 3, 0, Math.PI * 2);
    minimapCtx.fill();

    // Draw direction
    minimapCtx.strokeStyle = '#0f0';
    minimapCtx.beginPath();
    minimapCtx.moveTo(px, py);
    minimapCtx.lineTo(px + Math.cos(player.angle) * 10, py + Math.sin(player.angle) * 10);
    minimapCtx.stroke();
}

// Render crosshair
function renderCrosshair() {
    const cx = SCREEN_WIDTH / 2;
    const cy = SCREEN_HEIGHT / 2;

    // Check if hit marker is active (100ms duration)
    const showHitMarker = hitMarker.active && (Date.now() - hitMarker.time < 100);

    // Draw crosshair - red if hit marker active, yellow otherwise
    ctx.strokeStyle = showHitMarker ? '#ff0000' : '#ff0';
    ctx.lineWidth = showHitMarker ? 3 : 2;
    ctx.beginPath();
    ctx.moveTo(cx - 15, cy);
    ctx.lineTo(cx - 5, cy);
    ctx.moveTo(cx + 5, cy);
    ctx.lineTo(cx + 15, cy);
    ctx.moveTo(cx, cy - 15);
    ctx.lineTo(cx, cy - 5);
    ctx.moveTo(cx, cy + 5);
    ctx.lineTo(cx, cy + 15);
    ctx.stroke();

    // Draw hit marker X when active
    if (showHitMarker) {
        ctx.strokeStyle = '#ff0000';
        ctx.lineWidth = 2;
        ctx.beginPath();
        // Draw X shape
        ctx.moveTo(cx - 12, cy - 12);
        ctx.lineTo(cx - 6, cy - 6);
        ctx.moveTo(cx + 12, cy - 12);
        ctx.lineTo(cx + 6, cy - 6);
        ctx.moveTo(cx - 12, cy + 12);
        ctx.lineTo(cx - 6, cy + 6);
        ctx.moveTo(cx + 12, cy + 12);
        ctx.lineTo(cx + 6, cy + 6);
        ctx.stroke();
    }

    // Reset hit marker after duration
    if (hitMarker.active && Date.now() - hitMarker.time >= 100) {
        hitMarker.active = false;
    }
}

// Render floating damage numbers
function renderDamageNumbers() {
    const now = Date.now();

    damageNumbers = damageNumbers.filter(dn => {
        const age = now - dn.time;
        if (age > 1000) return false; // Remove after 1 second

        // Calculate fade and float
        const alpha = 1 - (age / 1000);
        const floatY = age * 0.05; // Float upward

        // Draw damage number
        ctx.save();
        ctx.font = 'bold 24px "Courier New", monospace';
        ctx.textAlign = 'center';

        // Outline for visibility
        ctx.strokeStyle = `rgba(0, 0, 0, ${alpha})`;
        ctx.lineWidth = 3;
        ctx.strokeText(dn.damage, dn.screenX, dn.screenY - floatY);

        // Fill with white/yellow based on damage
        const color = dn.damage >= 30 ? '255, 255, 0' : '255, 255, 255'; // Yellow for high damage
        ctx.fillStyle = `rgba(${color}, ${alpha})`;
        ctx.fillText(dn.damage, dn.screenX, dn.screenY - floatY);

        ctx.restore();
        return true;
    });
}

// Render gun
function renderGun() {
    if (isFlipping) return; // Don't show gun while flipping off

    const scale = Math.min(SCREEN_WIDTH, SCREEN_HEIGHT) / 500;
    const gunX = SCREEN_WIDTH / 2;
    const gunY = SCREEN_HEIGHT - 20 + gunState.recoil;

    // Animate recoil recovery
    if (gunState.recoil < 0) {
        gunState.recoil += 3;
        if (gunState.recoil > 0) gunState.recoil = 0;
    }

    // Hand/Arm
    ctx.fillStyle = '#e0a87a';
    ctx.beginPath();
    ctx.ellipse(gunX + 60 * scale, gunY + 40 * scale, 35 * scale, 45 * scale, -0.3, 0, Math.PI * 2);
    ctx.fill();

    // Gun body (main)
    ctx.fillStyle = '#2a2a2a';
    ctx.fillRect(gunX - 20 * scale, gunY - 80 * scale, 40 * scale, 100 * scale);

    // Gun barrel
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(gunX - 8 * scale, gunY - 160 * scale, 16 * scale, 90 * scale);

    // Barrel hole
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.ellipse(gunX, gunY - 160 * scale, 6 * scale, 4 * scale, 0, 0, Math.PI * 2);
    ctx.fill();

    // Gun slide
    ctx.fillStyle = '#3a3a3a';
    ctx.fillRect(gunX - 15 * scale, gunY - 140 * scale, 30 * scale, 60 * scale);

    // Gun grip
    ctx.fillStyle = '#4a3a2a';
    ctx.fillRect(gunX - 15 * scale, gunY - 10 * scale, 30 * scale, 50 * scale);

    // Grip texture lines
    ctx.strokeStyle = '#3a2a1a';
    ctx.lineWidth = 2;
    for (let i = 0; i < 5; i++) {
        ctx.beginPath();
        ctx.moveTo(gunX - 12 * scale, gunY + (i * 8) * scale);
        ctx.lineTo(gunX + 12 * scale, gunY + (i * 8) * scale);
        ctx.stroke();
    }

    // Trigger guard
    ctx.strokeStyle = '#2a2a2a';
    ctx.lineWidth = 4 * scale;
    ctx.beginPath();
    ctx.arc(gunX, gunY - 30 * scale, 15 * scale, 0.2, Math.PI - 0.2);
    ctx.stroke();

    // Trigger
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(gunX - 3 * scale, gunY - 40 * scale, 6 * scale, 20 * scale);

    // Muzzle flash when shooting
    if (gunState.shooting) {
        // Flash
        ctx.fillStyle = 'rgba(255, 200, 50, 0.9)';
        ctx.beginPath();
        ctx.moveTo(gunX, gunY - 170 * scale);
        ctx.lineTo(gunX - 30 * scale, gunY - 200 * scale);
        ctx.lineTo(gunX - 10 * scale, gunY - 180 * scale);
        ctx.lineTo(gunX, gunY - 230 * scale);
        ctx.lineTo(gunX + 10 * scale, gunY - 180 * scale);
        ctx.lineTo(gunX + 30 * scale, gunY - 200 * scale);
        ctx.closePath();
        ctx.fill();

        // Inner flash
        ctx.fillStyle = 'rgba(255, 255, 200, 0.95)';
        ctx.beginPath();
        ctx.moveTo(gunX, gunY - 165 * scale);
        ctx.lineTo(gunX - 15 * scale, gunY - 185 * scale);
        ctx.lineTo(gunX, gunY - 200 * scale);
        ctx.lineTo(gunX + 15 * scale, gunY - 185 * scale);
        ctx.closePath();
        ctx.fill();

        gunState.frame++;
        if (gunState.frame > 3) {
            gunState.shooting = false;
            gunState.frame = 0;
        }
    }

    // Sight
    ctx.fillStyle = '#ff0000';
    ctx.fillRect(gunX - 2 * scale, gunY - 145 * scale, 4 * scale, 4 * scale);
}

// Trigger gun shooting animation
function triggerGunAnimation() {
    gunState.shooting = true;
    gunState.frame = 0;
    gunState.recoil = -25;
}

// Render middle finger (16-bit style)
function renderMiddleFinger() {
    if (!isFlipping) return;

    const handX = SCREEN_WIDTH / 2;
    const handY = SCREEN_HEIGHT - 50;
    const px = Math.max(4, Math.floor(Math.min(SCREEN_WIDTH, SCREEN_HEIGHT) / 80)); // Pixel size

    // 16-bit color palette
    const skinLight = '#f4c898';
    const skinMid = '#e8a870';
    const skinDark = '#c47848';
    const skinShadow = '#a05830';
    const nail = '#ffd8c8';

    // Helper to draw pixelated rectangles
    function drawPixel(x, y, color) {
        ctx.fillStyle = color;
        ctx.fillRect(handX + x * px, handY + y * px, px, px);
    }

    // Arm (coming from bottom)
    for (let y = 10; y < 25; y++) {
        for (let x = -3; x <= 3; x++) {
            drawPixel(x, y, x === -3 ? skinShadow : (x === 3 ? skinLight : skinMid));
        }
    }

    // Fist/Palm base
    for (let y = 4; y < 12; y++) {
        for (let x = -5; x <= 5; x++) {
            if (Math.abs(x) === 5 && (y < 5 || y > 10)) continue;
            drawPixel(x, y, x === -5 ? skinShadow : (x >= 4 ? skinLight : skinMid));
        }
    }

    // Curled fingers (left side)
    for (let y = 2; y < 6; y++) {
        for (let x = -5; x <= -3; x++) {
            drawPixel(x, y, x === -5 ? skinShadow : skinMid);
        }
    }

    // Curled fingers (right side)
    for (let y = 2; y < 6; y++) {
        for (let x = 3; x <= 5; x++) {
            drawPixel(x, y, x === 5 ? skinLight : skinMid);
        }
    }

    // Thumb (left side, curled)
    for (let y = 6; y < 10; y++) {
        drawPixel(-6, y, skinShadow);
        drawPixel(-7, y, skinDark);
    }

    // Middle finger (extended upward)
    for (let y = -12; y < 5; y++) {
        drawPixel(-1, y, skinShadow);
        drawPixel(0, y, skinMid);
        drawPixel(1, y, skinLight);
    }

    // Fingertip (rounded)
    drawPixel(-1, -13, skinMid);
    drawPixel(0, -13, skinMid);
    drawPixel(1, -13, skinMid);
    drawPixel(0, -14, skinMid);

    // Fingernail
    drawPixel(0, -13, nail);
    drawPixel(0, -12, nail);
    drawPixel(0, -11, nail);

    // Knuckle details
    drawPixel(-1, -4, skinDark);
    drawPixel(0, -4, skinShadow);
    drawPixel(1, -4, skinDark);
    drawPixel(-1, -8, skinDark);
    drawPixel(0, -8, skinShadow);
    drawPixel(1, -8, skinDark);

    // Ring finger (curled, closed fist)
    for (let y = 2; y < 6; y++) {
        drawPixel(3, y, skinMid);
        drawPixel(4, y, skinMid);
        drawPixel(5, y, skinLight);
    }
    // Ring finger knuckle bump
    drawPixel(3, 2, skinDark);
    drawPixel(4, 2, skinShadow);
    drawPixel(5, 2, skinMid);

    // Pinky finger (curled, closed fist)
    for (let y = 3; y < 7; y++) {
        drawPixel(6, y, skinMid);
        drawPixel(7, y, skinLight);
    }
    // Pinky knuckle bump
    drawPixel(6, 3, skinDark);
    drawPixel(7, 3, skinMid);

    // Extended palm to include pinky area
    for (let y = 6; y < 12; y++) {
        drawPixel(6, y, skinMid);
        drawPixel(7, y, skinLight);
    }

    // Wrist line
    for (let x = -3; x <= 7; x++) {
        drawPixel(x, 10, skinDark);
    }
}

// Nuke function (activated by middle finger)
function activateNuke(bypassCooldown = false) {
    if (gameState.gameOver) return;

    const now = Date.now();

    // Check cooldown unless bypassed by pickup
    if (!bypassCooldown && now < nukeCooldown) {
        return; // Still on cooldown
    }

    // Show the middle finger animation
    isFlipping = true;
    if (flipTimer) clearTimeout(flipTimer);
    flipTimer = setTimeout(() => {
        isFlipping = false;
    }, 1500);

    // Flash screen white
    setTimeout(() => {
        // Kill all enemies and award points + tokens
        let tokenReward = 0;
        enemies.forEach(enemy => {
            if (enemy.type.startsWith('zombie')) {
                tokenReward += 2;
            } else if (enemy.type === 'boss') {
                tokenReward += 3;
            } else {
                tokenReward += 1;
            }
        });
        const killCount = enemies.length;
        gameState.score += killCount * 150; // Bonus points for nuke kills
        gameState.kills += killCount;
        gameState.tokens += tokenReward;
        enemies = [];

        // Start next wave
        gameState.level++;
        gameState.score += 500;
        gameState.ammo = Math.min(100, gameState.ammo + 20);
        gameState.health = Math.min(100, gameState.health + 25);
        initEnemies();
        spawnNukePickup(); // Chance to spawn new pickup
        showWaveAnnouncement(gameState.level);
        startEmojiRain(); // Celebration emoji rain
        updateHUD();
    }, 500);

    // Set cooldown (only if not bypassed)
    if (!bypassCooldown) {
        nukeCooldown = now + NUKE_COOLDOWN_MS;
    }
}

// Spawn nuke pickup - only on every 10th wave
function spawnNukePickup() {
    // Only spawn on waves 10, 20, 30, etc.
    if (gameState.level % 10 !== 0) {
        nukePickup = null;
        return;
    }

    // Find a random empty spot
    let attempts = 0;
    while (attempts < 50) {
        const x = Math.floor(Math.random() * (MAP_SIZE - 2)) + 1;
        const y = Math.floor(Math.random() * (MAP_SIZE - 2)) + 1;
        if (map[y][x] === 0) {
            nukePickup = {
                x: x * TILE_SIZE + TILE_SIZE / 2,
                y: y * TILE_SIZE + TILE_SIZE / 2
            };
            break;
        }
        attempts++;
    }
}

// Check if player picks up nuke
function checkNukePickup() {
    if (!nukePickup) return;

    const dx = player.x - nukePickup.x;
    const dy = player.y - nukePickup.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist < TILE_SIZE * 0.7) {
        // Picked up! Activate nuke immediately
        nukePickup = null;
        activateNuke(true); // Bypass cooldown
    }
}

// Render nuke pickup
function renderNukePickup() {
    if (!nukePickup) return;

    // Calculate distance and angle to pickup
    const dx = nukePickup.x - player.x;
    const dy = nukePickup.y - player.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    let angle = Math.atan2(dy, dx) - player.angle;

    // Normalize angle
    while (angle < -Math.PI) angle += 2 * Math.PI;
    while (angle > Math.PI) angle -= 2 * Math.PI;

    // Check if pickup is in view
    if (Math.abs(angle) < HALF_FOV + 0.1) {
        const screenX = (0.5 + angle / FOV) * SCREEN_WIDTH;
        const size = (TILE_SIZE * SCREEN_HEIGHT) / dist * 0.4;

        // Only render if not behind a wall
        const rayHit = castRay(player.angle + angle);
        if (dist < rayHit.depth) {
            // Pulsing glow effect
            const pulse = Math.sin(Date.now() / 150) * 0.3 + 0.7;

            // Draw pickup (nuke symbol - radioactive style)
            ctx.fillStyle = `rgba(255, 255, 0, ${pulse})`;
            ctx.beginPath();
            ctx.arc(screenX, SCREEN_HEIGHT / 2, size / 2, 0, Math.PI * 2);
            ctx.fill();

            // Inner circle
            ctx.fillStyle = `rgba(255, 100, 0, ${pulse})`;
            ctx.beginPath();
            ctx.arc(screenX, SCREEN_HEIGHT / 2, size / 3, 0, Math.PI * 2);
            ctx.fill();

            // Nuke symbol (simple)
            ctx.fillStyle = '#000';
            ctx.font = `${size / 2}px Arial`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('☢', screenX, SCREEN_HEIGHT / 2);
        }
    }
}

// Spawn ammo pickup randomly on the map
function spawnAmmoPickup() {
    // 40% chance to spawn ammo each wave
    if (Math.random() > 0.4) {
        ammoPickup = null;
        return;
    }

    // Find a random empty spot
    let attempts = 0;
    while (attempts < 50) {
        const x = Math.floor(Math.random() * (MAP_SIZE - 2)) + 1;
        const y = Math.floor(Math.random() * (MAP_SIZE - 2)) + 1;
        if (map[y][x] === 0) {
            ammoPickup = {
                x: x * TILE_SIZE + TILE_SIZE / 2,
                y: y * TILE_SIZE + TILE_SIZE / 2
            };
            break;
        }
        attempts++;
    }
}

// Check if player picks up ammo
function checkAmmoPickup() {
    if (!ammoPickup) return;

    const dx = player.x - ammoPickup.x;
    const dy = player.y - ammoPickup.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist < TILE_SIZE * 0.7) {
        // Picked up! Add 50 ammo (max 100)
        ammoPickup = null;
        gameState.ammo = Math.min(100, gameState.ammo + 50);
        updateHUD();
    }
}

// Render ammo pickup
function renderAmmoPickup() {
    if (!ammoPickup) return;

    // Calculate distance and angle to pickup
    const dx = ammoPickup.x - player.x;
    const dy = ammoPickup.y - player.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    let angle = Math.atan2(dy, dx) - player.angle;

    // Normalize angle
    while (angle < -Math.PI) angle += 2 * Math.PI;
    while (angle > Math.PI) angle -= 2 * Math.PI;

    // Check if pickup is in view
    if (Math.abs(angle) < HALF_FOV + 0.1) {
        const screenX = (0.5 + angle / FOV) * SCREEN_WIDTH;
        const size = (TILE_SIZE * SCREEN_HEIGHT) / dist * 0.35;

        // Only render if not behind a wall
        const rayHit = castRay(player.angle + angle);
        if (dist < rayHit.depth) {
            // Pulsing glow effect
            const pulse = Math.sin(Date.now() / 150) * 0.3 + 0.7;

            // Draw ammo box (green)
            ctx.fillStyle = `rgba(0, 200, 0, ${pulse})`;
            ctx.fillRect(screenX - size / 2, SCREEN_HEIGHT / 2 - size / 3, size, size * 0.6);

            // Box highlight
            ctx.fillStyle = `rgba(100, 255, 100, ${pulse})`;
            ctx.fillRect(screenX - size / 2, SCREEN_HEIGHT / 2 - size / 3, size, size * 0.15);

            // Ammo text
            ctx.fillStyle = '#fff';
            ctx.font = `bold ${size / 3}px Arial`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('AMMO', screenX, SCREEN_HEIGHT / 2);
        }
    }
}

// Render weapon pickups
function renderWeaponPickups() {
    weaponPickups.forEach(pickup => {
        const dx = pickup.x - player.x;
        const dy = pickup.y - player.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        let angle = Math.atan2(dy, dx) - player.angle;

        while (angle < -Math.PI) angle += 2 * Math.PI;
        while (angle > Math.PI) angle -= 2 * Math.PI;

        if (Math.abs(angle) < HALF_FOV + 0.1) {
            const screenX = (0.5 + angle / FOV) * SCREEN_WIDTH;
            const size = (TILE_SIZE * SCREEN_HEIGHT) / dist * 0.4;

            const rayHit = castRay(player.angle + angle);
            if (dist < rayHit.depth) {
                const pulse = Math.sin(Date.now() / 150) * 0.3 + 0.7;
                const weapon = WEAPONS[pickup.type];

                // Draw weapon pickup box
                ctx.fillStyle = weapon.color;
                ctx.globalAlpha = pulse;
                ctx.fillRect(screenX - size / 2, SCREEN_HEIGHT / 2 - size / 3, size, size * 0.6);

                // Glow effect
                ctx.shadowColor = weapon.color;
                ctx.shadowBlur = 20;
                ctx.fillRect(screenX - size / 2, SCREEN_HEIGHT / 2 - size / 3, size, size * 0.6);
                ctx.shadowBlur = 0;

                // Weapon name
                ctx.globalAlpha = 1;
                ctx.fillStyle = '#fff';
                ctx.font = `bold ${Math.max(10, size / 4)}px Arial`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(weapon.name, screenX, SCREEN_HEIGHT / 2);
            }
        }
    });
    ctx.globalAlpha = 1;
}

// Render weapon announcement
function renderWeaponAnnouncement() {
    if (!weaponAnnouncement.showing) return;

    const cx = SCREEN_WIDTH / 2;
    const cy = SCREEN_HEIGHT / 4;

    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // Glow effect
    ctx.shadowColor = '#00ff00';
    ctx.shadowBlur = 20;
    ctx.fillStyle = '#00ff00';
    ctx.font = 'bold 28px "Courier New", monospace';
    ctx.fillText(weaponAnnouncement.text, cx, cy);

    ctx.restore();
}

// Render mystery boxes
function renderMysteryBoxes() {
    mysteryBoxes.forEach(box => {
        const dx = box.x - player.x;
        const dy = box.y - player.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        let angle = Math.atan2(dy, dx) - player.angle;

        while (angle < -Math.PI) angle += 2 * Math.PI;
        while (angle > Math.PI) angle -= 2 * Math.PI;

        if (Math.abs(angle) < HALF_FOV + 0.1) {
            const screenX = (0.5 + angle / FOV) * SCREEN_WIDTH;
            const size = (TILE_SIZE * SCREEN_HEIGHT) / dist * 0.5;

            const rayHit = castRay(player.angle + angle);
            if (dist < rayHit.depth) {
                const pulse = Math.sin(Date.now() / 100) * 0.3 + 0.7;

                // Mystery box glow
                ctx.shadowColor = '#ff00ff';
                ctx.shadowBlur = 30 * pulse;

                // Box
                ctx.fillStyle = `rgba(100, 0, 100, ${pulse})`;
                ctx.fillRect(screenX - size / 2, SCREEN_HEIGHT / 2 - size / 3, size, size * 0.7);

                // Question mark
                ctx.shadowBlur = 0;
                ctx.fillStyle = '#ff00ff';
                ctx.font = `bold ${size / 2}px Arial`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText('?', screenX, SCREEN_HEIGHT / 2);
            }
        }
    });
    ctx.shadowBlur = 0;
}

// Render mystery box popup
function renderMysteryBoxPopup() {
    if (!nearbyMysteryBox) return;

    const cx = SCREEN_WIDTH / 2;
    const cy = SCREEN_HEIGHT - 150;

    ctx.save();

    // Popup background
    ctx.fillStyle = 'rgba(50, 0, 50, 0.9)';
    ctx.fillRect(cx - 120, cy - 50, 240, 100);

    // Purple border
    ctx.strokeStyle = '#ff00ff';
    ctx.lineWidth = 3;
    ctx.strokeRect(cx - 120, cy - 50, 240, 100);

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // Title
    ctx.fillStyle = '#ff00ff';
    ctx.font = 'bold 18px "Courier New", monospace';
    ctx.fillText('MYSTERY BOX', cx, cy - 30);

    // Cost
    const canAfford = gameState.tokens >= nearbyMysteryBox.box.price;
    ctx.fillStyle = canAfford ? '#ffcc00' : '#ff4444';
    ctx.font = '16px "Courier New", monospace';
    ctx.fillText(`Cost: ${nearbyMysteryBox.box.price} Tokens`, cx, cy - 5);

    // Your tokens
    ctx.fillStyle = '#888';
    ctx.font = '14px "Courier New", monospace';
    ctx.fillText(`You have: ${gameState.tokens}`, cx, cy + 15);

    // Instruction
    if (canAfford) {
        ctx.fillStyle = '#00ff00';
        const instruction = isMobileDevice ? 'Tap here to open' : 'Press E to open';
        ctx.fillText(instruction, cx, cy + 38);
    } else {
        ctx.fillStyle = '#ff4444';
        ctx.fillText('Not enough tokens!', cx, cy + 38);
    }

    ctx.restore();
}

// Render mystery box announcement
function renderMysteryBoxAnnouncement() {
    if (!mysteryBoxAnnouncement.showing) return;

    const cx = SCREEN_WIDTH / 2;
    const cy = SCREEN_HEIGHT / 4;

    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // Glow effect
    ctx.shadowColor = mysteryBoxAnnouncement.color;
    ctx.shadowBlur = 25;
    ctx.fillStyle = mysteryBoxAnnouncement.color;
    ctx.font = 'bold 32px "Courier New", monospace';
    ctx.fillText(mysteryBoxAnnouncement.text, cx, cy);

    ctx.restore();
}

// Check if player is near a locked door
function checkDoorProximity() {
    nearbyDoor = null;
    const playerTileX = Math.floor(player.x / TILE_SIZE);
    const playerTileY = Math.floor(player.y / TILE_SIZE);

    for (const door of doors) {
        if (door.unlocked) continue;

        // Check distance to door (within 1.5 tiles)
        const dx = (door.x + 0.5) * TILE_SIZE - player.x;
        const dy = (door.y + 0.5) * TILE_SIZE - player.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < TILE_SIZE * 1.5) {
            nearbyDoor = door;
            break;
        }
    }
}

// Unlock a door
function unlockDoor(door) {
    if (!door || door.unlocked) return false;
    if (gameState.tokens < door.price) return false;

    // Deduct tokens
    gameState.tokens -= door.price;

    // Unlock the door
    door.unlocked = true;
    map[door.y][door.x] = 4; // Change to unlocked door tile

    // Track doors opened
    gameState.doorsOpened++;

    // Show warning after first door
    if (!gameState.firstDoorWarningShown) {
        gameState.firstDoorWarningShown = true;
        showDoorWarning();
    }

    // Spawn weapon pickup near the door
    spawnWeaponPickup(door.x, door.y);

    // Chance to spawn mystery box when door opens
    spawnMysteryBox();

    // Spawn additional enemies (world expansion = more enemies)
    // More doors opened = more enemies spawned
    const baseEnemies = 2 + gameState.doorsOpened;
    const extraEnemies = baseEnemies + Math.floor(Math.random() * 3); // 2-4+ enemies
    setTimeout(() => {
        spawnEnemiesFarFromPlayer(extraEnemies);
    }, 1000); // Delay spawn by 1 second

    // Spawn new doors for endless mode (every other door opened)
    if (gameState.doorsOpened % 2 === 0) {
        spawnNewDoor();
    }

    updateHUD();
    nearbyDoor = null;
    return true;
}

// Spawn a new door procedurally for endless mode
function spawnNewDoor() {
    // Find a valid spot for a new door
    const attempts = 50;
    for (let i = 0; i < attempts; i++) {
        const x = Math.floor(Math.random() * (MAP_SIZE - 2)) + 1;
        const y = Math.floor(Math.random() * (MAP_SIZE - 2)) + 1;

        // Check if spot is empty and adjacent to a wall
        if (map[y][x] === 0) {
            // Check for adjacent wall
            const hasAdjacentWall =
                (y > 0 && map[y-1][x] === 1) ||
                (y < MAP_SIZE-1 && map[y+1][x] === 1) ||
                (x > 0 && map[y][x-1] === 1) ||
                (x < MAP_SIZE-1 && map[y][x+1] === 1);

            if (hasAdjacentWall) {
                // Price scales with doors opened (gets more expensive)
                const basePrice = 40 + (gameState.doorsOpened * 15);
                const price = basePrice + Math.floor(Math.random() * 30);

                doors.push({ x: x, y: y, price: price, unlocked: false });
                map[y][x] = 3; // Locked door
                return;
            }
        }
    }
}

// Door warning state
let doorWarning = {
    showing: false,
    timer: null
};

// Show door warning message
function showDoorWarning() {
    doorWarning.showing = true;
    if (doorWarning.timer) clearTimeout(doorWarning.timer);
    doorWarning.timer = setTimeout(() => {
        doorWarning.showing = false;
    }, 3000);
}

// Render door warning
function renderDoorWarning() {
    if (!doorWarning.showing) return;

    const cx = SCREEN_WIDTH / 2;
    const cy = SCREEN_HEIGHT / 3;

    ctx.save();

    // Dark overlay
    ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
    ctx.fillRect(cx - 200, cy - 40, 400, 80);

    // Red border
    ctx.strokeStyle = '#ff0000';
    ctx.lineWidth = 3;
    ctx.strokeRect(cx - 200, cy - 40, 400, 80);

    // Warning text
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ff4444';
    ctx.font = 'bold 18px "Courier New", monospace';
    ctx.fillText('WARNING!', cx, cy - 15);
    ctx.fillStyle = '#ff8888';
    ctx.font = '14px "Courier New", monospace';
    ctx.fillText('Opening doors attracts more demons!', cx, cy + 15);

    ctx.restore();
}

// Render door unlock popup
function renderDoorPopup() {
    if (!nearbyDoor) return;

    const cx = SCREEN_WIDTH / 2;
    const cy = SCREEN_HEIGHT - 150;

    ctx.save();

    // Popup background
    ctx.fillStyle = 'rgba(0, 0, 0, 0.9)';
    ctx.fillRect(cx - 120, cy - 50, 240, 100);

    // Bronze border (matching door color)
    ctx.strokeStyle = '#b4783c';
    ctx.lineWidth = 3;
    ctx.strokeRect(cx - 120, cy - 50, 240, 100);

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // Title
    ctx.fillStyle = '#b4783c';
    ctx.font = 'bold 18px "Courier New", monospace';
    ctx.fillText('UNLOCK DOOR', cx, cy - 30);

    // Cost
    const canAfford = gameState.tokens >= nearbyDoor.price;
    ctx.fillStyle = canAfford ? '#ffcc00' : '#ff4444';
    ctx.font = '16px "Courier New", monospace';
    ctx.fillText(`Cost: ${nearbyDoor.price} Tokens`, cx, cy - 5);

    // Your tokens
    ctx.fillStyle = '#888';
    ctx.font = '14px "Courier New", monospace';
    ctx.fillText(`You have: ${gameState.tokens}`, cx, cy + 15);

    // Instruction
    if (canAfford) {
        ctx.fillStyle = '#00ff00';
        const instruction = isMobileDevice ? 'Tap here to unlock' : 'Press E to unlock';
        ctx.fillText(instruction, cx, cy + 38);
    } else {
        ctx.fillStyle = '#ff4444';
        ctx.fillText('Not enough tokens!', cx, cy + 38);
    }

    ctx.restore();
}

// Update HUD
function updateHUD() {
    document.getElementById('healthValue').textContent = gameState.health;
    document.getElementById('ammoValue').textContent = gameState.ammo;
    document.getElementById('scoreValue').textContent = gameState.score;
    document.getElementById('killsValue').textContent = gameState.kills;
    const tokensEl = document.getElementById('tokensValue');
    if (tokensEl) tokensEl.textContent = gameState.tokens;
    const weaponEl = document.getElementById('weaponValue');
    if (weaponEl) weaponEl.textContent = WEAPONS[currentWeapon].name;
}

// Show wave announcement
function showWaveAnnouncement(waveNum) {
    waveAnnouncement.showing = true;
    waveAnnouncement.wave = waveNum;
    // 5% chance for each special message
    const roll = Math.random();
    if (roll < 0.05) {
        waveAnnouncement.specialType = 'drugs';
    } else if (roll < 0.10) {
        waveAnnouncement.specialType = 'fuck';
    } else {
        waveAnnouncement.specialType = null;
    }

    // Show longer if there's a wave modifier
    const duration = gameState.waveModifier ? 2500 : 1500;

    if (waveAnnouncement.timer) clearTimeout(waveAnnouncement.timer);
    waveAnnouncement.timer = setTimeout(() => {
        waveAnnouncement.showing = false;
    }, duration);
}

// Render current wave modifier indicator (persistent during wave)
function renderWaveModifierIndicator() {
    if (!gameState.waveModifier) return;
    if (waveAnnouncement.showing) return; // Don't show during wave announcement

    const x = SCREEN_WIDTH - 15;
    const y = 70;

    ctx.save();
    ctx.textAlign = 'right';
    ctx.textBaseline = 'top';

    // Background
    ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
    ctx.fillRect(x - 130, y - 5, 140, 35);

    // Border
    ctx.strokeStyle = gameState.waveModifier.color;
    ctx.lineWidth = 2;
    ctx.strokeRect(x - 130, y - 5, 140, 35);

    // Modifier name
    ctx.fillStyle = gameState.waveModifier.color;
    ctx.font = 'bold 12px "Courier New", monospace';
    ctx.fillText(gameState.waveModifier.name, x - 5, y);

    // Token multiplier indicator if applicable
    if (gameState.tokenMultiplier > 1) {
        ctx.fillStyle = '#ffcc00';
        ctx.font = '10px "Courier New", monospace';
        ctx.fillText(gameState.tokenMultiplier + 'x TOKENS', x - 5, y + 18);
    }

    ctx.restore();
}

// Render wave announcement
function renderWaveAnnouncement() {
    if (!waveAnnouncement.showing) return;

    const cx = SCREEN_WIDTH / 2;
    const cy = SCREEN_HEIGHT / 2;

    // Dark overlay
    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
    ctx.fillRect(0, cy - 100, SCREEN_WIDTH, 200);

    // Determine text to display
    let displayText;
    if (waveAnnouncement.specialType === 'drugs') {
        displayText = "Drugs are bad mmkay";
    } else if (waveAnnouncement.specialType === 'fuck') {
        displayText = "FUCK";
    } else {
        displayText = 'WAVE ' + waveAnnouncement.wave;
    }

    // Wave text with glow effect
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // Glow
    ctx.shadowColor = '#ff0000';
    ctx.shadowBlur = 30;

    // Main text - smaller font for long special message
    const fontSize = waveAnnouncement.specialType === 'drugs' ?
        Math.min(40, SCREEN_WIDTH / 12) :
        Math.min(80, SCREEN_WIDTH / 8);
    ctx.fillStyle = '#8B0000';
    ctx.font = 'bold ' + fontSize + 'px "Courier New", monospace';
    ctx.fillText(displayText, cx, cy - 20);

    // Brighter overlay text
    ctx.shadowBlur = 15;
    ctx.fillStyle = '#ff4444';
    ctx.fillText(displayText, cx, cy - 20);

    // Show wave modifier if active
    if (gameState.waveModifier) {
        ctx.shadowColor = gameState.waveModifier.color;
        ctx.shadowBlur = 20;
        ctx.fillStyle = gameState.waveModifier.color;
        ctx.font = 'bold 24px "Courier New", monospace';
        ctx.fillText(gameState.waveModifier.name, cx, cy + 25);

        ctx.shadowBlur = 0;
        ctx.fillStyle = '#aaa';
        ctx.font = '16px "Courier New", monospace';
        ctx.fillText(gameState.waveModifier.description, cx, cy + 55);
    }

    ctx.restore();
}

// Handle shooting
// Find autoaim target within angle cone (Easy mode only)
function findAutoaimTarget(baseAngle, maxAngle = 0.1) {
    // Only apply autoaim in Easy mode
    if (gameMode !== 'easy') return null;

    let bestTarget = null;
    let bestAngleDiff = maxAngle;
    let bestDist = Infinity;

    for (const enemy of enemies) {
        const dx = enemy.x - player.x;
        const dy = enemy.y - player.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const angleToEnemy = Math.atan2(dy, dx);
        let angleDiff = angleToEnemy - baseAngle;

        // Normalize to [-PI, PI]
        while (angleDiff > Math.PI) angleDiff -= 2 * Math.PI;
        while (angleDiff < -Math.PI) angleDiff += 2 * Math.PI;

        if (Math.abs(angleDiff) < bestAngleDiff) {
            // Check line of sight
            const ray = castRay(angleToEnemy);
            if (dist < ray.depth) {
                bestTarget = enemy;
                bestAngleDiff = Math.abs(angleDiff);
                bestDist = dist;
            }
        }
    }
    return bestTarget;
}

// Check if a pellet hits an enemy at given angle
function checkPelletHit(pelletAngle) {
    let closestEnemy = null;
    let closestDist = Infinity;

    for (const enemy of enemies) {
        const dx = enemy.x - player.x;
        const dy = enemy.y - player.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const angleToEnemy = Math.atan2(dy, dx);
        let angleDiff = angleToEnemy - pelletAngle;

        // Normalize angle
        while (angleDiff > Math.PI) angleDiff -= 2 * Math.PI;
        while (angleDiff < -Math.PI) angleDiff += 2 * Math.PI;

        // Get enemy-specific hitbox from lookup table
        const hitboxData = ENEMY_HITBOXES[enemy.type] || { radius: 15 };
        const hitboxRadius = hitboxData.radius * (enemy.size || 1.0);

        // Calculate angular hitbox - with minimum so distant enemies aren't impossible
        const calculatedAngle = Math.atan2(hitboxRadius, dist);
        const minHitboxAngle = 0.03; // ~1.7° minimum for distant enemies
        const hitboxAngle = Math.max(calculatedAngle, minHitboxAngle);

        // Check if pellet is within hitbox angle
        if (Math.abs(angleDiff) < hitboxAngle) {
            // Check line of sight (no walls blocking)
            const ray = castRay(angleToEnemy);
            if (dist < ray.depth && dist < closestDist) {
                closestDist = dist;
                closestEnemy = enemy;
            }
        }
    }

    return closestEnemy;
}

function shoot() {
    if (gameState.ammo <= 0 || gameState.gameOver) return;

    gameState.ammo--;
    triggerGunAnimation();

    const weapon = WEAPONS[currentWeapon];
    const pelletCount = weapon.pellets || 1;
    const spreadAngle = weapon.spread || 0;

    // Track which enemies were hit and total damage
    const hitEnemies = new Map(); // enemy -> total damage

    // Fire each pellet
    for (let p = 0; p < pelletCount; p++) {
        // Calculate pellet angle with spread
        let pelletAngle = player.angle;
        if (spreadAngle > 0) {
            pelletAngle += (Math.random() - 0.5) * spreadAngle;
        }

        // Check for hit
        let hitEnemy = checkPelletHit(pelletAngle);

        // Easy mode autoaim: if no hit, try to find nearby target
        if (!hitEnemy && gameMode === 'easy') {
            const autoTarget = findAutoaimTarget(pelletAngle, 0.1);
            if (autoTarget) {
                hitEnemy = autoTarget;
            }
        }

        if (hitEnemy) {
            // Accumulate damage for this enemy
            let pelletDamage = weapon.damage;
            if (gameState.doubleDamage) {
                pelletDamage *= 2;
            }
            const currentDamage = hitEnemies.get(hitEnemy) || 0;
            hitEnemies.set(hitEnemy, currentDamage + pelletDamage);
        }
    }

    // Apply damage to all hit enemies
    let totalHits = 0;
    hitEnemies.forEach((totalDamage, enemy) => {
        enemy.health -= totalDamage;
        enemy.lastHit = Date.now();
        gameState.score += 10;
        totalHits++;

        // Calculate screen position for damage number
        const dx = enemy.x - player.x;
        const dy = enemy.y - player.y;
        let angle = Math.atan2(dy, dx) - player.angle;
        while (angle < -Math.PI) angle += 2 * Math.PI;
        while (angle > Math.PI) angle -= 2 * Math.PI;
        const screenX = (0.5 + angle / FOV) * SCREEN_WIDTH;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const screenY = SCREEN_HEIGHT / 2 - (50 / dist) * 100; // Rough height estimate

        // Add floating damage number
        damageNumbers.push({
            x: enemy.x,
            y: enemy.y,
            damage: totalDamage,
            time: Date.now(),
            screenX: screenX,
            screenY: Math.max(50, Math.min(SCREEN_HEIGHT - 100, screenY))
        });

        // Check for kill
        if (enemy.health <= 0) {
            const enemyIndex = enemies.indexOf(enemy);
            if (enemyIndex >= 0) {
                // Spawn confetti for boss kills
                if (enemy.size && enemy.size > 1.0) {
                    spawnConfetti(screenX, SCREEN_HEIGHT / 2);
                }
                // Fire enemy or zombie_fire spawns 3 more enemies far from player
                if (enemy.type === 'fire' || enemy.type === 'zombie_fire') {
                    spawnEnemiesFarFromPlayer(3);
                }
                enemies.splice(enemyIndex, 1);
                gameState.kills++;
                gameState.score += 100;

                // Award tokens based on enemy type
                let tokenReward = 1;
                if (enemy.type.startsWith('zombie')) {
                    tokenReward = 2;
                }
                if (enemy.type === 'zombie_tank' || enemy.type === 'boss') {
                    tokenReward = 3;
                }
                gameState.tokens += Math.floor(tokenReward * gameState.tokenMultiplier);
            }
        }
    });

    // Activate hit marker if we hit anything
    if (totalHits > 0) {
        hitMarker.active = true;
        hitMarker.time = Date.now();
    }

    updateHUD();
}

// A* Pathfinding
function findPath(startX, startY, endX, endY) {
    // Convert world coords to tile coords
    const startTileX = Math.floor(startX / TILE_SIZE);
    const startTileY = Math.floor(startY / TILE_SIZE);
    const endTileX = Math.floor(endX / TILE_SIZE);
    const endTileY = Math.floor(endY / TILE_SIZE);

    // If start and end are same tile, no path needed
    if (startTileX === endTileX && startTileY === endTileY) {
        return [{ x: endX, y: endY }];
    }

    // A* implementation
    const openSet = [];
    const closedSet = new Set();
    const cameFrom = new Map();
    const gScore = new Map();
    const fScore = new Map();

    const startKey = `${startTileX},${startTileY}`;
    const endKey = `${endTileX},${endTileY}`;

    openSet.push({ x: startTileX, y: startTileY });
    gScore.set(startKey, 0);
    fScore.set(startKey, heuristic(startTileX, startTileY, endTileX, endTileY));

    function heuristic(x1, y1, x2, y2) {
        return Math.abs(x1 - x2) + Math.abs(y1 - y2); // Manhattan distance
    }

    function getKey(x, y) {
        return `${x},${y}`;
    }

    // Neighbor directions (4-way movement)
    const neighbors = [
        { dx: 0, dy: -1 }, // up
        { dx: 0, dy: 1 },  // down
        { dx: -1, dy: 0 }, // left
        { dx: 1, dy: 0 }   // right
    ];

    let iterations = 0;
    const maxIterations = 500; // Prevent infinite loops

    while (openSet.length > 0 && iterations < maxIterations) {
        iterations++;

        // Find node with lowest fScore
        openSet.sort((a, b) => {
            const fA = fScore.get(getKey(a.x, a.y)) || Infinity;
            const fB = fScore.get(getKey(b.x, b.y)) || Infinity;
            return fA - fB;
        });

        const current = openSet.shift();
        const currentKey = getKey(current.x, current.y);

        // Reached the goal
        if (current.x === endTileX && current.y === endTileY) {
            // Reconstruct path
            const path = [];
            let curr = currentKey;
            while (cameFrom.has(curr)) {
                const [x, y] = curr.split(',').map(Number);
                // Convert back to world coordinates (center of tile)
                path.unshift({
                    x: x * TILE_SIZE + TILE_SIZE / 2,
                    y: y * TILE_SIZE + TILE_SIZE / 2
                });
                curr = cameFrom.get(curr);
            }
            // Add final destination (exact player position)
            path.push({ x: endX, y: endY });
            return path;
        }

        closedSet.add(currentKey);

        // Check neighbors
        for (const n of neighbors) {
            const nx = current.x + n.dx;
            const ny = current.y + n.dy;
            const neighborKey = getKey(nx, ny);

            // Skip if out of bounds or wall/locked door or already visited
            if (nx < 0 || nx >= MAP_SIZE || ny < 0 || ny >= MAP_SIZE) continue;
            const tile = map[ny][nx];
            if (tile === 1 || tile === 3) continue; // Block on walls and locked doors
            if (closedSet.has(neighborKey)) continue;

            const tentativeG = (gScore.get(currentKey) || 0) + 1;

            // Check if this is a better path
            const existingG = gScore.get(neighborKey);
            if (existingG === undefined || tentativeG < existingG) {
                cameFrom.set(neighborKey, currentKey);
                gScore.set(neighborKey, tentativeG);
                fScore.set(neighborKey, tentativeG + heuristic(nx, ny, endTileX, endTileY));

                // Add to open set if not already there
                if (!openSet.some(node => node.x === nx && node.y === ny)) {
                    openSet.push({ x: nx, y: ny });
                }
            }
        }
    }

    // No path found - return direct path as fallback
    return [{ x: endX, y: endY }];
}

// Update enemies
function updateEnemies() {
    const now = Date.now();
    const ENEMY_RADIUS = 20; // Collision radius for enemies
    const PATH_RECALC_INTERVAL = 500; // Recalculate path every 500ms

    enemies.forEach(enemy => {
        // Calculate distance to player
        const dx = player.x - enemy.x;
        const dy = player.y - enemy.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist > TILE_SIZE) {
            // Check if we need to recalculate path
            const needsNewPath = !enemy.path ||
                enemy.path.length === 0 ||
                !enemy.lastPathCalc ||
                (now - enemy.lastPathCalc > PATH_RECALC_INTERVAL);

            if (needsNewPath) {
                enemy.path = findPath(enemy.x, enemy.y, player.x, player.y);
                enemy.lastPathCalc = now;
                enemy.pathIndex = 0;
            }

            // Follow the path
            if (enemy.path && enemy.path.length > 0) {
                // Get current waypoint
                let waypoint = enemy.path[enemy.pathIndex || 0];

                // Check if we reached this waypoint
                const wpDx = waypoint.x - enemy.x;
                const wpDy = waypoint.y - enemy.y;
                const wpDist = Math.sqrt(wpDx * wpDx + wpDy * wpDy);

                if (wpDist < TILE_SIZE / 2) {
                    // Move to next waypoint
                    enemy.pathIndex = (enemy.pathIndex || 0) + 1;
                    if (enemy.pathIndex >= enemy.path.length) {
                        enemy.pathIndex = enemy.path.length - 1;
                    }
                    waypoint = enemy.path[enemy.pathIndex];
                }

                // Move toward waypoint
                const targetDx = waypoint.x - enemy.x;
                const targetDy = waypoint.y - enemy.y;
                const targetDist = Math.sqrt(targetDx * targetDx + targetDy * targetDy);

                if (targetDist > 0) {
                    const moveX = (targetDx / targetDist) * enemy.speed;
                    const moveY = (targetDy / targetDist) * enemy.speed;

                    // Try to move
                    if (isValidPosition(enemy.x + moveX, enemy.y, ENEMY_RADIUS)) {
                        enemy.x += moveX;
                    }
                    if (isValidPosition(enemy.x, enemy.y + moveY, ENEMY_RADIUS)) {
                        enemy.y += moveY;
                    }
                }
            }
        } else if (now - enemy.lastAttack > 1000) {
            // Attack player
            enemy.lastAttack = now;
            gameState.health -= enemy.damage;
            showDamageFlash();
            updateHUD();

            if (gameState.health <= 0) {
                endGame();
            }
        }
    });

    // Check for level completion
    if (enemies.length === 0) {
        gameState.level++;
        gameState.score += 500;
        gameState.ammo = Math.min(100, gameState.ammo + 20);
        gameState.health = Math.min(100, gameState.health + 25);
        gameState.floorScrollDir *= -1; // Flip floor scroll direction

        // Apply random wave modifier (30% chance after wave 3)
        applyWaveModifier();

        initEnemies();
        spawnNukePickup();
        spawnAmmoPickup();
        spawnMysteryBox(); // Random mystery box spawn
        showWaveAnnouncement(gameState.level);
        startEmojiRain(); // Celebration emoji rain
        updateHUD();
    }
}

// Apply random wave modifier
function applyWaveModifier() {
    // Reset token multiplier
    gameState.tokenMultiplier = 1.0;
    gameState.waveModifier = null;

    // Only apply modifiers after wave 3, 30% chance
    if (gameState.level < 3 || Math.random() > 0.3) {
        return;
    }

    // Select random modifier
    const modifier = WAVE_MODIFIERS[Math.floor(Math.random() * WAVE_MODIFIERS.length)];
    gameState.waveModifier = modifier;

    // Apply immediate effects
    switch (modifier.id) {
        case 'double_points':
            gameState.tokenMultiplier = 2.0;
            break;
        case 'jackpot':
            gameState.tokenMultiplier = 1.5;
            break;
        case 'armored':
            gameState.health = Math.min(150, gameState.health + 25);
            break;
        case 'ammo_drop':
            gameState.ammo = Math.min(150, gameState.ammo + 30);
            break;
        // tough_crowd and speed_demons are applied in initEnemies()
    }
}

// Check if position collides with any enemy
function collidesWithEnemy(x, y, playerRadius = 15) {
    for (const enemy of enemies) {
        const dx = x - enemy.x;
        const dy = y - enemy.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        // Use enemy's hitbox radius for collision
        const enemyRadius = (enemy.hitboxRadius || 15) * (enemy.size || 1.0);
        const minDist = playerRadius + enemyRadius;

        if (dist < minDist) {
            return true;
        }
    }
    return false;
}

// Handle player movement (keyboard + mobile)
function updatePlayer() {
    let newX = player.x;
    let newY = player.y;

    // Keyboard controls
    if (keys['KeyW'] || keys['ArrowUp']) {
        newX += Math.cos(player.angle) * player.speed;
        newY += Math.sin(player.angle) * player.speed;
    }
    if (keys['KeyS'] || keys['ArrowDown']) {
        newX -= Math.cos(player.angle) * player.speed;
        newY -= Math.sin(player.angle) * player.speed;
    }
    if (keys['KeyA']) {
        newX += Math.cos(player.angle - Math.PI / 2) * player.speed;
        newY += Math.sin(player.angle - Math.PI / 2) * player.speed;
    }
    if (keys['KeyD']) {
        newX -= Math.cos(player.angle - Math.PI / 2) * player.speed;
        newY -= Math.sin(player.angle - Math.PI / 2) * player.speed;
    }
    if (keys['ArrowLeft']) {
        player.angle -= player.rotSpeed;
    }
    if (keys['ArrowRight']) {
        player.angle += player.rotSpeed;
    }

    // Mobile joystick controls
    if (mobileInput.moveY < 0) { // Forward
        newX += Math.cos(player.angle) * player.speed * Math.abs(mobileInput.moveY);
        newY += Math.sin(player.angle) * player.speed * Math.abs(mobileInput.moveY);
    }
    if (mobileInput.moveY > 0) { // Backward
        newX -= Math.cos(player.angle) * player.speed * Math.abs(mobileInput.moveY);
        newY -= Math.sin(player.angle) * player.speed * Math.abs(mobileInput.moveY);
    }
    if (mobileInput.moveX < 0) { // Strafe left
        newX += Math.cos(player.angle - Math.PI / 2) * player.speed * Math.abs(mobileInput.moveX);
        newY += Math.sin(player.angle - Math.PI / 2) * player.speed * Math.abs(mobileInput.moveX);
    }
    if (mobileInput.moveX > 0) { // Strafe right
        newX -= Math.cos(player.angle - Math.PI / 2) * player.speed * Math.abs(mobileInput.moveX);
        newY -= Math.sin(player.angle - Math.PI / 2) * player.speed * Math.abs(mobileInput.moveX);
    }

    // Turn buttons now use setInterval to directly modify player.angle
    // (handled in touch event listeners)

    // Collision detection - check walls AND enemies
    if (isValidPosition(newX, player.y) && !collidesWithEnemy(newX, player.y)) {
        player.x = newX;
    }
    if (isValidPosition(player.x, newY) && !collidesWithEnemy(player.x, newY)) {
        player.y = newY;
    }
}

// End game
function endGame() {
    gameState.gameOver = true;
    document.getElementById('finalScore').textContent = gameState.score;
    document.getElementById('gameOver').style.display = 'block';
}

// Submit score
window.submitScore = function() {
    const playerName = document.getElementById('playerName').value || 'Anonymous';
    const timePlayed = Math.floor((Date.now() - gameState.startTime) / 1000);

    fetch('/api/scores', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            player_name: playerName,
            score: gameState.score,
            level: gameState.level,
            kills: gameState.kills,
            time_played: timePlayed,
            mode: gameState.mode
        })
    }).then(() => {
        window.location.href = '/leaderboard?mode=' + gameState.mode;
    });
};

// Easy Mode: Aim Assist - find closest enemy in view and return angle adjustment
function getAimAssist() {
    if (gameState.mode !== 'easy') return 0;

    let closestEnemy = null;
    let closestAngleDiff = Infinity;

    enemies.forEach(enemy => {
        const dx = enemy.x - player.x;
        const dy = enemy.y - player.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        // Only assist if enemy is within range (400 units) and in front
        if (dist > 400) return;

        const angleToEnemy = Math.atan2(dy, dx);
        let angleDiff = angleToEnemy - player.angle;

        // Normalize angle difference to -PI to PI
        while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
        while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;

        // Only assist if enemy is within ~45 degrees of crosshair
        if (Math.abs(angleDiff) < Math.PI / 4 && Math.abs(angleDiff) < closestAngleDiff) {
            closestAngleDiff = Math.abs(angleDiff);
            closestEnemy = { angleDiff, dist };
        }
    });

    if (closestEnemy) {
        // Subtle snap - stronger when closer to crosshair
        const snapStrength = 0.08 * (1 - closestAngleDiff / (Math.PI / 4));
        return closestEnemy.angleDiff * snapStrength;
    }

    return 0;
}

// Easy Mode: Check if enemy is in crosshair for auto-fire
function isEnemyInCrosshair() {
    if (gameState.mode !== 'easy') return false;

    for (const enemy of enemies) {
        const dx = enemy.x - player.x;
        const dy = enemy.y - player.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist > 500) continue; // Max auto-fire range

        let angle = Math.atan2(dy, dx) - player.angle;
        while (angle > Math.PI) angle -= Math.PI * 2;
        while (angle < -Math.PI) angle += Math.PI * 2;

        // Check if enemy is within crosshair cone (~15 degrees)
        // Scale angle tolerance with distance (larger hitbox at distance)
        const enemyRadius = (enemy.hitboxRadius || 15) * (enemy.size || 1.0);
        const angleThreshold = Math.atan2(enemyRadius * 2, dist) + 0.15;

        if (Math.abs(angle) < angleThreshold) {
            return true;
        }
    }
    return false;
}

// Auto-fire cooldown for easy mode
let lastAutoFireTime = 0;
const AUTO_FIRE_RATE = 250; // ms between auto shots

// Game loop
function gameLoop() {
    if (!gameState.gameOver) {
        // Check double damage buff expiry
        if (gameState.doubleDamage && Date.now() > gameState.doubleDamageEnd) {
            gameState.doubleDamage = false;
        }

        // Easy mode: Apply aim assist
        const aimAdjust = getAimAssist();
        if (aimAdjust !== 0) {
            player.angle += aimAdjust;
        }

        // Easy mode: Auto-fire when enemy in crosshair
        if (gameState.mode === 'easy' && isEnemyInCrosshair()) {
            const now = Date.now();
            if (now - lastAutoFireTime > AUTO_FIRE_RATE && gameState.ammo > 0) {
                shoot();
                lastAutoFireTime = now;
            }
        }

        updatePlayer();
        updateEnemies();
        updateConfetti();
        spawnEmojiRain();
        updateEmojiRain();
        checkNukePickup();
        checkAmmoPickup();
        checkWeaponPickup();
        checkDoorProximity();
        checkMysteryBoxProximity();
        render3D();
        renderEnemies();
        renderNukePickup();
        renderAmmoPickup();
        renderWeaponPickups();
        renderMysteryBoxes();
        renderConfetti();
        renderCrosshair();
        renderDamageNumbers();
        renderGun();
        renderMiddleFinger();
        renderWaveAnnouncement();
        renderWaveModifierIndicator();
        renderWeaponAnnouncement();
        renderMysteryBoxAnnouncement();
        renderDoorWarning();
        renderDoorPopup();
        renderMysteryBoxPopup();
        renderNukeButton();
        renderNukeCooldown();
        renderMinimap();
        renderEmojiRain(); // Render in front of everything
        requestAnimationFrame(gameLoop);
    }
}

// Check if device is mobile (has coarse pointer)
const isMobileDevice = window.matchMedia('(pointer: coarse)').matches;

// Update nuke button appearance based on cooldown (mobile only)
function renderNukeButton() {
    const flipBtn = document.getElementById('flipButton');
    if (!flipBtn) return;

    const now = Date.now();
    const remaining = nukeCooldown - now;

    if (remaining > 0) {
        // Cooldown active - show rising bar
        const progress = 1 - (remaining / NUKE_COOLDOWN_MS);
        const fillHeight = Math.floor(progress * 100);
        flipBtn.style.background = `linear-gradient(to top, rgba(139, 0, 0, 0.9) ${fillHeight}%, rgba(50, 50, 50, 0.9) ${fillHeight}%)`;
        flipBtn.style.borderColor = '#ff4444';
        flipBtn.style.color = '#ff4444';
    } else {
        // Ready - turn green
        flipBtn.style.background = 'rgba(0, 150, 0, 0.9)';
        flipBtn.style.borderColor = '#00ff00';
        flipBtn.style.color = '#00ff00';
    }
}

// Render nuke cooldown timer for web users (in corner of screen)
function renderNukeCooldown() {
    // Only show for non-mobile devices
    if (isMobileDevice) return;

    const now = Date.now();
    const remaining = nukeCooldown - now;

    // Position in upper left, below minimap area
    const x = 15;
    const y = 20;

    ctx.save();
    ctx.font = 'bold 16px "Courier New", monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';

    if (remaining > 0) {
        // Show countdown
        const seconds = Math.ceil(remaining / 1000);
        const minutes = Math.floor(seconds / 60);
        const secs = seconds % 60;
        const timeStr = `${minutes}:${secs.toString().padStart(2, '0')}`;

        // Background
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.fillRect(x - 5, y - 5, 100, 50);
        ctx.strokeStyle = '#8B0000';
        ctx.lineWidth = 2;
        ctx.strokeRect(x - 5, y - 5, 100, 50);

        // Label
        ctx.fillStyle = '#888';
        ctx.fillText('NUKE', x, y);

        // Timer
        ctx.fillStyle = '#ff4444';
        ctx.font = 'bold 20px "Courier New", monospace';
        ctx.fillText(timeStr, x, y + 20);
    } else {
        // Show ready
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.fillRect(x - 5, y - 5, 100, 50);
        ctx.strokeStyle = '#00ff00';
        ctx.lineWidth = 2;
        ctx.strokeRect(x - 5, y - 5, 100, 50);

        // Label
        ctx.fillStyle = '#888';
        ctx.fillText('NUKE', x, y);

        // Ready text
        ctx.fillStyle = '#00ff00';
        ctx.font = 'bold 20px "Courier New", monospace';
        ctx.fillText('READY', x, y + 20);
    }

    ctx.restore();
}

// Keyboard event listeners
document.addEventListener('keydown', (e) => {
    // Don't trigger game actions when typing in input fields
    if (document.activeElement.tagName === 'INPUT') {
        return;
    }

    keys[e.code] = true;
    if (e.code === 'Space') {
        e.preventDefault();
        shoot();
    }
    if (e.code === 'KeyF') {
        e.preventDefault();
        activateNuke();
    }
    if (e.code === 'KeyE') {
        e.preventDefault();
        if (nearbyDoor) {
            unlockDoor(nearbyDoor);
        } else if (nearbyMysteryBox) {
            openMysteryBox();
        }
    }
});

document.addEventListener('keyup', (e) => {
    keys[e.code] = false;
});

// Mobile touch controls - Joystick + Turn Buttons
const joystickArea = document.getElementById('joystickArea');
const joystickThumb = document.getElementById('joystickThumb');
const turnLeftBtn = document.getElementById('turnLeft');
const turnRightBtn = document.getElementById('turnRight');
const fireButton = document.getElementById('fireButton');

// Debug: verify elements are found
console.log('Turn buttons found:', { left: !!turnLeftBtn, right: !!turnRightBtn });

// Set game mode and update UI
gameState.mode = gameMode;
const modeIndicator = document.getElementById('modeIndicator');
if (modeIndicator) {
    modeIndicator.textContent = gameMode.toUpperCase();
    modeIndicator.className = gameMode;
}

// LEFT JOYSTICK - Movement
if (joystickArea) {
    joystickArea.addEventListener('touchstart', (e) => {
        e.preventDefault();
        const touch = e.touches[0];
        const rect = joystickArea.getBoundingClientRect();
        joystick.active = true;
        joystick.startX = rect.left + rect.width / 2;
        joystick.startY = rect.top + rect.height / 2;
    }, { passive: false });

    joystickArea.addEventListener('touchmove', (e) => {
        e.preventDefault();
        if (!joystick.active) return;

        const touch = e.touches[0];
        let dx = touch.clientX - joystick.startX;
        let dy = touch.clientY - joystick.startY;

        // Limit joystick movement
        const distance = Math.sqrt(dx * dx + dy * dy);
        if (distance > joystick.maxDistance) {
            dx = (dx / distance) * joystick.maxDistance;
            dy = (dy / distance) * joystick.maxDistance;
        }

        // Update joystick thumb position dynamically
        const thumbOffset = (joystickThumb.offsetWidth || 50) / 2;
        const areaSize = joystickArea.offsetWidth || 140;
        const centerOffset = (areaSize / 2) - thumbOffset;
        joystickThumb.style.left = (centerOffset + dx) + 'px';
        joystickThumb.style.top = (centerOffset + dy) + 'px';

        // Update mobile input (normalized -1 to 1)
        mobileInput.moveX = dx / joystick.maxDistance;
        mobileInput.moveY = dy / joystick.maxDistance;
    }, { passive: false });

    joystickArea.addEventListener('touchend', (e) => {
        e.preventDefault();
        joystick.active = false;
        // Reset thumb to center
        const thumbOffset = (joystickThumb.offsetWidth || 50) / 2;
        const areaSize = joystickArea.offsetWidth || 140;
        const centerOffset = (areaSize / 2) - thumbOffset;
        joystickThumb.style.left = centerOffset + 'px';
        joystickThumb.style.top = centerOffset + 'px';
        mobileInput.moveX = 0;
        mobileInput.moveY = 0;
    }, { passive: false });

    joystickArea.addEventListener('touchcancel', (e) => {
        joystick.active = false;
        mobileInput.moveX = 0;
        mobileInput.moveY = 0;
    });
}

// Turn button intervals - directly modify player angle
let turnLeftInterval = null;
let turnRightInterval = null;

// LEFT TURN BUTTON - tap/hold to turn left
if (turnLeftBtn) {
    const startTurnLeft = (e) => {
        e.preventDefault();
        if (turnLeftInterval) clearInterval(turnLeftInterval);
        turnLeftInterval = setInterval(() => {
            player.angle -= player.rotSpeed;
        }, 16);
    };

    const stopTurnLeft = () => {
        if (turnLeftInterval) {
            clearInterval(turnLeftInterval);
            turnLeftInterval = null;
        }
    };

    turnLeftBtn.addEventListener('touchstart', startTurnLeft, { passive: false });
    turnLeftBtn.addEventListener('touchend', stopTurnLeft, { passive: false });
    turnLeftBtn.addEventListener('touchcancel', stopTurnLeft);
    turnLeftBtn.addEventListener('mousedown', startTurnLeft);
    turnLeftBtn.addEventListener('mouseup', stopTurnLeft);
    turnLeftBtn.addEventListener('mouseleave', stopTurnLeft);
}

// RIGHT TURN BUTTON - tap/hold to turn right
if (turnRightBtn) {
    const startTurnRight = (e) => {
        e.preventDefault();
        if (turnRightInterval) clearInterval(turnRightInterval);
        turnRightInterval = setInterval(() => {
            player.angle += player.rotSpeed;
        }, 16);
    };

    const stopTurnRight = () => {
        if (turnRightInterval) {
            clearInterval(turnRightInterval);
            turnRightInterval = null;
        }
    };

    turnRightBtn.addEventListener('touchstart', startTurnRight, { passive: false });
    turnRightBtn.addEventListener('touchend', stopTurnRight, { passive: false });
    turnRightBtn.addEventListener('touchcancel', stopTurnRight);
    turnRightBtn.addEventListener('mousedown', startTurnRight);
    turnRightBtn.addEventListener('mouseup', stopTurnRight);
    turnRightBtn.addEventListener('mouseleave', stopTurnRight);
}

// FIRE BUTTON
if (fireButton) {
    fireButton.addEventListener('touchstart', (e) => {
        e.preventDefault();
        shoot();
    }, { passive: false });
}

// NUKE BUTTON
const flipButton = document.getElementById('flipButton');
if (flipButton) {
    flipButton.addEventListener('touchstart', (e) => {
        e.preventDefault();
        activateNuke();
    }, { passive: false });
}

// Handle screen resize and orientation change
window.addEventListener('resize', () => {
    updateScreenSize();
});

window.addEventListener('orientationchange', () => {
    setTimeout(() => {
        updateScreenSize();
    }, 100);
});

// Also listen for screen orientation API if available
if (screen.orientation) {
    screen.orientation.addEventListener('change', () => {
        setTimeout(() => {
            updateScreenSize();
        }, 100);
    });
}

// Prevent default touch behaviors
document.addEventListener('touchmove', (e) => {
    if (e.target.closest('#mobileControls') || e.target === canvas) {
        e.preventDefault();
    }
}, { passive: false });

// Canvas touch for door/mystery box unlock on mobile
canvas.addEventListener('touchstart', (e) => {
    const touch = e.touches[0];
    const cx = SCREEN_WIDTH / 2;
    const cy = SCREEN_HEIGHT - 150;

    // Check if door popup is showing and player tapped
    if (nearbyDoor && gameState.tokens >= nearbyDoor.price) {
        // If tap is near the popup area, unlock the door
        if (Math.abs(touch.clientX - cx) < 150 && Math.abs(touch.clientY - cy) < 60) {
            e.preventDefault();
            unlockDoor(nearbyDoor);
            return;
        }
    }

    // Check if mystery box popup is showing and player tapped
    if (nearbyMysteryBox && gameState.tokens >= nearbyMysteryBox.box.price) {
        // If tap is near the popup area, open the mystery box
        if (Math.abs(touch.clientX - cx) < 150 && Math.abs(touch.clientY - cy) < 60) {
            e.preventDefault();
            openMysteryBox();
            return;
        }
    }
});

// Player spawn - always in the large starting room (rows 1-6, cols 1-14)
function spawnPlayer() {
    // Spawn in center of starting room, facing the doors
    const x = 7; // Center of room horizontally
    const y = 4; // Middle of starting area
    player.x = x * TILE_SIZE + TILE_SIZE / 2;
    player.y = y * TILE_SIZE + TILE_SIZE / 2;
    player.angle = Math.PI / 2; // Face down towards the doors
}

// Start game
spawnPlayer();
initDoors();
initEnemies();
spawnNukePickup();
spawnAmmoPickup();
updateHUD();
showWaveAnnouncement(1);
gameLoop();

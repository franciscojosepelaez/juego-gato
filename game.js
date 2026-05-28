"use strict";

const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");
const healthFill = document.getElementById("healthFill");
const livesText = document.getElementById("lives");
const scoreText = document.getElementById("score");
const overlay = document.getElementById("overlay");
const overlayTitle = document.getElementById("overlayTitle");
const overlayText = document.getElementById("overlayText");
const restartButton = document.getElementById("restartButton");
const soundButton = document.getElementById("soundButton");
const mobileControls = document.getElementById("mobileControls");

// Configuración base del mundo y físicas.
const WORLD = { width: 3200, height: 540 };
const GRAVITY = 0.72;
const FRICTION = 0.82;
const MAX_HEALTH = 100;

const keys = new Set();
const virtualKeys = new Set();
let lastTime = 0;
let cameraX = 0;
let score = 0;
let lives = 3;
let gameState = "playing";
let finishTimer = 0;
let audioContext = null;
let soundMuted = localStorage.getItem("gatoSoundMuted") === "true";

// Nivel completo: suelo, plataformas, obstáculos y caja final.
const level = {
  platforms: [
    { x: 0, y: 484, w: 780, h: 56 },
    { x: 850, y: 484, w: 620, h: 56 },
    { x: 1560, y: 484, w: 680, h: 56 },
    { x: 2320, y: 484, w: 880, h: 56 },
    { x: 270, y: 380, w: 220, h: 24 },
    { x: 620, y: 320, w: 230, h: 24 },
    { x: 1040, y: 390, w: 260, h: 24 },
    { x: 1410, y: 330, w: 250, h: 24 },
    { x: 1850, y: 370, w: 260, h: 24 },
    { x: 2180, y: 305, w: 230, h: 24 },
    { x: 2540, y: 390, w: 250, h: 24 }
  ],
  hazards: [
    { x: 760, y: 454, w: 80, h: 30 },
    { x: 1470, y: 454, w: 90, h: 30 },
    { x: 2240, y: 454, w: 80, h: 30 }
  ],
  goal: { x: 3010, y: 414, w: 110, h: 70 }
};

const spawnPoint = { x: 70, y: 390 };

// Estado del protagonista.
const player = {
  x: spawnPoint.x,
  y: spawnPoint.y,
  w: 42,
  h: 52,
  vx: 0,
  vy: 0,
  dir: 1,
  grounded: false,
  health: MAX_HEALTH,
  invulnerable: 0,
  attackTimer: 0,
  distractionTimer: 0,
  finishPose: false
};

let enemies = [];
let collectibles = [];
let particles = [];

// Reinicia entidades y posición del jugador sin recargar la página.
function resetLevel(keepScore = false) {
  player.x = spawnPoint.x;
  player.y = spawnPoint.y;
  player.vx = 0;
  player.vy = 0;
  player.dir = 1;
  player.grounded = false;
  player.health = MAX_HEALTH;
  player.invulnerable = 80;
  player.attackTimer = 0;
  player.distractionTimer = 0;
  player.finishPose = false;
  cameraX = 0;
  finishTimer = 0;
  gameState = "playing";
  if (!keepScore) score = 0;

  enemies = [
    makeEnemy(430, 328, 270, 490),
    makeEnemy(1120, 438, 1010, 1290),
    makeEnemy(1510, 278, 1410, 1660),
    makeEnemy(1930, 318, 1850, 2110),
    makeEnemy(2600, 438, 2400, 2820)
  ];

  collectibles = [
    makeCollectible("mouse", 330, 338),
    makeCollectible("yarn", 710, 278),
    makeCollectible("mouse", 1170, 350),
    makeCollectible("yarn", 1510, 288),
    makeCollectible("mouse", 1950, 328),
    makeCollectible("yarn", 2250, 263),
    makeCollectible("mouse", 2670, 350),
    makeCollectible("yarn", 2900, 440)
  ];

  particles = [];
  hideOverlay();
  updateHud();
}

function makeEnemy(x, y, minX, maxX) {
  return { x, y, w: 40, h: 38, vx: 1.15, minX, maxX, defeated: false, squash: 0 };
}

function makeCollectible(type, x, y) {
  return { type, x, y, w: 28, h: 24, taken: false, bob: Math.random() * Math.PI * 2 };
}

function rectsOverlap(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function isPressed(key) {
  return keys.has(key) || virtualKeys.has(key);
}

function isJumpPressed() {
  return isPressed(" ") || isPressed("w") || isPressed("arrowup");
}

// Entrada, movimiento y colisiones.
function handleInput() {
  if (gameState !== "playing" || player.finishPose) return;

  const left = isPressed("arrowleft") || isPressed("a");
  const right = isPressed("arrowright") || isPressed("d");

  if (left) {
    player.vx -= 0.65;
    player.dir = -1;
  }
  if (right) {
    player.vx += 0.65;
    player.dir = 1;
  }
  if (isJumpPressed() && player.grounded) {
    player.vy = -14.5;
    player.grounded = false;
    playSound("jump");
  }

  player.vx = Math.max(-6, Math.min(6, player.vx));
}

function updatePlayer() {
  player.attackTimer = Math.max(0, player.attackTimer - 1);
  player.invulnerable = Math.max(0, player.invulnerable - 1);
  player.distractionTimer = Math.max(0, player.distractionTimer - 1);

  if (player.finishPose) {
    player.vx *= 0.75;
    player.vy += GRAVITY;
  } else {
    handleInput();
    player.vy += GRAVITY;
    player.vx *= player.grounded ? FRICTION : 0.96;
  }

  moveAndCollide(player);

  if (player.y > WORLD.height + 80) damagePlayer(MAX_HEALTH);
  updateHazards();

  const goal = level.goal;
  if (gameState === "playing" && rectsOverlap(player, goal)) {
    startFinishSequence();
  }
}

function updateHazards() {
  for (const hazard of level.hazards) {
    if (rectsOverlap(player, hazard)) damagePlayer(36);
  }
}

function moveAndCollide(entity) {
  entity.x += entity.vx;
  entity.x = Math.max(0, Math.min(WORLD.width - entity.w, entity.x));

  for (const platform of level.platforms) {
    if (rectsOverlap(entity, platform)) {
      if (entity.vx > 0) entity.x = platform.x - entity.w;
      if (entity.vx < 0) entity.x = platform.x + platform.w;
      entity.vx = 0;
    }
  }

  entity.y += entity.vy;
  entity.grounded = false;

  for (const platform of level.platforms) {
    if (!rectsOverlap(entity, platform)) continue;
    if (entity.vy > 0) {
      entity.y = platform.y - entity.h;
      entity.vy = 0;
      entity.grounded = true;
    } else if (entity.vy < 0) {
      entity.y = platform.y + platform.h;
      entity.vy = 0;
    }
  }
}

function damagePlayer(amount) {
  if (player.invulnerable > 0 || gameState !== "playing") return;
  player.health -= amount;
  player.invulnerable = 80;
  player.vx = -player.dir * 5;
  player.vy = -7;
  playSound("damage");
  addParticles(player.x + player.w / 2, player.y + 20, "#ff5f5f", 8);

  if (player.health <= 0) {
    lives -= 1;
    playSound("life");
    if (lives <= 0) {
      lives = 0;
      gameState = "gameover";
      playSound("gameover");
      showOverlay("Game Over", "El gato se ha quedado sin vidas.");
    } else {
      resetLevel(true);
    }
  }
  updateHud();
}

function updateEnemies() {
  for (const enemy of enemies) {
    if (enemy.defeated) {
      enemy.squash += 1;
      continue;
    }

    enemy.x += enemy.vx;
    if (enemy.x < enemy.minX || enemy.x + enemy.w > enemy.maxX) {
      enemy.vx *= -1;
      enemy.x = Math.max(enemy.minX, Math.min(enemy.maxX - enemy.w, enemy.x));
    }

    if (player.attackTimer > 8 && rectsOverlap(getAttackBox(), enemy)) {
      enemy.defeated = true;
      score += 150;
      playSound("enemy");
      addParticles(enemy.x + enemy.w / 2, enemy.y + 18, "#ffd166", 12);
      updateHud();
      continue;
    }

    if (rectsOverlap(player, enemy)) {
      damagePlayer(28);
    }
  }

  enemies = enemies.filter((enemy) => !enemy.defeated || enemy.squash < 35);
}

// Coleccionables: ratones y ovillos.
function updateCollectibles() {
  for (const item of collectibles) {
    if (item.taken) continue;
    item.bob += 0.08;
    const hitbox = { x: item.x, y: item.y + Math.sin(item.bob) * 4, w: item.w, h: item.h };
    if (!rectsOverlap(player, hitbox)) continue;

    item.taken = true;
    if (item.type === "mouse") {
      score += 100;
      player.health = Math.min(MAX_HEALTH, player.health + 22);
      playSound("mouse");
      addParticles(item.x + 14, item.y + 12, "#d8f3ff", 10);
    } else {
      score += 35;
      player.health = Math.min(MAX_HEALTH, player.health + 12);
      player.distractionTimer = 55;
      playSound("yarn");
      addParticles(item.x + 14, item.y + 12, "#f07ab8", 12);
    }
    updateHud();
  }
}

function updateParticles() {
  for (const particle of particles) {
    particle.x += particle.vx;
    particle.y += particle.vy;
    particle.vy += 0.12;
    particle.life -= 1;
  }
  particles = particles.filter((particle) => particle.life > 0);
}

function addParticles(x, y, color, count) {
  for (let i = 0; i < count; i += 1) {
    particles.push({
      x,
      y,
      vx: (Math.random() - 0.5) * 5,
      vy: -Math.random() * 4,
      r: 2 + Math.random() * 3,
      color,
      life: 22 + Math.random() * 20
    });
  }
}

// Sonidos sinteticos con Web Audio API para funcionar sin archivos externos.
function ensureAudio() {
  if (audioContext) return audioContext;
  const AudioCtor = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtor) return null;
  audioContext = new AudioCtor();
  return audioContext;
}

function unlockAudio() {
  const context = ensureAudio();
  if (context && context.state === "suspended") {
    context.resume();
  }
}

function setSoundMuted(muted) {
  soundMuted = muted;
  localStorage.setItem("gatoSoundMuted", String(soundMuted));
  if (soundButton) {
    soundButton.textContent = soundMuted ? "Silencio" : "Sonido";
    soundButton.setAttribute("aria-pressed", String(soundMuted));
  }
}

function playTone(frequency, duration, type = "sine", volume = 0.08, delay = 0) {
  if (soundMuted) return;
  const context = ensureAudio();
  if (!context || context.state !== "running") return;

  const start = context.currentTime + delay;
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, start);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(volume, start + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.start(start);
  oscillator.stop(start + duration + 0.02);
}

function playSweep(from, to, duration, type = "sine", volume = 0.08) {
  if (soundMuted) return;
  const context = ensureAudio();
  if (!context || context.state !== "running") return;

  const start = context.currentTime;
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(from, start);
  oscillator.frequency.exponentialRampToValueAtTime(to, start + duration);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(volume, start + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.start(start);
  oscillator.stop(start + duration + 0.02);
}

function playSound(name) {
  switch (name) {
    case "jump":
      playSweep(320, 720, 0.12, "triangle", 0.07);
      break;
    case "attack":
      playSweep(760, 190, 0.08, "sawtooth", 0.045);
      break;
    case "damage":
      playSweep(180, 80, 0.16, "square", 0.055);
      break;
    case "enemy":
      playTone(260, 0.06, "square", 0.06);
      playTone(520, 0.08, "triangle", 0.055, 0.06);
      break;
    case "mouse":
      playTone(740, 0.05, "triangle", 0.06);
      playTone(980, 0.07, "triangle", 0.055, 0.06);
      break;
    case "yarn":
      playTone(520, 0.06, "sine", 0.055);
      playTone(650, 0.08, "sine", 0.05, 0.07);
      break;
    case "life":
      playSweep(220, 120, 0.2, "triangle", 0.065);
      break;
    case "box":
      playTone(330, 0.08, "triangle", 0.06);
      playTone(495, 0.08, "triangle", 0.055, 0.08);
      break;
    case "victory":
      playTone(523, 0.09, "triangle", 0.06);
      playTone(659, 0.09, "triangle", 0.06, 0.1);
      playTone(784, 0.16, "triangle", 0.06, 0.2);
      break;
    case "gameover":
      playTone(220, 0.11, "sawtooth", 0.055);
      playTone(165, 0.14, "sawtooth", 0.05, 0.12);
      playTone(110, 0.18, "sawtooth", 0.045, 0.27);
      break;
    default:
      break;
  }
}

function triggerAttack() {
  if (gameState === "playing" && player.attackTimer === 0 && !player.finishPose) {
    player.attackTimer = 18;
    playSound("attack");
  }
}

// Caja de ataque del zarpazo, delante del gato según su dirección.
function getAttackBox() {
  return {
    x: player.dir > 0 ? player.x + player.w - 4 : player.x - 36,
    y: player.y + 12,
    w: 40,
    h: 26
  };
}

function startFinishSequence() {
  gameState = "finished";
  player.finishPose = true;
  player.x = level.goal.x + 34;
  player.y = level.goal.y + 8;
  player.vx = 0;
  player.vy = -8;
  score += 500;
  playSound("box");
  addParticles(level.goal.x + 55, level.goal.y + 20, "#ffcf4c", 24);
  updateHud();
}

function updateFinishSequence() {
  if (gameState !== "finished") return;
  finishTimer += 1;
  if (finishTimer === 95) {
    playSound("victory");
    showOverlay("¡Has terminado el nivel!", "El gato encontró la caja perfecta.");
  }
}

function updateCamera() {
  cameraX = player.x - canvas.width * 0.42;
  cameraX = Math.max(0, Math.min(WORLD.width - canvas.width, cameraX));
}

function updateHud() {
  healthFill.style.width = `${Math.max(0, player.health)}%`;
  livesText.textContent = `Vidas: ${lives}`;
  scoreText.textContent = `Puntos: ${score}`;
}

function showOverlay(title, text) {
  overlayTitle.textContent = title;
  overlayText.textContent = text;
  overlay.classList.remove("hidden");
}

function hideOverlay() {
  overlay.classList.add("hidden");
}

// Dibujo del mundo y entidades.
function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawSky();
  ctx.save();
  ctx.translate(-cameraX, 0);
  drawLevel();
  drawCollectibles();
  drawEnemies();
  drawPlayer();
  drawParticles();
  ctx.restore();
}

function drawSky() {
  const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
  gradient.addColorStop(0, "#74cfff");
  gradient.addColorStop(0.68, "#c8f3ff");
  gradient.addColorStop(0.69, "#9ee36e");
  gradient.addColorStop(1, "#6bbf55");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  drawCloud(110 - cameraX * 0.15, 84, 1);
  drawCloud(420 - cameraX * 0.1, 120, 0.75);
  drawCloud(780 - cameraX * 0.18, 72, 0.9);
}

function drawCloud(x, y, scale) {
  ctx.fillStyle = "rgba(255, 255, 255, 0.9)";
  ctx.beginPath();
  ctx.arc(x, y, 24 * scale, 0, Math.PI * 2);
  ctx.arc(x + 28 * scale, y - 12 * scale, 28 * scale, 0, Math.PI * 2);
  ctx.arc(x + 62 * scale, y, 22 * scale, 0, Math.PI * 2);
  ctx.fillRect(x - 2 * scale, y, 68 * scale, 20 * scale);
  ctx.fill();
}

function drawLevel() {
  for (const platform of level.platforms) {
    ctx.fillStyle = "#4faf58";
    ctx.fillRect(platform.x, platform.y, platform.w, platform.h);
    ctx.fillStyle = "#7b4e2e";
    ctx.fillRect(platform.x, platform.y + 14, platform.w, platform.h - 14);
    ctx.fillStyle = "#78d66e";
    for (let x = platform.x + 8; x < platform.x + platform.w; x += 28) {
      ctx.fillRect(x, platform.y, 14, 6);
    }
  }

  for (const hazard of level.hazards) {
    ctx.fillStyle = "#38454f";
    for (let x = hazard.x; x < hazard.x + hazard.w; x += 20) {
      ctx.beginPath();
      ctx.moveTo(x, hazard.y + hazard.h);
      ctx.lineTo(x + 10, hazard.y);
      ctx.lineTo(x + 20, hazard.y + hazard.h);
      ctx.closePath();
      ctx.fill();
    }
  }

  drawGoalBox(level.goal);
}

function drawGoalBox(box) {
  ctx.fillStyle = "#b9793b";
  ctx.fillRect(box.x, box.y + 18, box.w, box.h - 18);
  ctx.fillStyle = "#d99a53";
  ctx.beginPath();
  ctx.moveTo(box.x, box.y + 18);
  ctx.lineTo(box.x + 28, box.y);
  ctx.lineTo(box.x + 52, box.y + 18);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(box.x + box.w, box.y + 18);
  ctx.lineTo(box.x + box.w - 28, box.y);
  ctx.lineTo(box.x + box.w - 52, box.y + 18);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "#6d421f";
  ctx.lineWidth = 4;
  ctx.strokeRect(box.x, box.y + 18, box.w, box.h - 18);

  if (gameState === "finished" && finishTimer > 42) {
    drawCatHead(box.x + 55, box.y + 16, 1, "#f6a04c", true);
  }
}

function drawPlayer() {
  const blink = player.invulnerable > 0 && Math.floor(player.invulnerable / 5) % 2 === 0;
  if (blink && gameState === "playing") return;

  const walking = Math.abs(player.vx) > 0.6 && player.grounded;
  const jumping = !player.grounded;
  const attacking = player.attackTimer > 0;
  const distracted = player.distractionTimer > 0;
  const bounce = walking ? Math.sin(performance.now() / 75) * 3 : 0;
  const x = player.x + player.w / 2;
  const y = player.y + player.h / 2 + bounce;

  if (gameState === "finished" && finishTimer > 36) return;

  ctx.save();
  ctx.translate(x, y);
  ctx.scale(player.dir, 1);

  ctx.fillStyle = distracted ? "#f7b35a" : "#f6a04c";
  ctx.beginPath();
  ctx.ellipse(0, 6, 19, 24, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = "#f6a04c";
  ctx.lineWidth = 7;
  ctx.beginPath();
  ctx.moveTo(-16, 14);
  ctx.quadraticCurveTo(-34, 4, -26, -8);
  ctx.stroke();

  drawCatHead(2, -22, 1, distracted ? "#f7b35a" : "#f6a04c", false);

  ctx.strokeStyle = "#7b4e2e";
  ctx.lineWidth = 4;
  const legSwing = walking ? Math.sin(performance.now() / 80) * 6 : 0;
  ctx.beginPath();
  ctx.moveTo(-9, 26);
  ctx.lineTo(-12 + legSwing, 33);
  ctx.moveTo(10, 25);
  ctx.lineTo(13 - legSwing, 33);
  ctx.stroke();

  if (jumping) {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(-18, 28, 9, 5);
    ctx.fillRect(8, 28, 9, 5);
  }

  if (attacking) {
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(17, -3);
    ctx.lineTo(43, -11);
    ctx.moveTo(19, 4);
    ctx.lineTo(45, 4);
    ctx.moveTo(17, 11);
    ctx.lineTo(42, 18);
    ctx.stroke();
  }

  if (distracted) {
    ctx.strokeStyle = "#f07ab8";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, -2, 30, 0.2, 1.45);
    ctx.stroke();
  }

  ctx.restore();
}

function drawCatHead(x, y, scale, color, happy) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(-18, -5);
  ctx.lineTo(-12, -24);
  ctx.lineTo(0, -12);
  ctx.lineTo(12, -24);
  ctx.lineTo(18, -5);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(0, 0, 20, 17, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#26313a";
  ctx.beginPath();
  ctx.arc(-7, -3, 2.5, 0, Math.PI * 2);
  ctx.arc(8, -3, 2.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#f5d2d2";
  ctx.beginPath();
  ctx.moveTo(0, 1);
  ctx.lineTo(-4, 6);
  ctx.lineTo(4, 6);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "#26313a";
  ctx.lineWidth = 2;
  ctx.beginPath();
  if (happy) {
    ctx.arc(-4, 7, 5, 0, Math.PI);
    ctx.moveTo(4, 7);
    ctx.arc(4, 7, 5, 0, Math.PI);
  } else {
    ctx.moveTo(-5, 9);
    ctx.lineTo(5, 9);
  }
  ctx.stroke();
  ctx.restore();
}

function drawEnemies() {
  for (const enemy of enemies) {
    ctx.save();
    ctx.translate(enemy.x + enemy.w / 2, enemy.y + enemy.h / 2);
    ctx.scale(enemy.vx > 0 ? 1 : -1, enemy.defeated ? 0.35 : 1);
    ctx.fillStyle = enemy.defeated ? "#8f8f8f" : "#6650a4";
    ctx.beginPath();
    ctx.ellipse(0, 4, 18, 16, 0, 0, Math.PI * 2);
    ctx.fill();
    drawCatHead(1, -12, 0.72, enemy.defeated ? "#8f8f8f" : "#7b66c7", false);
    ctx.strokeStyle = "#3d306b";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-12, 14);
    ctx.lineTo(-17, 19);
    ctx.moveTo(12, 14);
    ctx.lineTo(17, 19);
    ctx.stroke();
    ctx.restore();
  }
}

function drawCollectibles() {
  for (const item of collectibles) {
    if (item.taken) continue;
    const y = item.y + Math.sin(item.bob) * 4;
    if (item.type === "mouse") drawMouse(item.x, y);
    else drawYarn(item.x, y);
  }
}

function drawMouse(x, y) {
  ctx.fillStyle = "#d8f3ff";
  ctx.beginPath();
  ctx.ellipse(x + 14, y + 13, 13, 8, 0, 0, Math.PI * 2);
  ctx.arc(x + 4, y + 8, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#6a7f8a";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x + 26, y + 13);
  ctx.quadraticCurveTo(x + 36, y + 8, x + 38, y + 17);
  ctx.stroke();
  ctx.fillStyle = "#26313a";
  ctx.fillRect(x + 2, y + 7, 2, 2);
}

function drawYarn(x, y) {
  ctx.fillStyle = "#f07ab8";
  ctx.beginPath();
  ctx.arc(x + 14, y + 13, 12, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(x + 14, y + 13, 8, 0.4, 4.2);
  ctx.moveTo(x + 5, y + 12);
  ctx.lineTo(x + 23, y + 8);
  ctx.moveTo(x + 7, y + 18);
  ctx.lineTo(x + 24, y + 19);
  ctx.stroke();
}

function drawParticles() {
  for (const particle of particles) {
    ctx.globalAlpha = Math.max(0, particle.life / 40);
    ctx.fillStyle = particle.color;
    ctx.beginPath();
    ctx.arc(particle.x, particle.y, particle.r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

// Bucle principal solicitado: actualiza estado y renderiza cada frame.
function gameLoop(timestamp = 0) {
  const delta = Math.min(32, timestamp - lastTime);
  lastTime = timestamp;
  void delta;

  if (gameState === "playing" || gameState === "finished") {
    updatePlayer();
    updateEnemies();
    updateCollectibles();
    updateParticles();
    updateFinishSequence();
    updateCamera();
  }

  draw();
  requestAnimationFrame(gameLoop);
}

function updateTouchControlsVisibility() {
  const hasTouch = navigator.maxTouchPoints > 0 || window.matchMedia("(pointer: coarse)").matches;
  const smallScreen = window.matchMedia("(max-width: 760px)").matches;
  document.body.classList.toggle("show-touch-controls", hasTouch || smallScreen);
}

function pressVirtualControl(control, button) {
  unlockAudio();
  button.classList.add("is-pressed");

  if (control === "left") virtualKeys.add("arrowleft");
  if (control === "right") virtualKeys.add("arrowright");
  if (control === "jump") virtualKeys.add("arrowup");
  if (control === "attack") triggerAttack();
}

function releaseVirtualControl(control, button) {
  button.classList.remove("is-pressed");

  if (control === "left") virtualKeys.delete("arrowleft");
  if (control === "right") virtualKeys.delete("arrowright");
  if (control === "jump") virtualKeys.delete("arrowup");
}

function setupMobileControls() {
  if (!mobileControls) return;

  for (const button of mobileControls.querySelectorAll("[data-control]")) {
    const control = button.dataset.control;

    button.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      button.setPointerCapture(event.pointerId);
      pressVirtualControl(control, button);
    });

    button.addEventListener("pointerup", (event) => {
      event.preventDefault();
      releaseVirtualControl(control, button);
    });

    button.addEventListener("pointercancel", (event) => {
      event.preventDefault();
      releaseVirtualControl(control, button);
    });

    button.addEventListener("lostpointercapture", () => {
      releaseVirtualControl(control, button);
    });

    button.addEventListener("contextmenu", (event) => {
      event.preventDefault();
    });
  }
}

window.addEventListener("keydown", (event) => {
  unlockAudio();
  const key = event.key.toLowerCase();
  if ([" ", "arrowup", "arrowdown", "arrowleft", "arrowright"].includes(key)) {
    event.preventDefault();
  }
  keys.add(key);

  if (key === "j") triggerAttack();
});

window.addEventListener("keyup", (event) => {
  keys.delete(event.key.toLowerCase());
});

window.addEventListener("pointerdown", unlockAudio, { once: true });
window.addEventListener("touchstart", unlockAudio, { once: true, passive: true });
window.addEventListener("resize", updateTouchControlsVisibility);
window.addEventListener("orientationchange", updateTouchControlsVisibility);

canvas.addEventListener("contextmenu", (event) => {
  event.preventDefault();
});

if (soundButton) {
  soundButton.addEventListener("click", () => {
    unlockAudio();
    setSoundMuted(!soundMuted);
  });
}

restartButton.addEventListener("click", () => {
  unlockAudio();
  lives = 3;
  resetLevel(false);
});

setSoundMuted(soundMuted);
setupMobileControls();
updateTouchControlsVisibility();
resetLevel(false);
requestAnimationFrame(gameLoop);

'use strict';

const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const W = 800;
const H = 600;

// ── Input ─────────────────────────────────────────────────────────────────────
const keys = {};
const justPressed = {};

window.addEventListener('keydown', e => {
  justPressed[e.code] = !keys[e.code];
  keys[e.code] = true;
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code))
    e.preventDefault();
});
window.addEventListener('keyup', e => { keys[e.code] = false; });

function pressed(code) {
  const val = justPressed[code];
  justPressed[code] = false;
  return val;
}

// ── Utils ─────────────────────────────────────────────────────────────────────
const wrap  = (v, max) => ((v % max) + max) % max;
const dist  = (a, b)   => Math.hypot(a.x - b.x, a.y - b.y);
const rand  = (min, max) => min + Math.random() * (max - min);
const randInt = (min, max) => Math.floor(rand(min, max + 1));

// ── Skins de la nave ──────────────────────────────────────────────────────────
// Cada skin es solo datos: silueta (vértices) + colores. El dibujado es único
// y recorre los vértices; añadir un skin no requiere tocar Ship.draw().
// El radio de colisión sigue siendo 12: las siluetas deben caber en ~±26 x, ±14 y.
const SKINS = [
  {
    id: 'classic', name: 'CLASICA',
    color: '#fff', flame: 'rgba(255, 130, 0, 0.85)',
    verts: [[20, 0], [-12, -9], [-7, 0], [-12, 9]],
  },
  {
    id: 'dart', name: 'DART',
    color: '#9be7ff', flame: 'rgba(120, 200, 255, 0.9)',
    verts: [[26, 0], [-4, -8], [-16, -3], [-16, 3], [-4, 8]],
  },
  {
    id: 'delta', name: 'DELTA',
    color: '#ff7a3c', flame: 'rgba(255, 240, 180, 0.9)',
    verts: [[18, 0], [-14, -14], [-14, 14]],
  },
  {
    id: 'mantis', name: 'MANTIS',
    color: '#7dff9e', flame: 'rgba(130, 255, 160, 0.85)',
    verts: [[16, 0], [-4, -6], [-16, -10], [-12, -2], [-12, 2], [-16, 10], [-4, 6]],
  },
];

const SKIN_STORAGE_KEY = 'asteroids-skin';
let skinIndex = 0;

const currentSkin = () => SKINS[skinIndex];

function cycleSkin() {
  skinIndex = (skinIndex + 1) % SKINS.length;
  saveSkin();
}

function loadSkin() {
  try {
    const stored = parseInt(localStorage.getItem(SKIN_STORAGE_KEY), 10);
    if (Number.isInteger(stored) && stored >= 0 && stored < SKINS.length)
      skinIndex = stored;
  } catch {
    // localStorage puede no estar disponible (modo privado); se usa el skin 0
  }
}

function saveSkin() {
  try {
    localStorage.setItem(SKIN_STORAGE_KEY, String(skinIndex));
  } catch {
    // Sin persistencia disponible: el skin solo dura la sesión
  }
}

// ── Power-up Velocidad ────────────────────────────────────────────────────────
const POWERUP_DROP_CHANCE = 0.15;
const POWERUP_TTL   = 10;   // segundos en pantalla antes de desaparecer
const BOOST_DURATION = 5;   // segundos de efecto
const BOOST_THRUST   = 520; // empuje duplicado (base: 260)
const TRIPLE_DURATION = 3;  // segundos de efecto
const TRIPLE_SPREAD   = 10 * Math.PI / 180; // abanico: ±10° respecto a la nariz
const SHIELD_DURATION = 8;  // segundos de efecto
const SHIELD_EXTRA    = 8;  // px que crece la hitbox de la nave con escudo

// ── Bullet ────────────────────────────────────────────────────────────────────
class Bullet {
  constructor(x, y, angle) {
    this.x = x;
    this.y = y;
    const SPEED = 520;
    this.vx = Math.cos(angle) * SPEED;
    this.vy = Math.sin(angle) * SPEED;
    this.ttl  = 1.1;
    this.radius = 2;
    this.dead = false;
  }

  update(dt) {
    this.x = wrap(this.x + this.vx * dt, W);
    this.y = wrap(this.y + this.vy * dt, H);
    this.ttl -= dt;
    if (this.ttl <= 0) this.dead = true;
  }

  draw() {
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
    ctx.fill();
  }
}

// ── Asteroid ──────────────────────────────────────────────────────────────────
const RADII  = [0, 16, 30, 50];   // por tamaño 1, 2, 3
const SPEEDS = [0, 85, 55, 32];   // velocidad base por tamaño
const POINTS = [0, 100, 50, 20];  // puntos por tamaño

// Estrella fugaz: asteroide pequeño y veloz que se esfuma con el tiempo
const SHOOTING_CHANCE = 0.15; // probabilidad al generar el nivel
const SHOOTING_SPEED  = 200;  // px/s (bala: 520, asteroide normal: máx ~85)
const SHOOTING_TTL    = 8;    // segundos antes de desaparecer sola
const SHOOTING_POINTS = 200;  // puntos fijos al destruirla

class Asteroid {
  constructor(x, y, size = 3, type = 'normal') {
    this.type = type;
    this.dead = false;

    // La estrella fugaz siempre es pequeña, sin importar el tamaño pedido
    if (type === 'shooting') size = 1;

    this.x    = x;
    this.y    = y;
    this.size = size;
    this.radius = RADII[size];

    const angle = rand(0, Math.PI * 2);
    const speed = type === 'shooting' ? SHOOTING_SPEED : SPEEDS[size] + rand(-15, 15);
    this.vx = Math.cos(angle) * speed;
    this.vy = Math.sin(angle) * speed;
    this.rotSpeed = rand(-1.2, 1.2);
    this.rot = rand(0, Math.PI * 2);
    this.ttl = type === 'shooting' ? SHOOTING_TTL : Infinity;
    this.emitTimer = 0;

    // Polígono irregular
    const n = randInt(8, 13);
    this.verts = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const r = this.radius * rand(0.6, 1.0);
      this.verts.push([Math.cos(a) * r, Math.sin(a) * r]);
    }
  }

  update(dt) {
    this.x   = wrap(this.x + this.vx * dt, W);
    this.y   = wrap(this.y + this.vy * dt, H);
    this.rot += this.rotSpeed * dt;
    this.ttl -= dt;
    if (this.ttl <= 0) this.dead = true;
    if (this.type === 'shooting') this.emitTrail(dt);
  }

  // Estela de fuego: acumulador para que la densidad no dependa del framerate
  emitTrail(dt) {
    this.emitTimer -= dt;
    while (this.emitTimer <= 0) {
      this.emitTimer += 0.025;
      // Deriva hacia atrás del movimiento + dispersión
      const vx = -this.vx * rand(0.1, 0.3) + rand(-25, 25);
      const vy = -this.vy * rand(0.1, 0.3) + rand(-25, 25);
      particles.push(new Particle(this.x, this.y, {
        color: fireColor(),
        life: rand(0.2, 0.5),
        vx, vy,
      }));

      // Chispa ocasional, casi perpendicular al movimiento
      if (Math.random() < 0.08) {
        const side = Math.random() < 0.5 ? 1 : -1;
        const s = side * rand(60, 120);
        particles.push(new Particle(this.x, this.y, {
          color: '255,200,120',
          life: rand(0.1, 0.25),
          vx: (-this.vy / SHOOTING_SPEED) * s,
          vy: ( this.vx / SHOOTING_SPEED) * s,
        }));
      }
    }
  }

  split() {
    // La estrella fugaz se esfuma, no deja fragmentos
    if (this.type === 'shooting' || this.size <= 1) return [];
    return [
      new Asteroid(this.x, this.y, this.size - 1),
      new Asteroid(this.x, this.y, this.size - 1),
    ];
  }

  draw() {
    if (this.type === 'shooting') {
      // Parpadeo justo antes de esfumarse
      if (this.ttl < 1 && Math.floor(this.ttl * 8) % 2 === 0) return;

      // Núcleo brillante: tres halos superpuestos con leve destello
      const flicker = 1 + rand(-0.1, 0.1);
      const halos = [
        [10,  'rgba(255, 150, 50, 0.12)'],
        [6.5, 'rgba(255, 190, 80, 0.30)'],
        [4,   'rgba(255, 240, 210, 0.70)'],
      ];
      for (const [r, fill] of halos) {
        ctx.fillStyle = fill;
        ctx.beginPath();
        ctx.arc(this.x, this.y, r * flicker, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.rot);
    // Naranja tenue en la fugaz: deja visible el hitbox real de 16 px
    ctx.strokeStyle = this.type === 'shooting' ? 'rgba(255, 120, 60, 0.5)' : '#fff';
    ctx.lineWidth   = 1.5;
    ctx.lineJoin    = 'round';
    ctx.beginPath();
    ctx.moveTo(this.verts[0][0], this.verts[0][1]);
    for (let i = 1; i < this.verts.length; i++)
      ctx.lineTo(this.verts[i][0], this.verts[i][1]);
    ctx.closePath();
    ctx.stroke();
    ctx.restore();
  }
}

// ── Ship ──────────────────────────────────────────────────────────────────────
class Ship {
  constructor() { this.reset(); }

  reset() {
    this.x      = W / 2;
    this.y      = H / 2;
    this.angle  = -Math.PI / 2;
    this.vx     = 0;
    this.vy     = 0;
    this.radius = 12;
    this.thrusting     = false;
    this.invincible    = 3;
    this.shootCooldown = 0;
    this.speedBoost    = 0;
    this.tripleShot    = 0;
    this.shield        = 0;
    this.dead          = false;
  }

  update(dt) {
    if (this.dead) return;
    if (this.invincible    > 0) this.invincible    -= dt;
    if (this.shootCooldown > 0) this.shootCooldown -= dt;
    if (this.speedBoost    > 0) this.speedBoost    -= dt;
    if (this.tripleShot    > 0) this.tripleShot    -= dt;
    if (this.shield        > 0) this.shield        -= dt;

    const ROT    = 3.5;   // rad/s
    const THRUST = this.speedBoost > 0 ? BOOST_THRUST : 260; // px/s²
    const DRAG   = 0.987;

    if (keys['ArrowLeft'])  this.angle -= ROT * dt;
    if (keys['ArrowRight']) this.angle += ROT * dt;

    this.thrusting = !!keys['ArrowUp'];
    if (this.thrusting) {
      this.vx += Math.cos(this.angle) * THRUST * dt;
      this.vy += Math.sin(this.angle) * THRUST * dt;
    }

    this.vx *= DRAG;
    this.vy *= DRAG;
    this.x = wrap(this.x + this.vx * dt, W);
    this.y = wrap(this.y + this.vy * dt, H);
  }

  tryShoot() {
    if (this.shootCooldown > 0 || this.dead) return [];
    this.shootCooldown = 0.2;
    const NOSE = 21;
    const ox = this.x + Math.cos(this.angle) * NOSE;
    const oy = this.y + Math.sin(this.angle) * NOSE;
    if (this.tripleShot > 0) {
      return [-TRIPLE_SPREAD, 0, TRIPLE_SPREAD]
        .map(offset => new Bullet(ox, oy, this.angle + offset));
    }
    return [new Bullet(ox, oy, this.angle)];
  }

  draw() {
    if (this.dead) return;
    // Parpadeo durante invencibilidad de reaparición
    if (this.invincible > 0 && Math.floor(this.invincible * 8) % 2 === 0) return;

    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.angle);
    ctx.strokeStyle = currentSkin().color;
    ctx.lineWidth   = 1.5;
    ctx.lineJoin    = 'round';

    // Silueta definida por el skin activo
    const skin = currentSkin();
    const tailX = Math.min(...skin.verts.map(v => v[0]));
    ctx.beginPath();
    ctx.moveTo(skin.verts[0][0], skin.verts[0][1]);
    for (let i = 1; i < skin.verts.length; i++)
      ctx.lineTo(skin.verts[i][0], skin.verts[i][1]);
    ctx.closePath();
    ctx.stroke();

    // Llama del propulsor (amarilla mientras dure el boost de velocidad),
    // anclada a la cola del polígono del skin
    if (this.thrusting && Math.random() > 0.35) {
      ctx.beginPath();
      ctx.moveTo(tailX, -4);
      ctx.lineTo(tailX - rand(6, 14), 0);
      ctx.lineTo(tailX,  4);
      ctx.strokeStyle = this.speedBoost > 0
        ? 'rgba(255, 212, 0, 0.9)'
        : skin.flame;
      ctx.stroke();
    }

    ctx.restore();

    // Anillo del escudo (no rota con la nave; pulso leve mientras dure)
    if (this.shield > 0) {
      const pulse = 1 + 0.05 * Math.sin(this.shield * 10);
      ctx.strokeStyle = 'rgba(0, 220, 255, 0.45)';
      ctx.lineWidth   = 2;
      ctx.beginPath();
      ctx.arc(this.x, this.y, (this.radius + SHIELD_EXTRA) * pulse, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
}

// ── Partículas (explosiones y estelas) ────────────────────────────────────────
// Las opciones son para las estelas/explosiones de fuego; sin ellas el
// comportamiento es el original (explosión blanca de asteroide).
class Particle {
  constructor(x, y, { color, life, speed, vx, vy } = {}) {
    this.x  = x;
    this.y  = y;
    if (vx === undefined) {
      const angle = rand(0, Math.PI * 2);
      const v     = speed ?? rand(30, 130);
      vx = Math.cos(angle) * v;
      vy = Math.sin(angle) * v;
    }
    this.vx   = vx;
    this.vy   = vy;
    this.life = life ?? rand(0.4, 1.1);
    this.ttl  = this.life;
    this.dead = false;
    // Componentes RGB ('255,130,0'); undefined = blanco original
    this.color = color;
  }

  update(dt) {
    this.x  += this.vx * dt;
    this.y  += this.vy * dt;
    this.ttl -= dt;
    if (this.ttl <= 0) this.dead = true;
  }

  draw() {
    const alpha = this.ttl / this.life;
    ctx.strokeStyle = `rgba(${this.color ?? '255,255,255'},${alpha.toFixed(2)})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(this.x, this.y);
    ctx.lineTo(this.x - this.vx * 0.05, this.y - this.vy * 0.05);
    ctx.stroke();
  }
}

// ── PowerUp ──────────────────────────────────────────────────────────────────
class PowerUp {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    // Efecto aleatorio al recogerlo: boost de velocidad, triple disparo o escudo
    const roll = Math.random();
    this.kind = roll < 1 / 3 ? 'speed' : roll < 2 / 3 ? 'triple' : 'shield';
    this.radius = 10;
    this.ttl  = POWERUP_TTL;
    this.dead = false;
  }

  update(dt) {
    this.ttl -= dt;
    if (this.ttl <= 0) this.dead = true;
  }

  // Chevron amarillo (velocidad), tres puntos cian (triple) o burbuja (escudo); parpadea antes de expirar
  draw() {
    if (this.ttl < 2 && Math.floor(this.ttl * 8) % 2 === 0) return;

    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    if (this.kind === 'shield') {
      // Anillo cian con arco interior, estilo burbuja de energía
      ctx.strokeStyle = '#00d8ff';
      ctx.lineWidth   = 2;
      ctx.beginPath();
      ctx.arc(0, 0, 8, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, 0, 4, -Math.PI * 0.75, Math.PI * 0.25);
      ctx.stroke();
    } else if (this.kind === 'speed') {
      // Doble chevron amarillo para el boost de velocidad
      ctx.strokeStyle = '#ffd400';
      ctx.lineWidth   = 2;
      for (const offset of [-5, 3]) {
        ctx.beginPath();
        ctx.moveTo(offset - 3, -6);
        ctx.lineTo(offset + 3, 0);
        ctx.lineTo(offset - 3, 6);
        ctx.stroke();
      }
    } else {
      ctx.fillStyle = '#00e5ff';
      for (const dx of [-6, 0, 6]) {
        ctx.beginPath();
        ctx.arc(dx, 0, 2.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }
}

// ── Estado del juego ──────────────────────────────────────────────────────────
let ship, bullets, asteroids, particles, powerups;
let score, lives, level;
let state;      // 'playing' | 'dead' | 'gameover'
let deadTimer;

function spawnAsteroids(count) {
  const SAFE_DIST = 130;
  // Desde el nivel 2 se garantiza al menos una estrella fugaz por nivel
  const guaranteed = level >= 2;
  for (let i = 0; i < count; i++) {
    let x, y;
    do {
      x = rand(0, W);
      y = rand(0, H);
    } while (Math.hypot(x - W / 2, y - H / 2) < SAFE_DIST);
    const type = (guaranteed && i === 0) || Math.random() < SHOOTING_CHANCE
      ? 'shooting' : 'normal';
    asteroids.push(new Asteroid(x, y, 3, type));
  }
}

function initGame() {
  ship          = new Ship();
  bullets   = [];
  asteroids = [];
  particles = [];
  powerups  = [];
  score  = 0;
  lives  = 3;
  level  = 1;
  state  = 'playing';
  spawnAsteroids(4);
}

function nextLevel() {
  level++;
  bullets   = [];
  particles = [];
  powerups  = [];
  ship.reset();
  spawnAsteroids(3 + level);
}

function explode(x, y, count = 8) {
  for (let i = 0; i < count; i++) particles.push(new Particle(x, y));
}

// Componentes RGB de la paleta fuego, con pesos 30/45/25
function fireColor() {
  const roll = rand(0, 100);
  if (roll < 30) return '255,242,214'; // blanco-amarillo
  if (roll < 75) return '255,150,50';  // naranja
  return '255,70,40';                  // rojo
}

// Explosión de fuego: más partículas y más rápidas, para la estrella fugaz
function explodeFire(x, y, count = 14) {
  for (let i = 0; i < count; i++)
    particles.push(new Particle(x, y, {
      color: fireColor(),
      life: rand(0.25, 0.7),
      speed: rand(60, 190),
    }));
}

function killShip() {
  explode(ship.x, ship.y, 14);
  ship.dead = true;
  lives--;
  if (lives <= 0) {
    state = 'gameover';
  } else {
    state     = 'dead';
    deadTimer = 2;
  }
}

// ── Update ────────────────────────────────────────────────────────────────────
function update(dt) {
  // Ciclar skin en cualquier estado (jugando, muerto o gameover)
  if (pressed('KeyV')) cycleSkin();

  if (state === 'gameover') {
    if (pressed('Space')) initGame();
    particles.forEach(p => p.update(dt));
    particles = particles.filter(p => !p.dead);
    return;
  }

  if (state === 'dead') {
    deadTimer -= dt;
    particles.forEach(p => p.update(dt));
    particles = particles.filter(p => !p.dead);
    asteroids.forEach(a => a.update(dt));
    if (deadTimer <= 0) { state = 'playing'; ship.reset(); }
    return;
  }

  // Disparar
  if (pressed('Space')) {
    bullets.push(...ship.tryShoot());
  }

  ship.update(dt);
  bullets.forEach(b => b.update(dt));
  asteroids.forEach(a => a.update(dt));
  particles.forEach(p => p.update(dt));
  powerups.forEach(u => u.update(dt));

  bullets   = bullets.filter(b => !b.dead);
  particles = particles.filter(p => !p.dead);
  powerups  = powerups.filter(u => !u.dead);

  // Nave vs power-up
  for (const u of powerups) {
    if (dist(ship, u) < ship.radius + u.radius) {
      u.dead = true;
      if (u.kind === 'triple') ship.tripleShot = TRIPLE_DURATION;
      else if (u.kind === 'shield') ship.shield = SHIELD_DURATION;
      else ship.speedBoost = BOOST_DURATION;
    }
  }

  // Bala vs asteroide
  const newAsteroids = [];
  for (const b of bullets) {
    for (const a of asteroids) {
      if (!a.dead && !b.dead && dist(b, a) < a.radius) {
        b.dead = true;
        a.dead = true;
        score += a.type === 'shooting' ? SHOOTING_POINTS : POINTS[a.size];
        if (a.type === 'shooting') explodeFire(a.x, a.y, 16);
        else explode(a.x, a.y, a.size * 5);
        newAsteroids.push(...a.split());
        if (Math.random() < POWERUP_DROP_CHANCE)
          powerups.push(new PowerUp(a.x, a.y));
      }
    }
  }
  asteroids = asteroids.filter(a => !a.dead).concat(newAsteroids);
  bullets   = bullets.filter(b => !b.dead);

  // Nave vs asteroide: el escudo absorbe el impacto y destruye el asteroide
  if (ship.invincible <= 0) {
    const hitRadius = ship.radius + (ship.shield > 0 ? SHIELD_EXTRA : 0);
    for (const a of asteroids) {
      if (dist(ship, a) < hitRadius + a.radius * 0.82) {
        // La estrella fugaz también se destruye en el impacto
        if (a.type === 'shooting') {
          a.dead = true;
          explodeFire(a.x, a.y, 12);
        }
        if (ship.shield > 0) {
          // Sin drop al destruirlo con el escudo: evita farmear escudos en cadena
          a.dead = true;
          explode(a.x, a.y, a.size * 5);
          score += a.type === 'shooting' ? SHOOTING_POINTS : POINTS[a.size];
          continue;
        }
        killShip();
        break;
      }
    }
  }
  asteroids = asteroids.filter(a => !a.dead);

  // Nivel completado
  if (asteroids.length === 0) nextLevel();
}

// ── Draw ──────────────────────────────────────────────────────────────────────
function drawLifeIcon(x, y) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(-Math.PI / 2);
  ctx.strokeStyle = currentSkin().color;
  ctx.lineWidth   = 1.2;
  ctx.lineJoin    = 'round';
  ctx.beginPath();
  ctx.moveTo( 9,  0);
  ctx.lineTo(-6, -5);
  ctx.lineTo(-3,  0);
  ctx.lineTo(-6,  5);
  ctx.closePath();
  ctx.stroke();
  ctx.restore();
}

function drawHUD() {
  ctx.fillStyle = '#fff';
  ctx.font = '15px monospace';

  ctx.textAlign = 'left';
  ctx.fillText(`SCORE  ${score}`, 14, 26);

  ctx.textAlign = 'center';
  ctx.fillText(`NIVEL ${level}`, W / 2, 26);

  for (let i = 0; i < lives; i++)
    drawLifeIcon(W - 16 - i * 22, 18);

  ctx.textAlign = 'left';
  ctx.font = 'bold 15px monospace';
  // Se apilan desde abajo para que no se solapen con varios power-ups activos
  let hudLine = 0;
  if (ship.speedBoost > 0) {
    ctx.fillStyle = '#ffd400';
    ctx.fillText(`VELOCIDAD ${ship.speedBoost.toFixed(1)}s`, 14, H - 16 - hudLine * 22);
    hudLine++;
  }
  if (ship.tripleShot > 0) {
    ctx.fillStyle = '#00e5ff';
    ctx.fillText(`TRIPLE ${ship.tripleShot.toFixed(1)}s`, 14, H - 16 - hudLine * 22);
    hudLine++;
  }
  if (ship.shield > 0) {
    ctx.fillStyle = '#00d8ff';
    ctx.fillText(`ESCUDO ${ship.shield.toFixed(1)}s`, 14, H - 16 - hudLine * 22);
    hudLine++;
  }

  ctx.textAlign  = 'right';
  ctx.fillStyle  = 'rgba(255,255,255,0.5)';
  ctx.font       = '13px monospace';
  ctx.fillText(`SKIN ${SKINS[skinIndex].name}  [V]`, W - 14, H - 16);
}

function drawOverlay(title, sub) {
  ctx.textAlign   = 'center';
  ctx.fillStyle   = '#fff';
  ctx.font        = 'bold 46px monospace';
  ctx.fillText(title, W / 2, H / 2 - 18);
  ctx.font        = '18px monospace';
  ctx.fillStyle   = 'rgba(255,255,255,0.65)';
  ctx.fillText(sub, W / 2, H / 2 + 22);
}

function draw() {
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, W, H);

  particles.forEach(p => p.draw());
  asteroids.forEach(a => a.draw());
  powerups.forEach(u => u.draw());
  bullets.forEach(b => b.draw());
  ship.draw();

  drawHUD();

  if (state === 'gameover')
    drawOverlay('GAME OVER', `PUNTAJE: ${score}   —   ESPACIO PARA REINICIAR`);
}

// ── Loop principal ────────────────────────────────────────────────────────────
let lastTime = null;

function loop(ts) {
  const dt = lastTime === null ? 0 : Math.min((ts - lastTime) / 1000, 0.05);
  lastTime = ts;
  update(dt);
  draw();
  requestAnimationFrame(loop);
}

loadSkin();
initGame();
requestAnimationFrame(loop);

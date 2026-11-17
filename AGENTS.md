# AGENTS.md — Asteroids

Juego Asteroids en HTML5 Canvas puro. Sin build, sin bundler, sin dependencias, sin tests.

## Estructura

- Todo el juego vive en `game.js` (~400 líneas): input, entidades (clases `Ship`, `Asteroid`, `Bullet`, `Particle`) y bucle principal. `index.html` solo contiene el `<canvas>` y lo carga con `<script>`.
- Canvas fijo de 800×600 definido por las constantes `W`/`H` al inicio de `game.js`. Cambiar el tamaño implica tocar esas constantes (el envolvimiento de bordes y el spawn dependen de ellas).
- No hay módulos ES ni imports: un solo scope global. Añadir código significa añadirlo a `game.js`.

## Verificación

- No hay lint, typecheck ni tests. La única verificación es manual: abrir `index.html` en el navegador, o `npx serve .` y visitar `http://localhost:3000`.
- El bucle (`loop`) usa `requestAnimationFrame` con `dt` acotado a 0.05 s. Al probar cambios de física, ojo con pestañas en segundo plano: `dt=0` en el primer frame.

## Convenciones

- Identificadores y strings de código en inglés; comentarios y textos de UI en español. Comentarios solo para explicar el "por qué".
- El código usa clases ligeras para entidades del juego (excepción aceptada al estilo general del proyecto).
- Los juegos se detectan con flags `dead` en las entidades, no con eliminación inmediata de arrays. Respetar ese patrón al añadir entidades.

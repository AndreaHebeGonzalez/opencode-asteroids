# Asteroids

Clon del clásico arcade **Asteroids** implementado en canvas HTML5 puro, sin dependencias ni bundler.

## Descripción

Nave espacial en un campo de asteroides con envolvimiento de bordes (el espacio es toroidal). Destruye asteroides para sumar puntos: los grandes se parten en medianos, los medianos en pequeños. Incluye power-ups especiales y tipos de asteroides únicos como la estrella fugaz.

## Tecnologías

- **HTML5 Canvas** — renderizado 2D
- **JavaScript (ES6+)** — lógica del juego en un solo archivo `game.js`
- Sin frameworks, sin bundler, sin dependencias

## Cómo correr

Abre `index.html` directamente en el navegador (doble clic), o usa un servidor local:

```bash
npx serve .
```

Luego visita `http://localhost:3000`.

## Controles

| Tecla     | Acción                          |
| --------- | ------------------------------- |
| `←` `→`   | Rotar nave / elegir nave        |
| `1` `2`   | Elegir nave en la pantalla inicial |
| `↑`       | Propulsar                       |
| `Espacio` | Disparar / empezar              |

## Naves

En la pantalla inicial puedes elegir entre dos naves:

| Nave    | Color   | Tamaño | Puntos |
| ------- | ------- | ------ | ------ |
| Clásica | Blanco  | 1×     | 1×     |
| Morada  | Morado  | 2×     | 2×     |

La nave morada es el doble de grande (y por tanto más fácil de impactar), pero duplica los puntos obtenidos al destruir asteroides.

## Puntuación

| Asteroide | Puntos |
| --------- | ------ |
| Grande    | 20     |
| Mediano   | 50     |
| Pequeño   | 100    |

## Características

- 3 vidas con invencibilidad temporal al reaparecer (parpadeo)
- Asteroides se parten en fragmentos más pequeños al ser destruidos
- Partículas de explosión al destruir asteroides

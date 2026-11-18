---
description: Crear un worktree de git en .worktrees/
---

Analiza el siguiente argumento y deriva de él un nombre válido para el worktree:
en minúsculas, reemplaza espacios y guiones bajos por guiones, elimina
caracteres especiales. 

$ARGUMENTS

Si el argumento anterior está vacío, pregunta al usuario el nombre del worktree
y espera su respuesta antes de hacer nada.

Luego ejecuta exactamente este comando, sustituyendo <name> por el nombre
derivado:

git worktree add .worktrees/<name>

No hagas nada más: no cambies de directorio, no hagas cd al worktree,
no ejecutes ningún comando adicional. Reporta unicamente el resultado del comando (stdout/stderr y código de salida).
Si el argumento es muy largo, simplifícalo a un nombre significativo.


# Context

## Propósito

Ensambla la memoria persistente del proyecto que se inyecta como system prompt: stack detectado,
los tres ficheros MD (`AGENTS.md`, `PLAN.md`, `TODO.md`) y las **skills de proyecto**.

## Ficheros

- `index.ts` — `ProjectContext` (singleton `projectContext`): detección de root, orquestación y
  `getSystemPrompt()`.
- `detector.ts` — detección de stack. `agents-md.ts`, `plan-md.ts`, `todo-md.ts`, `program-md.ts` —
  los managers de cada MD. `compactor.ts` — auto-compactación.
- `skills.ts` — `SkillsManager`: descubrimiento, índice y carga de skills portables.

## Presupuesto de contexto (la restricción que gobierna este módulo)

`getSystemPrompt()` **trunca cada MD a 4000 caracteres**. No es un detalle: un `AGENTS.md` de
15 KB solo llegaba al modelo en un 26%, y su parte final —donde estaban las reglas de trabajo—
no se inyectaba nunca. Al editar cualquiera de estos ficheros, comprueba que cabe:

```
bun -e 'console.log(require("fs").readFileSync("AGENTS.md","utf-8").length)'
```

## Skills (`skills.ts`)

Descubre `<proyecto>/.agents/skills/<nombre>/SKILL.md` y `~/.agents/skills/<nombre>/SKILL.md`.
Formato portable (compatible con Claude Code / OpenCode / OpenChamber): frontmatter con `name` y
`description`; el resto es el cuerpo. Clave opcional `triggers` para acotar la auto-carga.

Tres vías de consumo, por diseño:

1. **Índice** — `buildSkillsIndex()` mete una línea por skill en el system prompt. Vacío si el
   proyecto no tiene skills, así que quien no las use no paga nada.
2. **Auto-carga determinista** — `buildAutoLoadContext(prompt)` inyecta entera la skill que casa
   con la petición, como mensaje de sistema previo al turno del usuario. Existe porque wabisabi es
   local-first: un modelo pequeño (llama3.2) puede no invocar nunca una tool, y la skill no puede
   depender de que el modelo sea listo.
3. **Tool `skill`** — carga bajo demanda cualquier otra (progressive disclosure).

### Reglas de matching

- Se comparan **tokens**, no substrings. Dos tokens casan si son iguales o si uno es prefijo del
  otro con **≥4 caracteres** comunes: cubre inflexión dentro de un idioma (`tool`/`tools`,
  `permiso`/`permisos`) sin que `api` case con `apisonadora`.
- **No se infieren sinónimos entre idiomas.** Una skill con descripción en inglés no casa con una
  petición en español: para eso está `triggers`, donde se declaran ambos idiomas. Las skills de
  este repo los llevan.
- Hacen falta **≥2 triggers distintos** para disparar: una palabra genérica suelta no arrastra una
  skill entera al contexto.
- Se carga **como mucho una** skill por turno, y no se reinyecta si es la misma del turno anterior.

### Invariantes

- **Una skill malformada nunca bloquea a las demás**: se ignora, se registra un aviso
  (`getWarnings()`, visible en `/skills`) y el resto se cargan.
- **Proyecto tapa a usuario** cuando comparten nombre.
- Contrato del nombre alineado con `skills-forge`: minúsculas y guiones, ≤64 caracteres.
- Límites duros: `SKILL.md` > 32 KB se ignora; el cuerpo inyectado se recorta a 6000 caracteres.
- `userSkillsDir` es **inyectable** por constructor: los tests nunca deben leer el `~` real.

## Al añadir un manager de contexto nuevo

Todo lo que entre en `getSystemPrompt()` compite por la ventana. Declara su tope de tamaño, haz
que devuelva cadena vacía cuando no aplica, y no lo hagas depender de que exista el proyecto.

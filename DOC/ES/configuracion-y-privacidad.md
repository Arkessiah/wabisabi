# Configuración, autenticación y privacidad

> Extraído de `AGENTS.md` el 2026-08-11. Todo lo que decide **con qué credenciales**,
> **contra qué endpoint** y **con cuánta exposición** corre WabiSabi.

## Configuración global: `~/.wabisabi/config.jsonc`

JSONC (admite comentarios) para poder anotar los hosts. Lo crea el asistente de onboarding.

```jsonc
{
  "model": "llama3.2",
  "substratum": "http://localhost:3001",
  "ollama": "http://localhost:11434",
  "apiKey": "...",           // o env WABISABI_API_KEY
  "privacy": "hybrid",
  "defaultAgent": "build",
  "temperature": 0.7,
  "maxTokens": 4096,
  "streaming": true,
  "tools": {
    "allowFileRead": true,
    "allowFileWrite": false,
    "allowBash": false
  },
  "profile": {               // Persiste sombreros/perfiles
    "hat": "black",
    "profile": "security",
    "style": "formal"
  }
}
```

Forma extendida con estrategia de proveedor y nodos de cluster:

```jsonc
{
  "providerStrategy": "hybrid-local-first",
  "model": "llama3.2",
  "providers": {
    "ollama": {
      "enabled": true,
      "url": "http://localhost:11434",
      "nodes": []   // cluster opcional de nodos Ollama
    },
    "substratum": {
      "enabled": true,
      "url": "http://localhost:8080",  // o el gateway de producción
      "apiKey": ""                     // vacío cuando se usa login JWT
    }
  }
}
```

## Configuración por proyecto: `.wabisabi/config.jsonc`

Mismos campos; se mergea con la global y **gana el proyecto**.

VS Code lee del mismo fichero y permite sobrescribir desde los settings
(`wabisabi.substratumUrl`, `wabisabi.ollamaUrl`, etc.).

## Autenticación

### Estrategias (en orden)

1. **JWT Bearer** — tokens en `~/.wabisabi/auth.json`, cifrado **AES-256-GCM**.
2. **OAuth Device Code** — flujo interactivo de login (substratum / github).
3. **API Key fallback** — desde `WABISABI_API_KEY` o `SUBSTRATUM_API_KEY`.

### Comandos

```bash
wabisabi login substratum    # OAuth device-code flow
wabisabi login github        # GitHub OAuth
wabisabi logout              # Eliminar credenciales
```

### Sesión compartida CLI ↔ VS Code

El CLI es el **dueño** de `~/.wabisabi/auth.json`. La extensión de VS Code lee el mismo
fichero y replica el orden de descifrado (OS Keychain → fallback derivado de la máquina),
de modo que **se firma una vez y ambas superficies quedan autenticadas**.
Invariantes en `packages/auth/src/DOCUMENTATION.md`.

## Niveles de privacidad

| Nivel | Red | Modelos | Skills | Telemetría |
|-------|-----|---------|--------|------------|
| `LOCAL_ONLY` | Deshabilitada | Solo Ollama | Solo locales | Deshabilitada |
| `HYBRID` (default) | Solo Substratum | Local + fallback | Local + aprobados | Anónima |
| `SEMI_REMOTE` | Substratum + APIs | Local + Substratum + cloud | Local + compartidos | Stats de uso |
| `FULL_REMOTE` | Sin restricción | Cualquiera | Cualquiera | Completa |

El nivel se consulta con `wabisabi privacy --show` y se gestiona con `wabisabi privacy`.
El `PrivacyManager` es **autoridad de ejecución, no un aviso**: un nivel más restrictivo
debe impedir la llamada, no solo advertir en la UI.

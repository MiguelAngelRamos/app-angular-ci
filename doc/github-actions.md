# GitHub Actions — Guía estructural

> Documento de referencia: qué es GitHub Actions, qué carpetas y archivos
> necesita, cómo se nombran y qué representa cada uno. Pensado para entender
> la "anatomía" de un proyecto que usa CI/CD en GitHub.

---

## 1. Qué es GitHub Actions

**GitHub Actions** es la plataforma de **CI/CD** (Integración Continua / Entrega
Continua) integrada en GitHub. Permite ejecutar **flujos de trabajo automatizados**
(workflows) en respuesta a eventos del repositorio: un push, una pull request,
la creación de un tag, un cron programado, un trigger manual, etc.

Cada workflow corre en una **máquina virtual efímera** (Ubuntu, Windows o macOS)
proporcionada por GitHub — llamada **runner** — y ejecuta una serie de pasos
declarados en un fichero YAML. Cuando termina, la máquina se destruye.

### ¿Para qué se usa típicamente?

| Categoría        | Ejemplos prácticos                                          |
| ---------------- | ----------------------------------------------------------- |
| Build & tests    | Compilar, type-check, ejecutar suites de tests unitarios    |
| Calidad de código| Linters (ESLint, Hadolint), formateadores, análisis de cobertura |
| Seguridad        | SAST (CodeQL), SCA (`pnpm audit`), escaneo de imágenes (Scout/Trivy) |
| Empaquetado      | Build de imágenes Docker, generación de SBOM, firma con Cosign |
| Publicación      | Push a registros (GHCR, npm, PyPI), deploy a entornos       |
| Notificaciones   | Mensajes a Slack/Discord, comentarios en PRs                |

### Conceptos clave

| Término       | Qué es                                                                 |
| ------------- | ---------------------------------------------------------------------- |
| **Workflow**  | Fichero YAML que define un proceso automatizado completo.              |
| **Event**     | Trigger que dispara el workflow (`push`, `pull_request`, `schedule`…). |
| **Job**       | Conjunto de pasos que corren en el mismo runner. Por defecto en paralelo con otros jobs. |
| **Step**      | Acción individual dentro de un job (ejecutar un comando o usar una action). |
| **Action**    | Componente reutilizable (publicado en el Marketplace) que se invoca con `uses:`. |
| **Runner**    | Máquina virtual (o auto-hospedada) donde se ejecuta el job.            |
| **Artifact**  | Fichero(s) que un job sube para ser descargado por otros jobs o por el usuario. |
| **Secret**    | Variable cifrada (tokens, credenciales) accesible vía `${{ secrets.X }}`. |
| **GITHUB_TOKEN** | Token efímero generado automáticamente para cada run.               |

---

## 2. Estructura de carpetas que GitHub espera

GitHub Actions detecta automáticamente los ficheros si están en las rutas
correctas. **La convención es estricta**: si renombras una carpeta o un nivel,
GitHub deja de reconocerlos.

```
<repo-root>/
└── .github/                          ← carpeta especial reconocida por GitHub
    ├── workflows/                    ← OBLIGATORIA — aquí van los workflows
    │   ├── ci.yml
    │   ├── release.yml
    │   └── nightly.yml
    │
    ├── actions/                      ← Opcional — actions compuestas propias
    │   └── setup-project/
    │       └── action.yml            ← cada action tiene su propio action.yml
    │
    ├── ISSUE_TEMPLATE/               ← Opcional — plantillas de issues
    │   ├── bug_report.md
    │   └── feature_request.md
    │
    ├── PULL_REQUEST_TEMPLATE.md      ← Opcional — plantilla de PR
    ├── CODEOWNERS                    ← Opcional — owners por path
    └── dependabot.yml                ← Opcional — config de Dependabot
```

### Reglas clave

- La carpeta `.github/` vive **siempre en la raíz del repositorio**. No se anida.
- Solo los ficheros dentro de `.github/workflows/` se interpretan como workflows.
- El nombre del fichero (`ci.yml`, `release.yml`…) **es libre**, pero la
  extensión debe ser `.yml` o `.yaml`.
- Se pueden tener tantos workflows como se quiera; cada uno corre independientemente.

---

## 3. Anatomía de un fichero workflow

Un workflow es un YAML con tres bloques principales: **nombre**, **disparadores**
y **jobs**. A continuación, un esqueleto comentado:

```yaml
# ── Nombre legible que aparece en la pestaña "Actions" del repo ─────────────
name: CI

# ── Eventos que disparan el workflow ────────────────────────────────────────
on:
  push:
    branches: [main]
  pull_request:
    branches: [main]
  workflow_dispatch:          # permite lanzarlo a mano desde la UI

# ── Permisos del GITHUB_TOKEN (principio de menor privilegio) ───────────────
permissions:
  contents: read              # por defecto: solo lectura del repo

# ── Concurrencia: cancela runs viejos del mismo branch/PR ───────────────────
concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: true

# ── Variables compartidas ───────────────────────────────────────────────────
env:
  NODE_VERSION: '22'

# ── Jobs (corren en paralelo salvo que declares `needs:`) ───────────────────
jobs:

  build:
    name: Build & test            # nombre legible en la UI
    runs-on: ubuntu-latest        # tipo de runner
    timeout-minutes: 10           # corta runs colgados

    # Permisos específicos del job (se suman al default del workflow)
    permissions:
      contents: read

    steps:
      # Cada step es UN comando o UNA action
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}

      - name: Install deps
        run: npm ci

      - name: Run tests
        run: npm test
```

### Propiedades importantes que aparecen en jobs/steps

| Clave              | Dónde         | Qué hace                                                              |
| ------------------ | ------------- | --------------------------------------------------------------------- |
| `runs-on`          | job           | Tipo de runner (`ubuntu-latest`, `windows-latest`, `macos-latest`).   |
| `needs`            | job           | Lista de jobs que deben completarse antes (gate secuencial).          |
| `if`               | job/step      | Condicional. Ej: `if: github.event_name != 'pull_request'`.           |
| `permissions`      | workflow/job  | Permisos del `GITHUB_TOKEN`. Más restrictivo gana.                    |
| `timeout-minutes`  | job/step      | Mata el job si excede el tiempo. Evita runs zombi.                    |
| `uses`             | step          | Invoca una action de terceros o local (`owner/repo@version`).         |
| `run`              | step          | Ejecuta un comando shell directamente.                                |
| `with`             | step          | Inputs que recibe una action declarada con `uses:`.                   |
| `env`              | workflow/job/step | Variables de entorno disponibles en ese scope.                    |
| `outputs`          | job/step      | Valores que el job/step expone a otros jobs/steps.                    |

---

## 4. Ficheros y nombres "especiales" en `.github/`

Estos archivos GitHub los **lee por convención** — si están en otro sitio, no surten efecto.

### 4.1 `.github/workflows/*.yml`

Los workflows propiamente dichos. Pueden llamarse como quieras
(`ci.yml`, `deploy-prod.yml`, `nightly-security-scan.yml`).

Nombre del fichero ≠ nombre que aparece en la UI: lo que se muestra es el campo
`name:` definido dentro del propio YAML.

### 4.2 `.github/actions/<nombre>/action.yml`

Para crear **actions compuestas** propias (reutilizables dentro del repo).
Cada action vive en su propia subcarpeta y el manifiesto se llama **siempre
`action.yml`** (o `action.yaml`). Ejemplo de uso:

```yaml
- uses: ./.github/actions/setup-project
```

### 4.3 `.github/dependabot.yml`

Configuración de Dependabot — el bot oficial de GitHub que crea PRs
automáticos para actualizar dependencias. El nombre del archivo es **fijo**.

```yaml
version: 2
updates:
  - package-ecosystem: 'npm'
    directory: '/'
    schedule:
      interval: 'weekly'
```

### 4.4 `.github/CODEOWNERS`

Define qué usuarios/equipos son **revisores obligatorios** por path. GitHub
los añade automáticamente como reviewers en cada PR que toca esos paths.

```
# Reglas tipo .gitignore: por path → @owner
*.ts          @frontend-team
/.github/     @devops-team
src/auth/     @security-team
```

### 4.5 `.github/PULL_REQUEST_TEMPLATE.md`

Plantilla por defecto que GitHub precarga en el cuerpo de cada PR nueva.

### 4.6 `.github/ISSUE_TEMPLATE/<nombre>.md` (o `.yml`)

Carpeta con una o varias plantillas para crear issues. La UI muestra un selector
si hay más de una.

### 4.7 `.github/FUNDING.yml`

Banner de "Sponsor this project" en la página principal del repo (opcional).

### 4.8 `.github/SECURITY.md`

Política de divulgación responsable. GitHub la muestra en la pestaña "Security".

---

## 5. Cómo se referencian las acciones (`uses:`)

```yaml
- uses: actions/checkout@v4          # action oficial de GitHub
- uses: pnpm/action-setup@v4         # action de terceros publicada en Marketplace
- uses: ./.github/actions/my-action  # action local en este repo
- uses: my-org/my-repo/.github/actions/x@v1   # action en otro repo
```

La parte después de `@` es la **referencia git** que se va a usar: puede ser
un tag (`@v4`), una rama (`@main`) o un commit SHA (`@a1b2c3d…`).
En producción se recomienda fijar versiones por **SHA** o tags inmutables
para no quedar a merced de cambios silenciosos.

---

## 6. Dónde se ven los resultados

- Pestaña **Actions** del repo → historial de runs, logs por step, artefactos.
- Pestaña **Security** → resultados de SAST (CodeQL), SCA, SBOMs subidos como SARIF.
- Sección **Insights → Actions** → métricas de duración, tasa de éxito, coste.
- En cada **PR** → checks marcados con ✓/✗ con link directo al log del job.

---

## 7. Ejemplo concreto: este repositorio

```
angular-secure/
└── .github/
    └── workflows/
        └── ci.yml     ← un solo workflow con 5 jobs (quality, audit, codeql, hadolint, image)
```

Ver [ci-cd.md](./ci-cd.md) para el desglose funcional del pipeline real.

---

## 8. Buenas prácticas mínimas

1. **Declara `permissions:` explícitamente** — por defecto, restringe a
   `contents: read` y eleva por job solo lo necesario.
2. **Usa `concurrency:`** — cancela runs obsoletos cuando llega un nuevo push.
3. **Pon `timeout-minutes`** en cada job — evita runners colgados consumiendo minutos.
4. **Fija versiones** — `actions/checkout@v4` mejor que `@main`.
5. **No imprimas secretos** — GitHub enmascara, pero un `echo` con codificación
   distinta los puede filtrar al log.
6. **Separa lo que se ejecuta en PR vs main** — con `if: github.event_name != 'pull_request'`
   evitas, por ejemplo, publicar imágenes desde PRs.
7. **Cachea dependencias** — `actions/setup-node` y `pnpm/action-setup` tienen cache integrada.

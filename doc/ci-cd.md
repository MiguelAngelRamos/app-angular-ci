# Pipeline CI/CD — Angular Secure

Documentación funcional del workflow [`.github/workflows/ci.yml`](../.github/workflows/ci.yml).

Este pipeline construye, audita, escanea, firma y publica la imagen Docker de la aplicación Angular en cada push a `main` y en cada pull request.

---

## Visión general

```
┌──────────┐   ┌──────────┐   ┌──────────┐   ┌──────────┐
│ quality  │   │  audit   │   │  codeql  │   │ hadolint │
│ (tests)  │   │  (SCA)   │   │  (SAST)  │   │ (Docker) │
└────┬─────┘   └────┬─────┘   └────┬─────┘   └────┬─────┘
     │              │              │              │
     └──────────────┴──────┬───────┴──────────────┘
                           ▼
                  ┌──────────────────┐
                  │      image       │
                  │  build + SBOM +  │
                  │  scan + sign +   │
                  │  push a GHCR     │
                  └──────────────────┘
```

Los 4 jobs superiores corren **en paralelo**. El job `image` solo arranca si los anteriores pasan (gate de calidad y seguridad).

---

## Disparadores

| Evento | Comportamiento |
|---|---|
| `push` a `main` | Pipeline completo + **publicación** de la imagen a GHCR |
| `pull_request` a `main` | Pipeline completo, **sin publicación** (solo build local para escanear) |
| `workflow_dispatch` | Lanzamiento manual desde la UI de Actions |

## Optimizaciones globales

- **Concurrencia**: si llega un push nuevo al mismo branch/PR, el run anterior se cancela (`cancel-in-progress: true`). Ahorra minutos y evita resultados obsoletos.
- **Permisos por defecto**: el `GITHUB_TOKEN` solo tiene `contents: read`. Cada job escala permisos explícitamente (principio de menor privilegio).
- **Cache de pnpm**: invalidación automática cuando cambia `pnpm-lock.yaml`.

---

## Jobs

### 1. `quality` — Tests y type-check

**Objetivo:** garantizar que el código compila, pasa los tipos y los tests antes de cualquier otra cosa.

| Paso | Qué hace |
|---|---|
| `pnpm install --frozen-lockfile` | Instala dependencias exactas del lockfile (build reproducible). Falla si el lockfile necesita cambios. |
| `tsc --noEmit` | Type-check estricto sin emitir JS. |
| `pnpm test` | Tests unitarios con vitest (vía `@angular/build:unit-test` de Angular 21). |
| `ng build --configuration=production` | Build de producción. |
| `upload-artifact` | Sube el `dist/` como artifact (retención 7 días) para auditoría. |

**Por qué `--frozen-lockfile`:** garantiza que CI y local resuelven exactamente el mismo grafo de dependencias. Sin esto, una resolución diferente en CI puede ocultar bugs que solo aparecen en producción.

---

### 2. `audit` — SCA con `pnpm audit`

**Objetivo:** detectar vulnerabilidades conocidas en dependencias npm **antes** del merge.

```bash
pnpm audit --prod --audit-level=high
```

- `--prod`: solo dependencias de producción (las devDependencies no van a la imagen).
- `--audit-level=high`: el job falla si hay vulns **high** o **critical**. Las moderate/low se reportan pero no bloquean.

**Diferencia con Dependabot:**
- Dependabot es **reactivo y asíncrono** (abre PRs de upgrade).
- `pnpm audit` en CI es un **gate síncrono** que bloquea el merge.
- Los dos usan la misma base de datos (GitHub Advisory DB) pero en momentos distintos. Es defensa en profundidad intencional. Ver [`security-layers.md`](./security-layers.md) si existe, o el bloque "Capas de seguridad" más abajo.

---

### 3. `codeql` — SAST

**Objetivo:** análisis estático del código fuente para detectar vulnerabilidades de lógica (XSS, prototype pollution, deserialización insegura, etc.).

```yaml
languages: javascript-typescript
queries: security-and-quality
```

- Motor unificado de GitHub: analiza TS y JS juntos.
- Suite `security-and-quality`: reglas de seguridad **+** problemas de calidad/maintainability.
- Los hallazgos aparecen en la pestaña **Security → Code scanning alerts** del repo.

**Permisos especiales:** `security-events: write` para poder subir alertas.

**Coste:**
- **Repo público** → gratis.
- **Repo privado** → requiere GitHub Advanced Security (de pago). Si tu repo es privado en plan Free, este job fallará.

---

### 4. `hadolint` — Lint del Dockerfile

**Objetivo:** detectar antipatrones en el `Dockerfile` antes de que se conviertan en problemas de seguridad o eficiencia.

Ejemplos de lo que captura:
- Imágenes base con tag `latest` (no reproducible).
- Procesos corriendo como `root`.
- `apt-get install` sin `--no-install-recommends` (imágenes infladas).
- Múltiples `RUN` consolidables (capas innecesarias).

**Configuración:**
- `failure-threshold: error` → solo bloquea ante errores graves, los warnings se reportan.
- `format: sarif` + `upload-sarif` → los hallazgos van al panel **Security** del repo.

---

### 5. `image` — Build, SBOM, scan, firma y push

**Objetivo:** producir un artefacto Docker auditado y firmado criptográficamente.

Este job solo arranca si los anteriores pasan (`needs: [quality, audit, codeql, hadolint]`).

#### 5.1 Login a GHCR

Solo en push a `main` (no en PRs). Usa `GITHUB_TOKEN` con permiso `packages: write`.

#### 5.2 Metadata de tags

Tags automáticos generados por `docker/metadata-action`:

| Patrón | Ejemplo |
|---|---|
| `sha-<short>` | `sha-abc1234` |
| `<branch>` | `main` |
| `latest` | solo en branch por defecto |
| `pr-<n>` | solo en pull requests |

#### 5.3 Build con Buildx

- BuildKit moderno con cache de capas en GitHub Actions (`cache-from/to=gha`).
- **En PR**: `load: true, push: false` → la imagen se carga local para escanear pero no se publica.
- **En main**: `push: true` → publicación a GHCR.
- `provenance: mode=max` + `sbom: true` → BuildKit adjunta attestations OCI.

#### 5.4 SBOM con Syft

```yaml
- uses: anchore/sbom-action@v0
  with:
    format: cyclonedx-json
    output-file: sbom.cdx.json
```

Genera un SBOM CycloneDX completo escaneando la **imagen** (no el filesystem). Captura:
- Paquetes npm.
- Paquetes del SO base (nginx, alpine, musl libc, openssl, etc.).
- Versiones, licencias, hashes.

Se sube como artifact con **90 días de retención** para auditoría.

#### 5.5 Docker Scout — escaneo de CVEs

```yaml
command: cves
only-severities: critical,high
exit-code: true
```

Escanea la imagen contra bases públicas de CVEs. **Falla el job** si encuentra vulnerabilidades critical o high (cambiar a `exit-code: false` para modo "report-only" al inicio).

Los resultados se suben en formato SARIF al panel Security.

**Por qué Docker Scout y no Trivy:** ambos sirven. Scout viene con integración nativa de Docker y mejor UX para imágenes Docker; Trivy es más popular en ecosistemas Kubernetes. Intercambiables.

#### 5.6 Firma con Cosign keyless

```bash
cosign sign --yes "$IMAGE_REF"
```

- **Keyless**: usa el OIDC token de GitHub Actions como identidad. **No hay que gestionar claves privadas.**
- La firma queda en el **transparency log público de Sigstore** (Rekor).
- Verificable desde cualquier máquina:

```bash
cosign verify ghcr.io/<owner>/<repo>:latest \
  --certificate-identity-regexp 'https://github.com/<owner>/<repo>/.github/workflows/ci.yml@.*' \
  --certificate-oidc-issuer https://token.actions.githubusercontent.com
```

#### 5.7 Attestation del SBOM

```bash
cosign attest --predicate sbom.cdx.json --type cyclonedx "$IMAGE_REF"
```

Adjunta el SBOM CycloneDX a la imagen **firmado criptográficamente**. Cualquiera puede descargarlo y verificar su autenticidad:

```bash
cosign download attestation ghcr.io/<owner>/<repo>:latest
```

---

## Capas de seguridad

Esta es la razón de tener varios escaneos que aparentemente se solapan:

| Capa | Herramienta | Qué cubre |
|---|---|---|
| Dependencias npm declaradas | `pnpm audit` (CI) + Dependabot (background) | Vulns en `pnpm-lock.yaml` |
| Código fuente propio | CodeQL | XSS, inyecciones, lógica insegura |
| Dockerfile | Hadolint | Antipatrones de imagen |
| Sistema operativo de la imagen | Docker Scout | nginx, alpine, libc, openssl del base image |
| Inventario auditable | SBOM (Syft, CycloneDX) | Qué hay realmente dentro del artefacto |
| Autenticidad del artefacto | Cosign keyless | Garantía criptográfica de procedencia |

Cada capa cubre algo que las otras **no** ven. Ejemplo concreto: si `nginx:1.27-alpine` tiene un CVE crítico, **Dependabot no lo detecta** (no es npm), pero **Docker Scout sí**.

---

## Resultado del pipeline

Tras un push exitoso a `main` obtienes:

1. **Imagen Docker** en GHCR: `ghcr.io/<owner>/<repo>:latest` y `:sha-<short>`.
2. **SBOM CycloneDX** como artifact del run (`sbom-cyclonedx-<sha>`).
3. **Build de Angular** como artifact (`angular-dist`, 7 días).
4. **Firma Cosign** registrada en Sigstore Rekor.
5. **SBOM attestation** adjunto a la imagen.
6. **Alertas de seguridad** (si las hay) en la pestaña Security del repo (CodeQL, Hadolint, Scout).

---

## Verificación local de la imagen publicada

```bash
# 1. Pull
docker pull ghcr.io/<owner>/<repo>:latest

# 2. Verificar firma
cosign verify ghcr.io/<owner>/<repo>:latest \
  --certificate-identity-regexp 'https://github.com/<owner>/<repo>/.github/workflows/ci.yml@.*' \
  --certificate-oidc-issuer https://token.actions.githubusercontent.com

# 3. Descargar y verificar SBOM
cosign download attestation ghcr.io/<owner>/<repo>:latest \
  | jq -r '.payload' | base64 -d | jq '.predicate'
```

---

## Coste estimado en GitHub plan Free

| Recurso | Repo público | Repo privado |
|---|---|---|
| Minutos de runner | Ilimitados | 2.000 min/mes |
| CodeQL | Gratis | Requiere GHAS (de pago) |
| SARIF uploads | Gratis | Requiere GHAS |
| GHCR | Ilimitado | 500 MB storage + 1 GB transfer/mes |
| Sigstore / Cosign | Gratis | Gratis |
| Docker Scout | Gratis (3 repos free tier) | Igual |

**Duración aproximada por run completo:** 8-12 minutos en `ubuntu-latest`.

---

## Mejoras futuras

- **Dependabot** (`.github/dependabot.yml`): automatizar PRs de upgrade para npm, GitHub Actions y la imagen base del Dockerfile.
- **Matriz de Node** en el job `quality`: probar contra varias versiones LTS.
- **Despliegue automático** post-publicación (Cloud Run, ECS, Kubernetes, etc.) en un job adicional con `needs: [image]`.
- **Política de retención** de imágenes en GHCR (mantener últimas N por branch).

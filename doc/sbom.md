# SBOM — Software Bill of Materials

> Guía pedagógica: qué es un SBOM, por qué se ha vuelto obligatorio en muchos
> sectores, qué formatos existen y cómo encaja en este proyecto.

---

## 1. La idea en una analogía

Imagina que compras una tarta en una pastelería. Cuando le das un mordisco no
sabes si lleva gluten, lactosa, frutos secos o un colorante en concreto.
Para saberlo, miras la **etiqueta de ingredientes** del paquete.

Un **SBOM** (Software Bill of Materials, "lista de materiales de software")
es exactamente eso: la **etiqueta de ingredientes de tu software**. Un
documento que enumera, de forma exhaustiva y verificable, **todos los componentes
que viven dentro** de un artefacto de software:

- Las librerías y sus versiones exactas (`@angular/core@21.0.0`, `rxjs@7.8.2`…).
- Los paquetes del sistema operativo de la imagen Docker (`nginx`, `musl-libc`…).
- Las licencias de cada uno (MIT, Apache-2.0, GPL-3.0…).
- A veces incluso los **hashes** que permiten comprobar que no han sido manipulados.

Sin SBOM, tu software es como esa tarta sin etiqueta: nadie sabe qué hay dentro.

---

## 2. Por qué importa: el caso Log4Shell (Dic 2021)

En diciembre de 2021 se publicó la vulnerabilidad **Log4Shell** (CVE-2021-44228)
en `log4j-core`, una librería Java embebida en prácticamente todo el ecosistema
empresarial. La pregunta que las empresas tuvieron que responder, **en cuestión
de horas**, fue:

> "¿Tengo `log4j-core` en alguna parte? ¿En qué versión? ¿En qué servicios?"

Las que tenían un **SBOM actualizado** por cada artefacto, contestaron rápido.
Las que no, pasaron días — o semanas — auditando builds antiguos y
preguntando a proveedores. Algunas siguen sin saberlo del todo.

Este incidente fue el detonante de muchas regulaciones que mencionaremos abajo.

---

## 3. Qué resuelve un SBOM (los cuatro usos canónicos)

### 3.1 Respuesta a vulnerabilidades

Cuando aparece una nueva CVE, cruzas la base de datos de CVEs contra todos los
SBOMs de tus artefactos y obtienes en segundos la lista de imágenes/servicios
afectados. Esto es **incident response** automatizable.

### 3.2 Cumplimiento legal y regulatorio

Cada vez más normativas exigen SBOM:

| Norma / orden                           | Donde                  | Qué exige                                   |
| --------------------------------------- | ---------------------- | ------------------------------------------- |
| **Executive Order 14028**                | EEUU (2021)            | SBOM en software vendido al gobierno federal. |
| **EU Cyber Resilience Act (CRA)**        | UE (2024–2027)         | SBOM obligatorio para productos digitales con conexión a red. |
| **FDA premarket guidance**               | EEUU — dispositivos médicos | SBOM como parte del expediente de aprobación. |
| **ISO/IEC 5230 (OpenChain)**             | Internacional          | SBOM como parte del cumplimiento de licencias open source. |

Si tu producto entra en el ámbito de la **CRA europea**, vender sin SBOM se
convertirá en sancionable.

### 3.3 Auditoría de licencias

Algunas licencias open source (GPL, AGPL, LGPL…) imponen obligaciones
contractuales. Un SBOM enumera todas las licencias presentes, lo que permite a
legal/compliance detectar incompatibilidades **antes** de publicar.

### 3.4 Cadena de suministro de software

El SBOM es el bloque básico de la **supply chain security**. Combinado con
firmas criptográficas (Sigstore/Cosign), permite responder a:

- "¿Esta imagen es realmente la que mi pipeline produjo?"
- "¿Qué pipelines la produjeron y qué SBOM le adjuntaron?"
- "¿Algún componente fue añadido entre el build y el deploy?"

---

## 4. Qué contiene exactamente un SBOM

Tomemos un fragmento real (CycloneDX) de una dependencia npm:

```json
{
  "type": "library",
  "bom-ref": "pkg:npm/rxjs@7.8.2",
  "name": "rxjs",
  "version": "7.8.2",
  "purl": "pkg:npm/rxjs@7.8.2",
  "licenses": [{ "license": { "id": "Apache-2.0" } }],
  "hashes": [
    { "alg": "SHA-256", "content": "a1b2c3d4e5f6…" }
  ]
}
```

Las piezas importantes:

- **`name` + `version`**: identifica el paquete sin ambigüedad.
- **`purl` (Package URL)**: identificador universal (`pkg:npm/rxjs@7.8.2`)
  que sirve para cruzar con bases de CVEs sin importar el ecosistema (npm,
  PyPI, Maven, Debian, Alpine…).
- **`licenses`**: a efectos legales.
- **`hashes`**: prueba criptográfica de qué bits exactos forman el paquete.

Un SBOM completo agrupa **cientos** de estos bloques — tu propio código y, **transitivamente**, las dependencias de tus dependencias.

---

## 5. Formatos estándar

Existen dos formatos dominantes. Son intercambiables: las herramientas
modernas convierten entre ellos sin perder información.

### 5.1 CycloneDX

- Mantenido por **OWASP**.
- Diseñado pensando en **seguridad** (incluye campos para vulnerabilidades,
  servicios, datos sensibles).
- Es lo que se usa en este proyecto.

Ejemplo de cabecera CycloneDX:

```json
{
  "bomFormat": "CycloneDX",
  "specVersion": "1.5",
  "serialNumber": "urn:uuid:…",
  "version": 1,
  "metadata": { "timestamp": "2026-05-14T…", "tools": [{ "name": "syft" }] },
  "components": [ /* … */ ]
}
```

### 5.2 SPDX

- Mantenido por la **Linux Foundation**.
- Diseñado pensando en **licencias** (su origen es la auditoría legal).
- El más usado en proyectos comunitarios (kernel Linux, etc.).

Para la mayoría de propósitos prácticos, **escoge uno y conviértelo si te lo piden**.

---

## 6. Cómo se genera un SBOM

Las herramientas escanean el artefacto (filesystem, imagen Docker, repositorio)
y producen el documento. Las más usadas:

| Herramienta     | Qué escanea                              | Salida              |
| --------------- | ---------------------------------------- | ------------------- |
| **Syft**        | Imágenes Docker, filesystems, archivos.  | CycloneDX, SPDX     |
| **Trivy**       | Imágenes Docker (también hace CVE scan). | CycloneDX, SPDX     |
| **CycloneDX CLI** | Proyectos por ecosistema (npm, maven…). | CycloneDX           |
| **BuildKit**    | Lo adjunta automáticamente al build de Docker. | SPDX (básico) |
| **GitHub**      | Genera SBOM del repo desde la pestaña Insights. | SPDX          |

En este proyecto el SBOM lo genera **Syft** (vía `anchore/sbom-action`) en
el job `image` del pipeline — ver línea con `Generate SBOM (CycloneDX)` en
[`.github/workflows/ci.yml`](../.github/workflows/ci.yml).

---

## 7. Cómo encaja en este repositorio

```
┌─────────────────────────────────────────────────────────────┐
│  Pipeline CI (.github/workflows/ci.yml — job "image")       │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│   1. Build Docker image                                     │
│   2. Syft → sbom.cdx.json  (CycloneDX completo de la imagen)│
│   3. Cosign sign image      (firma keyless de la imagen)    │
│   4. Cosign attest SBOM     (adjunta el SBOM a la imagen    │
│                              como attestation firmada)      │
│   5. Push imagen a GHCR     (con SBOM ya unido)             │
│   6. Upload SBOM como artifact (retención 90 días)          │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

Resultado: **cada imagen publicada en `ghcr.io/<owner>/angular-secure`
lleva su SBOM firmado adherido**. Cualquier consumidor puede recuperarlo:

```bash
cosign download attestation ghcr.io/<owner>/angular-secure:latest
```

Y verificar que la firma corresponde al pipeline legítimo:

```bash
cosign verify ghcr.io/<owner>/angular-secure:latest \
  --certificate-identity-regexp "https://github.com/<owner>/angular-secure" \
  --certificate-oidc-issuer "https://token.actions.githubusercontent.com"
```

---

## 8. SBOM ≠ escaneo de vulnerabilidades

Es un error común confundirlos:

| Documento                | Qué dice                                                |
| ------------------------ | ------------------------------------------------------- |
| **SBOM**                 | "Estos son los componentes y versiones que llevo."      |
| **Reporte de CVEs**      | "Estos componentes tienen vulnerabilidades conocidas hoy." |

El SBOM es **estático** (la composición no cambia hasta que rehagas el build).
El reporte de CVEs **cambia continuamente** (cada día aparecen CVEs nuevas
contra componentes ya existentes).

Por eso, un buen pipeline produce **ambos**: el SBOM se guarda con el artefacto
para siempre, y el reporte de CVEs se regenera periódicamente cruzando ese
SBOM contra una base de datos de vulnerabilidades actualizada (NVD, GitHub Advisory
Database, OSV…). Esto se llama **escaneo continuo post-deploy**.

---

## 9. Resumen mental

> Un SBOM es la **factura de componentes** de tu software.
> Sin SBOM no puedes responder a "¿estoy afectado por X CVE?" en tiempo razonable.
> Con SBOM firmado y adherido a la imagen, además, puedes demostrar **qué**
> compilaste y **quién** lo compiló.

En este proyecto el SBOM no es decorativo: es la base sobre la que se construye
toda la cadena de confianza del artefacto Docker que sale a producción.

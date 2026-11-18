# HPB (Horizontal Product Branch): artículo de metodología

Este directorio contiene el artículo

> *Horizontal Product Branch (HPB): A Practitioner's Methodology for Planning and
> Tracing Product Evolution across Hardware, Firmware and Software*
>
> Achraf Bouchtarouif El Khiat · achrafbouchtarouif@gmail.com
>
> Preprint, versión 1.0, noviembre de 2026 · DOI
> [10.5281/zenodo.24355435](https://doi.org/10.5281/zenodo.24355435) · CC BY 4.0

- **Repositorio:** <https://github.com/AchrafBr1/hpb> (este directorio es `paper/`).
- **PDF archivado:** [`HPB-v1.0.pdf`](HPB-v1.0.pdf) es **exactamente** el PDF
  publicado en Zenodo con el DOI anterior. No lo regeneres ni lo sustituyas: es
  la versión 1.0 citable.
- **Fuentes LaTeX:** `main.tex`, `sections/`, `figures/`, `hpb.sty`,
  `references.bib`. Desde la 1.0 incluyen ya la URL del repositorio
  (`\hpbrepourl`), así que **las fuentes van una edición por delante del PDF
  archivado**: lo que compiles hoy es la base de la próxima versión (v1.1).

Es un artículo de metodología escrito desde la práctica: más de siete años como
senior product manager de productos completos (hardware, firmware y software).
Propone un método (siete reglas R1–R7), una notación estándar, una guía
operativa, métricas, el lenguaje de texto **HPB Markup** con su renderizador de
código abierto y un prototipo dentro de un portal de gestión de producto.
**No presenta resultados empíricos**: todos los ejemplos (Product A, DMS-4000,
versiones, fechas) son ilustrativos y ficticios.

La versión corta y normativa del método está en
[`../methodology/HPB-Guide.md`](../methodology/HPB-Guide.md).

---

## 1. Contenido del directorio

| Ruta | Qué es |
|------|--------|
| `HPB-v1.0.pdf` | PDF de la versión 1.0, idéntico al archivado en Zenodo. |
| `main.tex` | Documento principal: preámbulo, título, autor, fecha con versión y DOI, resumen, palabras clave, `\input` de secciones y apéndices, bibliografía. Define `\hpbrepourl` (ya con la URL del repositorio). |
| `hpb.sty` | Paquete LaTeX/TikZ con la notación HPB (MIT). Fuente única de estilo de todos los diagramas. |
| `references.bib` | Bibliografía (BibTeX, `plainnat` con `natbib`). Solo obras reales y verificables. |
| `sections/00-abstract.tex` | Resumen. |
| `sections/01-introduction.tex` | 1 Introducción: las preguntas que no podía responder, qué es HPB. |
| `sections/02-gaps.tex` | 2 Dónde se quedan cortos los métodos actuales + tabla comparativa. |
| `sections/03-hpb-in-one-page.tex` | 3 HPB en una página: idea, figura de anatomía, reglas R1–R7 y la definición normativa de **HPB 1.0** (licencias). |
| `sections/04-model.tex` | 4 El modelo en lenguaje llano. |
| `sections/05-notation.tex` | 5 La notación estándar (carriles, glifos, reglas de maquetación L1–L10). |
| `sections/06-practice.tex` | 6 Nueve situaciones canónicas con figura. |
| `sections/07-operating.tex` | 7 Guía operativa: prácticas, cadencia, roles, convivencia con Scrum/Kanban/Stage-Gate/PLM, adopción "empieza el lunes", anti-patrones. |
| `sections/08-metrics.tex` | 8 Métricas (tabla práctica; las fórmulas están en el Apéndice A.7). |
| `sections/09-tooling.tex` | 9 HPB Markup, paquetes (`@hpb/core`, `@hpb/web`, `@hpb/react`, `@hpb/cli`, `remark-hpb`) y prototipo en el portal. |
| `sections/10-limitations.tex` | 10 Limitaciones y cómo evaluar HPB en tu organización. |
| `sections/11-conclusion.tex` | 11 Conclusión e invitación a adoptar y contribuir. |
| `sections/12-about-author.tex` | Sobre el autor (sin número). |
| `sections/appendix-a-formal.tex` | Apéndice A: modelo formal (definiciones, reglas, propiedades), definiciones de métricas, algoritmo de maquetación y modelo de datos/estado del prototipo. |
| `sections/appendix-a-card.tex` | Apéndice B: tarjeta de referencia rápida de la notación. |
| `sections/appendix-c-markup.tex` | Apéndice C: referencia del lenguaje HPB Markup (sentencias, diagnósticos, gramática). |
| `sections/appendix-b-package.tex` | Apéndice D: cómo usar `hpb.sty`. |
| `figures/*.tex` | Figuras en TikZ puro (sin imágenes externas). |

Los nombres de fichero de los apéndices no coinciden con su letra (por
historia del proyecto); el orden real lo fija `main.tex`: A formal, B tarjeta,
C Markup, D paquete.

Convenciones internas si editas el texto:

- Entornos: `definition`, `hpbrule` (reglas R1–R7; **no existe** un entorno
  `rule` porque `\rule` es un comando de LaTeX), `property` (P1–P4) y `remark`.
- Las reglas se definen **una sola vez**, en `appendix-a-formal.tex`
  (etiquetas `rule:origin`, `rule:closure`, `rule:time`, `rule:gate`,
  `rule:lineage`, `rule:typed`, `rule:discussion`). R3 se llama siempre
  *Time moves forward*.
- Referencias con `\cref{...}`; citas con `\citep{...}` / `\citet{...}`.
- Fuentes en ASCII puro (compatibles con pdfLaTeX).

---

## 2. Compilar en Overleaf

1. Crea un zip **solo con las fuentes** de este directorio, con `main.tex` en
   la raíz del zip: `main.tex`, `hpb.sty`, `references.bib`, `sections/` y
   `figures/` (sin `HPB-v1.0.pdf` ni este README). Por ejemplo, desde la raíz
   del repositorio:

   ```sh
   cd paper && zip -r ../hpb-paper-overleaf.zip main.tex hpb.sty references.bib sections figures
   ```

   También puedes vincular el repositorio de GitHub desde Overleaf
   (**New Project → Import from GitHub**) y fijar `paper/main.tex` como
   documento principal.
2. En [Overleaf](https://www.overleaf.com/): **New Project → Upload Project** y
   selecciona el zip.
3. En **Menu** comprueba:
   - **Compiler:** `pdfLaTeX`
   - **TeX Live version:** 2023 o posterior
   - **Main document:** `main.tex`
4. Pulsa **Recompile**. BibTeX se ejecuta automáticamente.

No necesita `shell-escape`, `fontspec`, `minted` ni imágenes externas.

---

## 3. Autor, repositorio, DOI y paquetes

- El bloque de autor **ya está puesto**: nombre y correo, **sin afiliación**
  (también en `pdfauthor`). No hay que tocarlo.
- **Repositorio:** `\hpbrepourl` en `main.tex` ya vale
  `https://github.com/AchrafBr1/hpb`, la misma URL que `repository`,
  `homepage` y `bugs` de cada `package.json`. No hay nada que rellenar.
- **Fecha y DOI:** la fecha es fija (`November 2026`) y va acompañada de
  "Preprint, version 1.0" y del DOI de Zenodo. Al preparar una nueva versión,
  cambia ambos (ver §5).
- **Paquetes npm:** el artículo usa los nombres `@hpb/core`, `@hpb/web`,
  `@hpb/react`, `@hpb/cli` y `remark-hpb`, que **aún no están publicados**.
  Antes de publicarlos, comprueba que el scope `@hpb` está libre en npm y es
  tuyo; si no, renombra los paquetes y actualiza la tabla de paquetes
  (`sections/09-tooling.tex`, `tab:packages`) y los ejemplos de código. Cuando
  estén publicados, cambia en `09-tooling.tex` "will be published at" por
  "is published at" en la siguiente versión.
- La viñeta de la introducción ("When the gap became obvious") es un
  **compuesto** sin datos reales. Hay un comentario `% AUTHOR:` encima: si tienes
  una historia real y anonimizada, sustitúyela (4–6 frases, sin datos
  confidenciales).

---

## 4. Licencias

- Texto del método, artículo y notación: **CC BY 4.0** (lo declara la Sección 3,
  "HPB 1.0", y [`../LICENSE-CC-BY-4.0.md`](../LICENSE-CC-BY-4.0.md)). Usa
  también CC BY 4.0 en Zenodo y en arXiv.
- `hpb.sty` y el toolkit HPB Markup: **MIT** ([`../LICENSE`](../LICENSE)).

---

## 5. Nueva versión en Zenodo (v1.1 y siguientes)

La 1.0 ya está archivada. **No edites ese registro**: crea una versión nueva
para que el DOI 10.5281/zenodo.24355435 siga apuntando a la 1.0 y el *concept
DOI* de Zenodo agrupe todas las versiones.

1. En `main.tex`, actualiza la fecha y la línea de versión (por ejemplo
   `Preprint, version 1.1`). El DOI nuevo lo asigna Zenodo: puedes
   **reservarlo** antes de subir (casilla *Reserve DOI* en el formulario) y
   ponerlo en `\date{...}` antes de compilar.
2. Compila en Overleaf y descarga el PDF como `HPB-v1.1.pdf`. Añádelo junto a
   `HPB-v1.0.pdf` (no lo sustituyas).
3. En Zenodo, abre el registro de la 1.0 y pulsa **New version**. Sube el PDF
   nuevo, quita el fichero antiguo de esa versión, cambia *Version* (1.1),
   fecha de publicación y, si quieres, las notas de cambios. Mantén el tipo
   *Publication → Preprint* y la licencia CC BY 4.0. Añade como *related
   work* el repositorio `https://github.com/AchrafBr1/hpb` (*is supplemented
   by*).
4. Publica y actualiza en el repositorio: `README.md` (sección *Read the
   paper* y *How to cite*), `CITATION.cff` (`preferred-citation`: `doi`,
   `version`, `month`) y `methodology/HPB-Guide.md` si cambia lo normativo.

El toolkit se archiva aparte: el fichero `../.zenodo.json` sirve para la
integración GitHub → Zenodo (cada *release* de GitHub crea una versión del
software con su propio DOI, enlazada al artículo con `isSupplementTo`). Hay que
activarla una vez en Zenodo: **Account → GitHub → activar `AchrafBr1/hpb`**.

---

## 6. Enviar a arXiv

**Categoría principal:** `cs.SE` (Software Engineering).

Envía la versión que tenga la URL del repositorio (las fuentes actuales, v1.1),
no un PDF suelto: arXiv compila desde las fuentes. En el formulario de arXiv
puedes indicar el DOI de Zenodo en el campo **DOI** o en **Comments**
(por ejemplo "Preprint also archived at https://doi.org/10.5281/zenodo.24355435").

### Opción A: desde Overleaf (recomendada)

1. Con el proyecto compilando sin errores, pulsa **Submit** y elige **arXiv**.
2. Overleaf prepara el paquete con las fuentes **y el `main.bbl`** ya generado
   (arXiv no ejecuta BibTeX).
3. Completa el envío en arXiv: metadatos, `cs.SE`, licencia CC BY 4.0, resumen
   (texto de `sections/00-abstract.tex` sin comandos LaTeX) y vista previa del
   PDF.

### Opción B: manual

1. En Overleaf: **Menu → Download → Source**. Asegúrate de que el zip incluye
   `main.bbl`; si no, descárgalo desde **Logs and output files → Other logs and
   files** y añádelo junto a `main.tex`.
2. En arXiv: **Start New Submission**, sube el zip, elige `cs.SE` y la licencia,
   y revisa el PDF generado antes de confirmar.

### Aval (*endorsement*)

Si es tu primer envío a `cs.SE`, arXiv puede pedirte el aval de un autor ya
establecido en esa categoría. Gestiónalo con antelación.

> Una versión de arXiv no se puede borrar una vez anunciada. Cuando tengas el
> identificador de arXiv, añádelo a `README.md`, a `CITATION.cff`
> (`identifiers`) y como *related identifier* en Zenodo.

---

## 7. Reutilizar `hpb.sty` en otros documentos

1. Copia `hpb.sty` junto a tu documento.
2. En el preámbulo: `\usepackage{hpb}` (carga TikZ y lo necesario).
3. Dibuja con `hpbgraph` y las macros del Apéndice D. Ejemplo mínimo:

   ```latex
   \begin{hpbgraph}
     \hpblane{1}{imp}{Improvement}{0}{8}
     \hpblane{-1}{iss}{Issue}{0}{8}
     \hpbmainline{0}{8}
     \hpborigin{0}{Product A}
     \hpbrelease{2}{v1.0}
     \hpbrelease{6}{v1.1}
     \hpbbranch[label={I-1 Ejemplo}]{imp}{2}{1}{3}{5}{merge}{6}
   \end{hpbgraph}
   ```

Para que todos los diagramas usen el mismo lienzo (regla L1), fija una vez en
el preámbulo: `\hpbset{col=0.75cm, lane=1cm, legend=1.7cm}`.

Para páginas web, wikis, React/Next.js/Vite, Markdown o la línea de comandos,
usa HPB Markup (Sección 9 y Apéndice C, y [`../docs/language.md`](../docs/language.md))
en lugar de dibujar a mano.

---

## 8. Checklist antes de una nueva versión (Zenodo o arXiv)

- [ ] Fecha, número de versión y DOI actualizados en `main.tex`.
- [ ] Paquetes npm publicados con los nombres del artículo, o artículo
      actualizado a los nombres publicados ("will be published" → "is published").
- [ ] Viñeta de la introducción revisada (compuesto o historia real anonimizada).
- [ ] Compila en Overleaf con **pdfLaTeX** y TeX Live 2023+ **sin errores**.
- [ ] Sin `??` en el PDF; sin avisos `undefined` en los logs.
- [ ] Figuras legibles en **escala de grises**.
- [ ] Ejemplos marcados como **ilustrativos**; sin datos ni citas inventadas.
- [ ] Solo se citan entradas de `references.bib`; DOIs y URLs revisados.
- [ ] Resumen (texto plano) igual a `sections/00-abstract.tex`
      (límite de arXiv: 1920 caracteres).
- [ ] Para arXiv: el paquete incluye `main.bbl` y `hpb.sty`, y **no** incluye
      `.aux`, `.log`, `.synctex.gz` ni PDFs.
- [ ] Licencia CC BY 4.0 (y categoría `cs.SE` en arXiv).
- [ ] `HPB-v1.0.pdf` intacto; el PDF nuevo se añade con su propio nombre.
- [ ] `README.md` y `CITATION.cff` del repositorio actualizados con el DOI nuevo.

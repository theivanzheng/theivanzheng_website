# theivanzheng.com

Web personal de Iván Zheng. Sitio estático de HTML, CSS y JavaScript, sin frameworks
ni build, desplegado en Vercel desde la rama `main`.

## Cómo se sirven las URLs

`vercel.json` solo activa `cleanUrls`. **No hay rewrites**: cada página se sirve por el
nombre de su fichero, así que `TestParaSoltar.html` responde en `/TestParaSoltar` y la
home la resuelve `index.html`.

Si añades una página, nómbrala igual que la URL que quieres. Los rewrites de
`vercel.json` no llegaban a aplicarse y eso tumbó la home una vez.

## Páginas

| Fichero | URL | Qué es |
|---|---|---|
| `index.html` | `/` | Home |
| `proyectos.html` | `/proyectos` | Proyectos |
| `productos.html` | `/productos` | Índice de productos digitales |
| `ElArteDeDejarIr.html` | `/ElArteDeDejarIr` | Página de venta del libro |
| `TestParaSoltar.html` | `/TestParaSoltar` | Cuestionario que lleva al libro |
| `yapping-101.html` | `/yapping-101` | Landing y aplicación del curso Yapping 101 |
| `contacto.html` | `/contacto` | Contacto |
| `aviso-legal.html`, `politica-privacidad.html`, `politica-cookies.html` | | Legales |

## Contenidos en JSON

El texto de las páginas nuevas vive fuera del HTML, en `textos/`:

- `textos/quiz-para-soltar.json` — el cuestionario entero: preguntas, resultados,
  etiquetas de interfaz y bloque de compra.
- `textos/valoraciones-arte-dejar-ir.json` — testimonios del libro, reproducidos
  literalmente tal y como los escribieron sus autores.

Se editan y se recarga la página; no hay que tocar el HTML.

## Funciones serverless

En `api/`, desplegadas por Vercel:

- `api/precio.js` — lee el precio del libro del JSON-LD de la ficha de Payhip, para no
  mantenerlo a mano en cada página. Cacheado una hora en el edge, con un valor de
  respaldo escrito en el HTML por si Payhip no responde.
- `api/[...all].js` + `backend/` — formulario de contacto (Express, Supabase, Resend):
  te envía el mensaje por email.

## Kit

No se usa la API de Kit (el plan gratuito no la incluye). Todo se da de alta desde el
navegador contra formularios públicos de Kit, que envían su propio email de
confirmación y llevan su enlace de baja:

- Newsletter de la home y formularios de contacto → formulario `9395152`. En contacto,
  primero se envía el mensaje y después se apunta a la persona.
- Lista de espera de `/yapping-101` → el formulario cuyo ID está en
  `textos/yapping-101.json` (`kitFormId`). Manda también los campos personalizados
  `seguidores`, `nicho` y `contenido_semanal`, que tienen que existir en Kit.

En `textos/yapping-101.json` también se configuran la URL de Payhip (`payhipUrl`) y las
capturas de los stacks de fotos (`capturasVideos`, `comentarios`).

## Desarrollo local

```bash
python3 -m http.server 8000
```

Abrir `http://localhost:8000/`.

Ojo: ese servidor no ejecuta las funciones de `api/`, así que `/api/precio` da 404 y las
páginas muestran el precio de respaldo. Es el comportamiento esperado.

## Documentación

- [CLAUDE.md](CLAUDE.md) — reglas de código y sistema de diseño.
- [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md) — componentes, tipografía e integraciones.
- [backend/README.md](backend/README.md) — backend de contacto.

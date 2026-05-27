# theivanzheng.com / REVON.es

Este repositorio tiene ahora dos líneas de trabajo:

1. La web original estática de `theivanzheng.com`.
2. La migración paralela a WordPress para la entrega académica de `REVON.es`.

La línea WordPress no sustituye la web original. Vive en una rama y estructura paralela para poder adaptar el diseño actual a un tema WordPress sin romper la versión HTML existente.

## Estado actual

- Web original: HTML/CSS/JS estático.
- Migración WordPress: tema propio en [wordpress-theme/revon](/Users/administrador/Documents/Online Ivan/REVON/theivanzheng.com/wordpress-theme/revon:1).
- Documentación de la migración: [README WordPress.md](/Users/administrador/Documents/Online Ivan/REVON/theivanzheng.com/README%20WordPress.md:1).

## Estructura principal

```text
theivanzheng.com/
├── theivanzheng.html
├── index.html
├── productos.html
├── proyectos.html
├── Resources/
├── api/
├── backend/
├── docs/
├── wordpress-theme/
│   └── revon/
├── DESIGN_SYSTEM.md
├── CLAUDE.md
├── README.md
└── README WordPress.md
```

## Desarrollo local de la web original

```bash
python3 -m http.server 8000
```

Abrir en `http://localhost:8000/theivanzheng.html`.

## Documentación relacionada

- [README WordPress.md](/Users/administrador/Documents/Online Ivan/REVON/theivanzheng.com/README%20WordPress.md:1): proceso y estado de la migración a WordPress.
- [wordpress-theme/revon/README.md](/Users/administrador/Documents/Online Ivan/REVON/theivanzheng.com/wordpress-theme/revon/README.md:1): instrucciones del tema WordPress.
- [backend/README.md](/Users/administrador/Documents/Online Ivan/REVON/theivanzheng.com/backend/README.md:1): backend de newsletter/contacto.
- [docs/wordpress-migracion-revon.md](/Users/administrador/Documents/Online Ivan/REVON/theivanzheng.com/docs/wordpress-migracion-revon.md:1): notas de arquitectura y entrega.

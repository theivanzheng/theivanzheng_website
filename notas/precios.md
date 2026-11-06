# Subida de tarifas — pendiente de aplicar

Decidido el 6 de noviembre de 2026. **Todavía no está en la web**: `ugc.html`
sigue con las tarifas viejas. Esto es el guion de lo que hay que cambiar
cuando se dé el visto bueno.

## Por qué

Las tarifas actuales son de nivel intermedio y el trabajo ya no lo es:

- 10 piezas entregadas para Ironhack, que opera en España, Portugal,
  Países Bajos y Alemania. Se ha producido para tres de esos mercados.
- El encargo empezó en 2 vídeos y acabó siendo muchos más. Un cliente que
  amplía está diciendo que buscar a otro le sale más caro.
- Se graba en español y en inglés. Para una misma marca eso es un proveedor
  en lugar de tres.
- Fondo de ingeniería de software, que es el argumento entero de la página.

El problema concreto: el Vídeo UGC está a 300 € para piezas de 15–60 s. Las
cinco piezas de la página duran entre 38 y 52 segundos, o sea que el trabajo
real cae en el tramo de 30–60 s, donde 300 € queda por debajo de la media del
intermedio. Se está cobrando un vídeo de 50 segundos como si fuera de 20.

| Tramo  | Intermedio | Avanzado  | Ahora |
|--------|-----------|-----------|-------|
| 15–30s | 200-300 € | 350-600 € | 300 € |
| 30–60s | 250-400 € | 450-750 € | 300 € |

(La tabla de referencia la aportó Iván; no está verificada su procedencia.)

## Qué cambiar en `ugc.html`

Banda **baja** del avanzado, no el techo:

| Concepto                      | Ahora | Nuevo     |
|-------------------------------|-------|-----------|
| Vídeo UGC                     | 300 € | **450 €** |
| Pack UGC (3 vídeos)           | 800 € | **1.200 €** |
| Hook adicional                | +50 € | **+100 €** |
| CTA adicional                 | +50 € | **+100 €** |
| Revisión adicional            | +50 € | **+100 €** |
| Vídeo patrocinado en mis redes| 900 € | sin cambio |

El vídeo patrocinado no se toca: su precio depende de la audiencia, no del
nivel como creador, y 900 € con más de 200k seguidores es coherente.

El pack mantiene el mismo descuento por volumen que tenía: 3 × 450 = 1.350 €,
y 1.200 € son un 11 % menos, igual que antes (3 × 300 = 900 frente a 800).

### Detalles de implementación

1. Los precios están en `.plan__price`, duplicados en el atributo
   `data-en-html` de cada uno. Hay que cambiar las dos versiones, con el
   separador de miles de cada idioma: `1.200 €` en español, `1,200 €` en inglés.
2. Los extras están en los tres `.rate__val` de la columna «Extras».
3. La respuesta de preguntas frecuentes sobre revisiones dice «son 50 € cada
   una» (y `€50 each` en inglés). También hay que subirla a 100 €.
4. **El orden de las tarjetas se rompe.** El comentario de la sección dice
   «Orden ascendente por precio: 300 -> 800 -> 900» y con los precios nuevos
   la secuencia pasa a ser 450 -> 900 -> 1.200, así que el Pack UGC tiene que
   moverse detrás del vídeo patrocinado y hay que actualizar el comentario.

## Antes de publicarlo

Ironhack ya está pagando la tarifa vieja. Subir los precios en la web no
cambia lo pactado con ellos, se aplica al siguiente acuerdo, pero conviene
decírselo antes de que lo vean en la página.

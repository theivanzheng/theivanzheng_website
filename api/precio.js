// Lee el precio directamente de la ficha pública de Payhip para no tener que
// mantenerlo también a mano en el HTML. Payhip no manda cabeceras CORS, así que
// esto tiene que hacerse desde servidor y no desde el navegador.
//
// La ficha publica un bloque JSON-LD de schema.org con la oferta:
//   { "offers": { "price": "15.99", "priceCurrency": "EUR" } }
// Ese es el dato que leemos; los <meta og:price:*> son menos fiables porque la
// moneda viene como entidad HTML (&#8364;) en vez de código ISO.

const PRODUCTOS = {
  "el-arte-de-dejar-ir": "2U0hf"
};

const POR_DEFECTO = "el-arte-de-dejar-ir";

// Si Payhip no responde, se sirve esto para que la página nunca quede sin precio.
// Ojo: desde que Payhip puso Cloudflare delante de las fichas, la lectura falla
// con 403 y este valor es, en la práctica, el que ve todo el mundo.
const RESPALDO = { precio: "19,99€", importe: 19.99, moneda: "EUR", fuente: "respaldo" };

// Ofertas con fecha de caducidad. Mientras una esté viva manda sobre todo lo
// demás; pasada la fecha se cae sola y se vuelve al precio normal sin tener que
// desplegar nada.
//
// IMPORTANTE: esto solo cambia lo que se MUESTRA. Lo que se cobra lo decide
// Payhip, así que el precio de allí tiene que coincidir con el de aquí durante
// toda la ventana.
const OFERTAS = {
  "el-arte-de-dejar-ir": {
    importe: 9.99,
    // Precio tachado. Se escribe aquí y no se deduce del respaldo para que
    // cambiar uno no altere el otro sin querer.
    antes: 19.99,
    moneda: "EUR",
    // 48 h desde el 29/09/2026 a las 10:43 (hora peninsular).
    desde: "2026-09-29T08:43:00Z",
    hasta: "2026-10-01T08:43:00Z"
  }
};

const ofertaViva = (clave) => {
  const oferta = OFERTAS[clave];
  if (!oferta) return null;
  const ahora = Date.now();
  if (ahora < Date.parse(oferta.desde) || ahora >= Date.parse(oferta.hasta)) return null;
  return oferta;
};

const SIMBOLOS = { EUR: "€", USD: "$", GBP: "£" };

const formatear = (importe, moneda) => {
  const simbolo = SIMBOLOS[moneda] || (moneda + " ");
  return importe.toFixed(2).replace(".", ",") + simbolo;
};

const extraerOferta = (html) => {
  const bloques = html.match(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi) || [];

  for (const bloque of bloques) {
    const crudo = bloque.replace(/^[\s\S]*?>/, "").replace(/<\/script>$/i, "");
    let datos;
    try {
      datos = JSON.parse(crudo.trim());
    } catch (error) {
      continue;
    }
    const oferta = datos && datos.offers;
    if (!oferta || oferta.price === undefined) continue;

    const importe = Number(oferta.price);
    if (!Number.isFinite(importe)) continue;

    return { importe: importe, moneda: oferta.priceCurrency || "EUR" };
  }
  return null;
};

module.exports = async (req, res) => {
  const clave = (req.query && req.query.producto) || POR_DEFECTO;
  const id = PRODUCTOS[clave];

  if (!id) {
    res.setHeader("Cache-Control", "no-store");
    res.status(404).json({ error: "Producto desconocido: " + clave });
    return;
  }

  // Una oferta viva corta por lo sano: ni se consulta Payhip.
  const oferta = ofertaViva(clave);
  if (oferta) {
    // El caché no puede sobrevivir al final de la oferta o el edge seguiría
    // sirviendo el precio rebajado después de que caduque.
    const quedan = Math.max(0, Math.floor((Date.parse(oferta.hasta) - Date.now()) / 1000));
    res.setHeader("Cache-Control", "public, s-maxage=" + Math.min(300, quedan));
    res.status(200).json({
      precio: formatear(oferta.importe, oferta.moneda),
      importe: oferta.importe,
      precioAntes: formatear(oferta.antes, oferta.moneda),
      importeAntes: oferta.antes,
      descuento: Math.round((1 - oferta.importe / oferta.antes) * 100),
      moneda: oferta.moneda,
      fuente: "oferta",
      hasta: oferta.hasta,
      // Segundos que quedan, por si el reloj del visitante va descuadrado.
      quedan: quedan
    });
    return;
  }

  // Cacheado en el edge: Payhip recibe como mucho una petición por hora.
  res.setHeader("Cache-Control", "public, s-maxage=3600, stale-while-revalidate=86400");

  try {
    const respuesta = await fetch("https://payhip.com/b/" + id, {
      headers: { "User-Agent": "theivanzheng.com (sincronizacion de precio)" },
      signal: AbortSignal.timeout(6000)
    });

    if (!respuesta.ok) throw new Error("Payhip respondió " + respuesta.status);

    const oferta = extraerOferta(await respuesta.text());
    if (!oferta) throw new Error("No se encontró la oferta en la ficha");

    res.status(200).json({
      precio: formatear(oferta.importe, oferta.moneda),
      importe: oferta.importe,
      moneda: oferta.moneda,
      fuente: "payhip"
    });
  } catch (error) {
    res.status(200).json(Object.assign({}, RESPALDO, { aviso: error.message }));
  }
};

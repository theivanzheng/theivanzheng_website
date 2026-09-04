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
const RESPALDO = { precio: "19,99€", importe: 19.99, moneda: "EUR", fuente: "respaldo" };

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
  // Cacheado en el edge: Payhip recibe como mucho una petición por hora.
  res.setHeader("Cache-Control", "public, s-maxage=3600, stale-while-revalidate=86400");

  const clave = (req.query && req.query.producto) || POR_DEFECTO;
  const id = PRODUCTOS[clave];

  if (!id) {
    res.status(404).json({ error: "Producto desconocido: " + clave });
    return;
  }

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

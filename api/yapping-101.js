// Recibe las aplicaciones de /yapping-101 y las da de alta en Kit con la
// etiqueta "Yapping 101". Va por servidor porque el formulario público de Kit
// no permite etiquetar ni rellenar campos personalizados sin automatizaciones
// de pago; la API v4 sí, pero necesita una clave que no puede ir al navegador.
//
// Variables de entorno (Vercel → Settings → Environment Variables):
//   KIT_API_KEY          obligatoria. Kit → Settings → Developer → API Keys (v4).
//   KIT_YAPPING_TAG_ID   opcional. Si falta, se busca o crea la etiqueta por nombre.

const KIT_API = "https://api.kit.com/v4";
const NOMBRE_ETIQUETA = "Yapping 101";

// Campos personalizados de Kit que se rellenan. Si no existen, se crean.
const CAMPOS = {
  seguidores: "Seguidores",
  nicho: "Nicho",
  compromiso: "Contenido semanal"
};

const SEGUIDORES_VALIDOS = ["0-1k", "1k-5k", "5k-10k", "10k+"];
const COMPROMISO_VALIDO = ["si", "no"];
const emailRegex = /^[A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,}$/i;

const texto = (valor, max) => String(valor || "").trim().slice(0, max);

const kit = async (ruta, opciones = {}) => {
  const respuesta = await fetch(KIT_API + ruta, {
    method: opciones.method || "GET",
    headers: {
      "Content-Type": "application/json",
      "X-Kit-Api-Key": process.env.KIT_API_KEY
    },
    body: opciones.body ? JSON.stringify(opciones.body) : undefined,
    signal: AbortSignal.timeout(8000)
  });
  const datos = await respuesta.json().catch(() => ({}));
  if (!respuesta.ok) {
    const detalle = (datos.errors || []).join(", ") || respuesta.status;
    throw new Error("Kit " + ruta + ": " + detalle);
  }
  return datos;
};

// Se guardan entre invocaciones mientras la función siga caliente.
let clavesCampos = null;
let idEtiqueta = process.env.KIT_YAPPING_TAG_ID || null;

const obtenerClavesCampos = async () => {
  if (clavesCampos) return clavesCampos;

  const { custom_fields: existentes = [] } = await kit("/custom_fields?per_page=1000");
  const claves = {};

  for (const [id, etiqueta] of Object.entries(CAMPOS)) {
    let campo = existentes.find((c) => c.label.toLowerCase() === etiqueta.toLowerCase());
    if (!campo) {
      ({ custom_field: campo } = await kit("/custom_fields", { method: "POST", body: { label: etiqueta } }));
    }
    claves[id] = campo.key;
  }

  clavesCampos = claves;
  return claves;
};

const obtenerIdEtiqueta = async () => {
  if (idEtiqueta) return idEtiqueta;
  // Kit devuelve la etiqueta existente si ya hay una con ese nombre.
  const { tag } = await kit("/tags", { method: "POST", body: { name: NOMBRE_ETIQUETA } });
  idEtiqueta = tag.id;
  return idEtiqueta;
};

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    res.status(405).json({ error: "Método no permitido." });
    return;
  }

  if (!process.env.KIT_API_KEY) {
    console.error("Falta KIT_API_KEY");
    res.status(500).json({ error: "El formulario no está disponible ahora mismo. Inténtalo más tarde." });
    return;
  }

  const body = req.body || {};

  // Honeypot: los humanos no ven este campo.
  if (body.empresa) {
    res.status(200).json({ ok: true });
    return;
  }

  const datos = {
    nombre: texto(body.nombre, 120),
    email: texto(body.email, 254).toLowerCase(),
    seguidores: texto(body.seguidores, 20),
    nicho: texto(body.nicho, 160),
    compromiso: texto(body.compromiso, 3),
    consentimiento: body.consentimiento === true
  };

  const errores = [];
  if (!datos.nombre) errores.push("nombre");
  if (!emailRegex.test(datos.email)) errores.push("email");
  if (!SEGUIDORES_VALIDOS.includes(datos.seguidores)) errores.push("seguidores");
  if (!datos.nicho) errores.push("nicho");
  if (!COMPROMISO_VALIDO.includes(datos.compromiso)) errores.push("compromiso");
  if (!datos.consentimiento) errores.push("consentimiento");

  if (errores.length) {
    res.status(400).json({ error: "Revisa los campos marcados.", campos: errores });
    return;
  }

  try {
    const [claves, tagId] = await Promise.all([obtenerClavesCampos(), obtenerIdEtiqueta()]);

    await kit("/subscribers", {
      method: "POST",
      body: {
        email_address: datos.email,
        first_name: datos.nombre,
        state: "active",
        fields: {
          [claves.seguidores]: datos.seguidores,
          [claves.nicho]: datos.nicho,
          [claves.compromiso]: datos.compromiso === "si" ? "Sí" : "No"
        }
      }
    });

    await kit("/tags/" + tagId + "/subscribers", {
      method: "POST",
      body: { email_address: datos.email }
    });

    res.status(200).json({ ok: true });
  } catch (error) {
    console.error(error);
    res.status(502).json({ error: "No se pudo enviar la aplicación. Inténtalo otra vez." });
  }
};

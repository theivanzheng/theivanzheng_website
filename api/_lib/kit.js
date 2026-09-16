// Alta de contactos en Kit (API v4), compartida por los formularios de la web.
// Vercel no publica como función los archivos de api/ que empiezan por "_".
//
// Variable de entorno: KIT_API_KEY (Kit → Settings → Developer → API Keys, v4).

const KIT_API = "https://api.kit.com/v4";

const hayClave = () => Boolean(process.env.KIT_API_KEY);

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
const clavesPorEtiqueta = new Map();
const idsDeTag = new Map();

// Devuelve la clave interna de cada campo personalizado, creándolo si no existe.
const clavesDeCampos = async (etiquetas) => {
  const faltan = etiquetas.filter((etiqueta) => !clavesPorEtiqueta.has(etiqueta.toLowerCase()));

  if (faltan.length) {
    const { custom_fields: existentes = [] } = await kit("/custom_fields?per_page=1000");
    existentes.forEach((campo) => clavesPorEtiqueta.set(campo.label.toLowerCase(), campo.key));

    for (const etiqueta of faltan) {
      if (clavesPorEtiqueta.has(etiqueta.toLowerCase())) continue;
      const { custom_field: campo } = await kit("/custom_fields", { method: "POST", body: { label: etiqueta } });
      clavesPorEtiqueta.set(etiqueta.toLowerCase(), campo.key);
    }
  }

  return etiquetas.map((etiqueta) => clavesPorEtiqueta.get(etiqueta.toLowerCase()));
};

// Kit devuelve la etiqueta existente si ya hay una con ese nombre.
const idDeTag = async (nombre) => {
  if (!idsDeTag.has(nombre)) {
    const { tag } = await kit("/tags", { method: "POST", body: { name: nombre } });
    idsDeTag.set(nombre, tag.id);
  }
  return idsDeTag.get(nombre);
};

// Crea o actualiza el contacto, rellena sus campos y le pone la etiqueta.
// `campos` usa como clave el nombre visible del campo en Kit: { "Nicho": "fitness" }.
const altaEnKit = async ({ email, nombre, tag, campos = {} }) => {
  const etiquetas = Object.keys(campos);
  const [claves, tagId] = await Promise.all([clavesDeCampos(etiquetas), idDeTag(tag)]);

  const fields = {};
  etiquetas.forEach((etiqueta, i) => { fields[claves[i]] = campos[etiqueta]; });

  const subscriber = { email_address: email, state: "active", fields };
  if (nombre) subscriber.first_name = nombre;

  await kit("/subscribers", { method: "POST", body: subscriber });
  await kit("/tags/" + tagId + "/subscribers", { method: "POST", body: { email_address: email } });
};

module.exports = { altaEnKit, hayClave };

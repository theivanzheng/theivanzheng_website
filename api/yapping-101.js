// Recibe las solicitudes de la lista de espera de /yapping-101 y las da de alta
// en Kit con la etiqueta "Yapping 101". Va por servidor porque el formulario
// público de Kit no permite etiquetar ni rellenar campos personalizados sin
// automatizaciones de pago; la API v4 sí, pero necesita una clave que no puede
// ir al navegador.
//
// Variable de entorno (Vercel → Settings → Environment Variables):
//   KIT_API_KEY   obligatoria. Kit → Settings → Developer → API Keys (v4).

const { altaEnKit, hayClave } = require("./_lib/kit");

const SEGUIDORES_VALIDOS = ["0-1k", "1k-5k", "5k-10k", "10k+"];
const COMPROMISO_VALIDO = ["si", "no"];
const emailRegex = /^[A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,}$/i;

const texto = (valor, max) => String(valor || "").trim().slice(0, max);

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    res.status(405).json({ error: "Método no permitido." });
    return;
  }

  if (!hayClave()) {
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
    await altaEnKit({
      email: datos.email,
      nombre: datos.nombre,
      tag: "Yapping 101",
      campos: {
        "Seguidores": datos.seguidores,
        "Nicho": datos.nicho,
        "Contenido semanal": datos.compromiso === "si" ? "Sí" : "No"
      }
    });

    res.status(200).json({ ok: true });
  } catch (error) {
    console.error(error);
    res.status(502).json({ error: "No se pudo enviar la solicitud. Inténtalo otra vez." });
  }
};

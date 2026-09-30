// Lista de espera de /yapping-101. Por cada alta:
//   1. Apunta a la persona al formulario público de Kit (que le manda su email
//      de confirmación; el plan gratuito no tiene API, así que se usa el mismo
//      endpoint público que usaría el navegador).
//   2. Guarda sus datos en Supabase.
//   3. Manda un aviso por email con la lista completa, de más reciente a más antigua.
//
// Si Kit o el aviso fallan, la persona ya está guardada y se registra el error,
// pero no se le muestra nada raro.
//
// Variables de entorno (Vercel → Settings → Environment Variables):
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY   (ya existen para el formulario de contacto)
//   RESEND_API_KEY, RESEND_FROM_EMAIL         (ídem)
//   WAITLIST_AVISO_EMAIL                      opcional; por defecto zhengivan10@gmail.com

const { hayConexion, guardar, listar } = require("./_lib/supabase");

const TABLA = "yapping_waitlist";
const KIT_FORM_ID = "9924559";
const AVISO_PARA = () => process.env.WAITLIST_AVISO_EMAIL || "zhengivan10@gmail.com";

const SEGUIDORES_VALIDOS = ["0-1k", "1k-5k", "5k-10k", "10k+"];
const COMPROMISO_VALIDO = ["si", "no"];
const emailRegex = /^[A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,}$/i;

const texto = (valor, max) => String(valor || "").trim().slice(0, max);

const escapar = (valor) =>
  String(valor == null ? "" : valor).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

const fecha = (iso) => {
  try {
    return new Date(iso).toLocaleString("es-ES", {
      timeZone: "Europe/Madrid", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit"
    });
  } catch (error) {
    return iso || "";
  }
};

const altaEnKit = async (datos) => {
  const respuesta = await fetch("https://app.kit.com/forms/" + KIT_FORM_ID + "/subscriptions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email_address: datos.email,
      first_name: datos.nombre,
      fields: {
        seguidores: datos.seguidores,
        nicho: datos.nicho,
        contenido_semanal: datos.compromiso === "si" ? "Sí" : "No"
      }
    }),
    signal: AbortSignal.timeout(8000)
  });
  if (!respuesta.ok) throw new Error("Kit respondió " + respuesta.status);
};

const avisar = async (nueva, lista) => {
  if (!process.env.RESEND_API_KEY || !process.env.RESEND_FROM_EMAIL) {
    console.warn("[waitlist] sin Resend configurado: no se manda el aviso");
    return;
  }

  const filas = lista.map((p, i) => `
        <tr>
          <td style="padding:8px 10px;border-bottom:1px solid #e9ebef;color:#6d7684;">${lista.length - i}</td>
          <td style="padding:8px 10px;border-bottom:1px solid #e9ebef;"><strong>${escapar(p.nombre)}</strong></td>
          <td style="padding:8px 10px;border-bottom:1px solid #e9ebef;"><a href="mailto:${escapar(p.email)}" style="color:#101216;">${escapar(p.email)}</a></td>
          <td style="padding:8px 10px;border-bottom:1px solid #e9ebef;">${escapar(p.seguidores)}</td>
          <td style="padding:8px 10px;border-bottom:1px solid #e9ebef;">${escapar(p.nicho)}</td>
          <td style="padding:8px 10px;border-bottom:1px solid #e9ebef;">${escapar(p.compromiso === "si" ? "Sí" : "No")}</td>
          <td style="padding:8px 10px;border-bottom:1px solid #e9ebef;color:#6d7684;white-space:nowrap;">${escapar(fecha(p.created_at))}</td>
        </tr>`).join("");

  const html = `<div style="font-family:Arial,sans-serif;color:#101216;">
      <h2 style="margin:0 0 6px;font-size:20px;">Nueva persona en la lista de espera</h2>
      <p style="margin:0 0 20px;font-size:15px;color:#2d3440;">
        ${escapar(nueva.nombre)} · ${escapar(nueva.email)} · ${escapar(nueva.seguidores)} · ${escapar(nueva.nicho)}
      </p>
      <p style="margin:0 0 10px;font-size:14px;color:#6d7684;">${lista.length} apuntados en total, del más reciente al más antiguo:</p>
      <table style="border-collapse:collapse;font-size:14px;">
        <tr style="text-align:left;color:#6d7684;">
          <th style="padding:8px 10px;">#</th><th style="padding:8px 10px;">Nombre</th><th style="padding:8px 10px;">Email</th>
          <th style="padding:8px 10px;">Seguidores</th><th style="padding:8px 10px;">Nicho</th>
          <th style="padding:8px 10px;">Semanal</th><th style="padding:8px 10px;">Fecha</th>
        </tr>${filas}
      </table>
    </div>`;

  const respuesta = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Authorization": "Bearer " + process.env.RESEND_API_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: process.env.RESEND_FROM_EMAIL,
      to: AVISO_PARA(),
      subject: `Lista de espera Yapping 101: ${lista.length} apuntados (+ ${nueva.nombre})`,
      html
    }),
    signal: AbortSignal.timeout(8000)
  });
  if (!respuesta.ok) throw new Error("Resend respondió " + respuesta.status);
};

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    res.status(405).json({ error: "Método no permitido." });
    return;
  }

  const body = req.body || {};

  // Campo trampa: los humanos no lo ven.
  if (body.trampa) {
    console.warn("[waitlist] envío descartado por el campo trampa");
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

  if (!hayConexion()) {
    console.error("[waitlist] faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY");
    res.status(500).json({ error: "El formulario no está disponible ahora mismo. Inténtalo más tarde." });
    return;
  }

  try {
    await guardar(TABLA, {
      nombre: datos.nombre,
      email: datos.email,
      seguidores: datos.seguidores,
      nicho: datos.nicho,
      compromiso: datos.compromiso,
      consentimiento: datos.consentimiento
    });
    console.log("[waitlist] guardado en Supabase");
  } catch (error) {
    console.error("[waitlist] no se pudo guardar", error);
    res.status(502).json({ error: "No se pudo enviar la solicitud. Inténtalo otra vez." });
    return;
  }

  // La persona ya está guardada: si Kit o el aviso fallan, se registra el error
  // pero a ella se le responde que todo ha ido bien.
  try {
    await altaEnKit(datos);
    console.log("[waitlist] alta en Kit correcta");
  } catch (error) {
    console.error("[waitlist] no se pudo dar de alta en Kit", error);
  }

  try {
    const lista = await listar(TABLA, "nombre,email,seguidores,nicho,compromiso,created_at");
    await avisar(datos, lista || []);
    console.log("[waitlist] aviso enviado");
  } catch (error) {
    console.error("[waitlist] no se pudo enviar el aviso", error);
  }

  res.status(200).json({ ok: true });
};

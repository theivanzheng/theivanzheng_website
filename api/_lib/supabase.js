// Acceso a Supabase por su API REST, sin librerías: la clave de servicio solo
// vive en el servidor y nunca llega al navegador.
//
// Variables de entorno (ya configuradas en Vercel para el formulario de contacto):
//   SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY

const base = () => (process.env.SUPABASE_URL || "").replace(/\/$/, "");
const clave = () => process.env.SUPABASE_SERVICE_ROLE_KEY || "";

const hayConexion = () => Boolean(base() && clave());

const pedir = async (ruta, opciones = {}) => {
  const respuesta = await fetch(base() + "/rest/v1/" + ruta, {
    method: opciones.method || "GET",
    headers: Object.assign({
      "apikey": clave(),
      "Authorization": "Bearer " + clave(),
      "Content-Type": "application/json"
    }, opciones.headers || {}),
    body: opciones.body ? JSON.stringify(opciones.body) : undefined,
    signal: AbortSignal.timeout(8000)
  });

  const texto = await respuesta.text();
  if (!respuesta.ok) throw new Error("Supabase " + ruta + ": " + respuesta.status + " " + texto.slice(0, 200));
  return texto ? JSON.parse(texto) : null;
};

// Guarda la fila; si ese email ya estaba, actualiza sus datos en vez de duplicarlo.
const guardar = (tabla, fila) =>
  pedir(tabla + "?on_conflict=email", {
    method: "POST",
    headers: { "Prefer": "resolution=merge-duplicates,return=representation" },
    body: [fila]
  });

const listar = (tabla, columnas, limite = 500) =>
  pedir(tabla + "?select=" + columnas + "&order=created_at.desc&limit=" + limite);

module.exports = { hayConexion, guardar, listar };

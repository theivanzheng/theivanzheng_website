require("dotenv").config();

const crypto = require("crypto");
const fs = require("fs/promises");
const path = require("path");
const express = require("express");
const cors = require("cors");
const { createClient } = require("@supabase/supabase-js");
const { Resend } = require("resend");

const app = express();

const getEnv = (key, fallback = "") => {
  const value = process.env[key] ?? fallback;
  return typeof value === "string" ? value.trim() : value;
};

const env = {
  port: Number(getEnv("PORT", "8787")),
  appPublicBaseUrl: getEnv("APP_PUBLIC_BASE_URL", "https://www.theivanzheng.com"),
  allowedOrigin: getEnv("ALLOWED_ORIGIN", "https://www.theivanzheng.com"),
  redirectUrl: getEnv("NEWSLETTER_REDIRECT_URL", "https://www.theivanzheng.com/theivanzheng.html"),
  successUrl: getEnv("NEWSLETTER_SUCCESS_URL", "https://www.theivanzheng.com/newsletter-confirmado.html"),
  newsletterName: getEnv("NEWSLETTER_NAME", "El Circulo Privado"),
  supabaseUrl: getEnv("SUPABASE_URL"),
  supabaseServiceRoleKey: getEnv("SUPABASE_SERVICE_ROLE_KEY"),
  resendApiKey: getEnv("RESEND_API_KEY"),
  resendFromEmail: getEnv("RESEND_FROM_EMAIL"),
  resendReplyTo: getEnv("RESEND_REPLY_TO", "info@theivanzheng.com"),
  contactToEmail: getEnv("CONTACT_TO_EMAIL", "info@theivanzheng.com"),
  resendSegmentId: getEnv("RESEND_SEGMENT_ID"),
  consentVersion: getEnv("CONSENT_VERSION", "v1-2026-04-18"),
  tokenExpiryHours: Number(getEnv("TOKEN_EXPIRY_HOURS", "24"))
};

const requiredKeys = [
  "supabaseUrl",
  "supabaseServiceRoleKey",
  "resendApiKey",
  "resendFromEmail"
];

const missingEnv = requiredKeys.filter((key) => !env[key]);
if (missingEnv.length > 0) {
  console.error("Missing required environment variables:", missingEnv.join(", "));
  process.exit(1);
}

const supabase = createClient(env.supabaseUrl, env.supabaseServiceRoleKey, {
  auth: { persistSession: false }
});
const resend = new Resend(env.resendApiKey);
const contactRateWindowMs = Number(getEnv("CONTACT_RATE_LIMIT_WINDOW_MS", "60000"));
const contactRateMax = Number(getEnv("CONTACT_RATE_LIMIT_MAX", "5"));
const contactRateMap = new Map();

const emailRegex = /^[A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,}$/i;

const normalizeEmail = (raw) => String(raw || "").trim().toLowerCase();

const isContactRateLimited = (ip) => {
  const now = Date.now();
  const windowStart = now - contactRateWindowMs;
  const key = String(ip || "unknown");
  const timestamps = contactRateMap.get(key) || [];
  const recent = timestamps.filter((ts) => ts >= windowStart);

  if (recent.length >= contactRateMax) {
    contactRateMap.set(key, recent);
    return true;
  }

  recent.push(now);
  contactRateMap.set(key, recent);
  return false;
};

const syncResendContact = async ({ email, unsubscribed = false, properties = {} }) => {
  const contactPayload = {
    email,
    unsubscribed,
    properties
  };

  const { data: existingContact, error: getError } = await resend.contacts.get({ email });

  if (getError && getError.message && !String(getError.message).toLowerCase().includes("not found")) {
    throw new Error(`Resend contact lookup error: ${getError.message}`);
  }

  if (existingContact?.id) {
    const { error: updateError } = await resend.contacts.update({
      email,
      unsubscribed,
      properties
    });

    if (updateError) {
      throw new Error(`Resend contact update error: ${updateError.message || "unknown_error"}`);
    }

    return { action: "updated", id: existingContact.id };
  }

  const createPayload = {
    ...contactPayload
  };

  if (env.resendSegmentId) {
    createPayload.segments = [{ id: env.resendSegmentId }];
  }

  const { data, error } = await resend.contacts.create(createPayload);

  if (error) {
    throw new Error(`Resend contact create error: ${error.message || "unknown_error"}`);
  }

  return { action: "created", id: data?.id || null };
};

const resolveRedirectBaseUrl = (req, configuredUrl, fallbackPath) => {
  const rawConfigured = String(configuredUrl || "").trim();
  const safeConfigured = rawConfigured || `https://www.theivanzheng.com${fallbackPath}`;

  if (!isLocalUrl(safeConfigured)) {
    return safeConfigured;
  }

  const publicBase = resolvePublicBaseUrl(req);
  return `${publicBase}${fallbackPath}`;
};

const buildRedirectUrl = (req, state, reason) => {
  const url = new URL(resolveRedirectBaseUrl(req, env.redirectUrl, "/theivanzheng.html"));
  url.searchParams.set("newsletter", state);
  if (reason) {
    url.searchParams.set("reason", reason);
  }
  return url.toString();
};

const buildSuccessRedirectUrl = (req, state = "confirmed", reason = "") => {
  // Always land on the success page after confirmation to avoid env misconfiguration.
  const publicBase = resolvePublicBaseUrl(req);
  const url = new URL(`${publicBase}/newsletter-confirmado.html`);
  url.searchParams.set("newsletter", state);
  if (reason) {
    url.searchParams.set("reason", reason);
  }
  return url.toString();
};

const templateDir = path.resolve(__dirname, "..", "Plantillas_MailingList");

const renderTemplate = async (filename, replacements) => {
  const templatePath = path.join(templateDir, filename);
  const templateRaw = await fs.readFile(templatePath, "utf8");

  return Object.entries(replacements).reduce((html, [key, value]) => {
    const token = `{{${key}}}`;
    return html.split(token).join(String(value));
  }, templateRaw);
};

const isLocalUrl = (value) => /https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?/i.test(String(value || ""));

const resolvePublicBaseUrl = (req) => {
  const configuredBase = String(env.appPublicBaseUrl || "").replace(/\/$/, "");
  if (configuredBase && !isLocalUrl(configuredBase)) {
    return configuredBase;
  }

  const forwardedProto = String(req.headers["x-forwarded-proto"] || "https").split(",")[0].trim();
  const forwardedHost = String(req.headers["x-forwarded-host"] || req.headers.host || "").split(",")[0].trim();
  if (forwardedHost) {
    return `${forwardedProto}://${forwardedHost}`;
  }

  return "https://www.theivanzheng.com";
};

const sendConfirmationEmail = async (email, token, req) => {
  const publicApiBase = resolvePublicBaseUrl(req);
  const confirmUrl = `${publicApiBase}/api/newsletter/confirm?token=${encodeURIComponent(token)}`;
  const html = await renderTemplate("confirmacion.html", {
    NEWSLETTER_NAME: env.newsletterName,
    CONFIRM_URL: confirmUrl
  });

  const { data, error } = await resend.emails.send({
    from: env.resendFromEmail,
    to: email,
    reply_to: env.resendReplyTo,
    subject: `Confirma tu suscripcion a ${env.newsletterName}`,
    html
  });

  if (error) {
    throw new Error(`Resend error: ${error.message || "unknown_error"}`);
  }

  return data?.id || null;
};

const sendWelcomeEmail = async (email) => {
  const html = await renderTemplate("bienvenida.html", {
    NEWSLETTER_NAME: env.newsletterName
  });

  const { data, error } = await resend.emails.send({
    from: env.resendFromEmail,
    to: email,
    reply_to: env.resendReplyTo,
    subject: `Suscripcion confirmada a ${env.newsletterName}`,
    html
  });

  if (error) {
    throw new Error(`Resend error: ${error.message || "unknown_error"}`);
  }

  return data?.id || null;
};

app.use(
  cors({
    origin: env.allowedOrigin,
    methods: ["GET", "POST"],
    allowedHeaders: ["Content-Type"]
  })
);
app.use(express.json());

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, service: "newsletter-backend" });
});

app.post("/api/newsletter/subscribe", async (req, res) => {
  try {
    const email = normalizeEmail(req.body?.email);
    const consentAccepted = Boolean(req.body?.consentAccepted);
    const source = String(req.body?.source || "website").trim().slice(0, 120);
    const newsletterName = String(req.body?.newsletterName || env.newsletterName).trim().slice(0, 120);

    if (!emailRegex.test(email)) {
      return res.status(400).json({ ok: false, error: "Email no valido" });
    }

    if (!consentAccepted) {
      return res.status(400).json({ ok: false, error: "Debes aceptar la politica de privacidad" });
    }

    const nowIso = new Date().toISOString();

    const { data: existing, error: existingError } = await supabase
      .from("newsletter_subscribers")
      .select("id,email,status,metadata")
      .eq("email", email)
      .maybeSingle();

    if (existingError) {
      throw existingError;
    }

    let subscriberId;

    if (existing?.status === "active") {
      return res.status(200).json({
        ok: true,
        status: "already_confirmed",
        message: "Este correo ya esta suscrito y confirmado."
      });
    }

    if (existing) {
      const mergedMetadata = {
        ...(existing.metadata || {}),
        newsletter_name: newsletterName
      };

      const { data: updated, error: updateError } = await supabase
        .from("newsletter_subscribers")
        .update({
          status: "pending",
          consent_accepted: true,
          consent_version: env.consentVersion,
          source,
          metadata: mergedMetadata,
          unsubscribed_at: null,
          updated_at: nowIso
        })
        .eq("id", existing.id)
        .select("id")
        .single();

      if (updateError) {
        throw updateError;
      }
      subscriberId = updated.id;
    } else {
      const { data: inserted, error: insertError } = await supabase
        .from("newsletter_subscribers")
        .insert({
          email,
          status: "pending",
          source,
          consent_accepted: true,
          consent_version: env.consentVersion,
          metadata: {
            newsletter_name: newsletterName
          },
          ip_address: req.ip,
          updated_at: nowIso
        })
        .select("id")
        .single();

      if (insertError) {
        throw insertError;
      }
      subscriberId = inserted.id;
    }

    await supabase
      .from("newsletter_confirmations")
      .update({ used_at: nowIso })
      .eq("subscriber_id", subscriberId)
      .is("used_at", null);

    const token = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + env.tokenExpiryHours * 60 * 60 * 1000).toISOString();

    console.log("[newsletter/token_generated]", { email, token: token.slice(0, 8) + "...", expiresAt, subscriberId });

    const { error: tokenInsertError } = await supabase
      .from("newsletter_confirmations")
      .insert({
        subscriber_id: subscriberId,
        token,
        expires_at: expiresAt
      });

    if (tokenInsertError) {
      console.error("[newsletter/token_insert_failed]", { email, error: tokenInsertError.message || tokenInsertError, subscriberId });
      throw tokenInsertError;
    }

    console.log("[newsletter/token_inserted]", { email, token: token.slice(0, 8) + "...", subscriberId });

    const emailId = await sendConfirmationEmail(email, token, req);

    console.log("[newsletter/email_sent]", {
      email,
      newsletterName,
      provider: "resend",
      emailId
    });

    return res.status(200).json({
      ok: true,
      status: "pending",
      message: "Te hemos enviado un email para confirmar tu suscripcion."
    });
  } catch (error) {
    console.error("[newsletter/subscribe]", error);
    const message = String(error?.message || "");

    if (message.includes("domain is not verified")) {
      return res.status(502).json({
        ok: false,
        error: "El dominio de envio de email no esta verificado en Resend."
      });
    }

    if (message.includes("only send testing emails")) {
      return res.status(502).json({
        ok: false,
        error: "Remitente en modo test: solo puedes enviar a tu propio email verificado."
      });
    }

    return res.status(500).json({ ok: false, error: "No se pudo procesar la suscripcion" });
  }
});

app.get("/api/newsletter/confirm", async (req, res) => {
  try {
    const token = String(req.query?.token || "").trim();
    if (!token) {
      console.log("[newsletter/confirm] missing token");
      return res.redirect(302, buildRedirectUrl(req, "error", "missing_token"));
    }

    const nowIso = new Date().toISOString();

    console.log("[newsletter/confirm_lookup]", { token: token.slice(0, 8) + "..." });

    const { data: confirmation, error: confirmationError } = await supabase
      .from("newsletter_confirmations")
      .select("id,subscriber_id,expires_at,used_at")
      .eq("token", token)
      .maybeSingle();

    if (confirmationError) {
      console.error("[newsletter/confirm_lookup_error]", { error: confirmationError.message || confirmationError });
      throw confirmationError;
    }

    console.log("[newsletter/confirm_result]", { found: !!confirmation, used_at: confirmation?.used_at, expires_at: confirmation?.expires_at });

    if (!confirmation) {
      console.log("[newsletter/confirm_invalid_token]", { token: token.slice(0, 8) + "..." });
      return res.redirect(302, buildRedirectUrl(req, "error", "invalid_token"));
    }

    if (confirmation.used_at) {
      return res.redirect(302, buildSuccessRedirectUrl(req, "already_confirmed", "token_used"));
    }

    if (new Date(confirmation.expires_at).getTime() < Date.now()) {
      return res.redirect(302, buildRedirectUrl(req, "error", "token_expired"));
    }

    const { error: markConfirmationError } = await supabase
      .from("newsletter_confirmations")
      .update({ used_at: nowIso })
      .eq("id", confirmation.id);

    if (markConfirmationError) {
      throw markConfirmationError;
    }

    const { error: subscriberUpdateError } = await supabase
      .from("newsletter_subscribers")
      .update({
        status: "active",
        confirmed_at: nowIso,
        updated_at: nowIso
      })
      .eq("id", confirmation.subscriber_id);

    if (subscriberUpdateError) {
      throw subscriberUpdateError;
    }

    const { error: subscriberFetchError, data: subscriber } = await supabase
      .from("newsletter_subscribers")
      .select("email,metadata")
      .eq("id", confirmation.subscriber_id)
      .maybeSingle();

    if (subscriberFetchError) {
      throw subscriberFetchError;
    }

    if (subscriber?.email) {
      const syncResult = await syncResendContact({
        email: subscriber.email,
        unsubscribed: false,
        properties: {
          newsletter_name: subscriber?.metadata?.newsletter_name || env.newsletterName,
          consent_version: env.consentVersion,
          source: "website"
        }
      });

      console.log("[newsletter/resend_contact_synced]", {
        email: subscriber.email,
        action: syncResult.action,
        contactId: syncResult.id
      });

      try {
        const welcomeEmailId = await sendWelcomeEmail(subscriber.email);
        console.log("[newsletter/welcome_email_sent]", {
          email: subscriber.email,
          provider: "resend",
          emailId: welcomeEmailId
        });
      } catch (welcomeError) {
        // Keep confirmation successful even if welcome email fails.
        console.error("[newsletter/welcome_email_error]", {
          email: subscriber.email,
          error: welcomeError?.message || welcomeError
        });
      }
    }

    return res.redirect(302, buildSuccessRedirectUrl(req));
  } catch (error) {
    console.error("[newsletter/confirm]", error);
    return res.redirect(302, buildRedirectUrl(req, "error", "server_error"));
  }
});

app.post("/api/newsletter/unsubscribe", async (req, res) => {
  try {
    const email = normalizeEmail(req.body?.email);
    if (!emailRegex.test(email)) {
      return res.status(400).json({ ok: false, error: "Email no valido" });
    }

    const nowIso = new Date().toISOString();

    const { error } = await supabase
      .from("newsletter_subscribers")
      .update({
        status: "unsubscribed",
        unsubscribed_at: nowIso,
        updated_at: nowIso
      })
      .eq("email", email)
      .in("status", ["pending", "active"]);

    if (error) {
      throw error;
    }

    const syncEmail = normalizeEmail(req.body?.email);
    if (emailRegex.test(syncEmail)) {
      try {
        const syncResult = await syncResendContact({
          email: syncEmail,
          unsubscribed: true,
          properties: {
            unsubscribed_at: nowIso
          }
        });

        console.log("[newsletter/resend_contact_unsubscribed]", {
          email: syncEmail,
          action: syncResult.action,
          contactId: syncResult.id
        });
      } catch (syncError) {
        console.error("[newsletter/resend_contact_sync_error]", syncError);
      }
    }

    return res.status(200).json({ ok: true, message: "Baja procesada" });
  } catch (error) {
    console.error("[newsletter/unsubscribe]", error);
    return res.status(500).json({ ok: false, error: "No se pudo procesar la baja" });
  }
});

app.post("/api/contact", async (req, res) => {
  try {
    const email = normalizeEmail(req.body?.email);
    const subject = String(req.body?.subject || "").trim();
    const message = String(req.body?.message || "").trim();
    const company = String(req.body?.company || "").trim();

    // Honeypot: bots usually fill hidden fields. Reply with success to avoid signal.
    if (company) {
      return res.status(200).json({ ok: true, message: "Mensaje enviado correctamente" });
    }

    if (isContactRateLimited(req.ip)) {
      return res.status(429).json({ ok: false, error: "Has enviado demasiados mensajes. Espera un minuto." });
    }

    if (!emailRegex.test(email)) {
      return res.status(400).json({ ok: false, error: "Correo electronico no valido" });
    }

    if (subject.length < 3) {
      return res.status(400).json({ ok: false, error: "El asunto es demasiado corto" });
    }

    if (message.length < 10) {
      return res.status(400).json({ ok: false, error: "El mensaje es demasiado corto" });
    }

    const html = [
      "<h2>Nuevo mensaje desde el formulario de contacto</h2>",
      `<p><strong>Email:</strong> ${email}</p>`,
      `<p><strong>Asunto:</strong> ${subject}</p>`,
      "<hr>",
      `<p style=\"white-space:pre-wrap;\">${message.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</p>`
    ].join("\n");

    const { data, error } = await resend.emails.send({
      from: env.resendFromEmail,
      to: env.contactToEmail,
      reply_to: email,
      subject: `[Contacto web] ${subject}`,
      html
    });

    if (error) {
      throw new Error(`Resend error: ${error.message || "unknown_error"}`);
    }

    console.log("[contact/email_sent]", {
      from: email,
      to: env.contactToEmail,
      emailId: data?.id || null
    });

    return res.status(200).json({ ok: true, message: "Mensaje enviado correctamente" });
  } catch (error) {
    console.error("[contact/send]", error);
    return res.status(500).json({ ok: false, error: "No se pudo enviar el mensaje" });
  }
});

if (require.main === module) {
  app.listen(env.port, () => {
    console.log(`Newsletter backend running on http://127.0.0.1:${env.port}`);
  });
}

module.exports = app;

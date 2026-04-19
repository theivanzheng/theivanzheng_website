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
  appPublicBaseUrl: getEnv("APP_PUBLIC_BASE_URL", "http://127.0.0.1:8080"),
  allowedOrigin: getEnv("ALLOWED_ORIGIN", "http://127.0.0.1:8080"),
  redirectUrl: getEnv("NEWSLETTER_REDIRECT_URL", "http://127.0.0.1:8080/theivanzheng.html"),
  successUrl: getEnv("NEWSLETTER_SUCCESS_URL", "http://127.0.0.1:8080/newsletter-confirmado.html"),
  newsletterName: getEnv("NEWSLETTER_NAME", "El Circulo Privado"),
  supabaseUrl: getEnv("SUPABASE_URL"),
  supabaseServiceRoleKey: getEnv("SUPABASE_SERVICE_ROLE_KEY"),
  resendApiKey: getEnv("RESEND_API_KEY"),
  resendFromEmail: getEnv("RESEND_FROM_EMAIL"),
  resendReplyTo: getEnv("RESEND_REPLY_TO", "info@theivanzheng.com"),
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

const emailRegex = /^[A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,}$/i;

const normalizeEmail = (raw) => String(raw || "").trim().toLowerCase();

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

const buildRedirectUrl = (state, reason) => {
  const url = new URL(env.redirectUrl);
  url.searchParams.set("newsletter", state);
  if (reason) {
    url.searchParams.set("reason", reason);
  }
  return url.toString();
};

const buildSuccessRedirectUrl = () => {
  const url = new URL(env.successUrl);
  url.searchParams.set("newsletter", "confirmed");
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

const sendConfirmationEmail = async (email, token) => {
  const confirmUrl = `http://127.0.0.1:${env.port}/api/newsletter/confirm?token=${encodeURIComponent(token)}`;
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

    if (existing?.status === "confirmed") {
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

    const { error: tokenInsertError } = await supabase
      .from("newsletter_confirmations")
      .insert({
        subscriber_id: subscriberId,
        token,
        expires_at: expiresAt
      });

    if (tokenInsertError) {
      throw tokenInsertError;
    }

    const emailId = await sendConfirmationEmail(email, token);

    console.log("[newsletter/email_sent]", {
      email,
      newsletterName,
      provider: "resend",
      emailId
    });

    return res.status(200).json({
      ok: true,
      status: "pending_confirmation",
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
      return res.redirect(302, buildRedirectUrl("error", "missing_token"));
    }

    const nowIso = new Date().toISOString();

    const { data: confirmation, error: confirmationError } = await supabase
      .from("newsletter_confirmations")
      .select("id,subscriber_id,expires_at,used_at")
      .eq("token", token)
      .maybeSingle();

    if (confirmationError) {
      throw confirmationError;
    }

    if (!confirmation) {
      return res.redirect(302, buildRedirectUrl("error", "invalid_token"));
    }

    if (confirmation.used_at) {
      return res.redirect(302, buildRedirectUrl("already_confirmed", "token_used"));
    }

    if (new Date(confirmation.expires_at).getTime() < Date.now()) {
      return res.redirect(302, buildRedirectUrl("error", "token_expired"));
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
        status: "confirmed",
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
    }

    return res.redirect(302, buildSuccessRedirectUrl());
  } catch (error) {
    console.error("[newsletter/confirm]", error);
    return res.redirect(302, buildRedirectUrl("error", "server_error"));
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
      .in("status", ["pending", "confirmed"]);

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

app.listen(env.port, () => {
  console.log(`Newsletter backend running on http://127.0.0.1:${env.port}`);
});

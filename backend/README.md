# Newsletter Backend (Supabase + Resend)

Backend API para gestionar suscripciones de newsletter con doble opt-in.

## 1) Variables de entorno

Copia `.env.example` a `.env` y completa:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `RESEND_API_KEY`
- `RESEND_FROM_EMAIL`
- `RESEND_SEGMENT_ID` (opcional, para añadir contactos confirmados a un segmento)

Opcionales recomendadas:

- `APP_PUBLIC_BASE_URL`
- `ALLOWED_ORIGIN`
- `NEWSLETTER_REDIRECT_URL`
- `NEWSLETTER_SUCCESS_URL` (opcional, página a la que redirige cuando se confirma la suscripcion)
- `NEWSLETTER_NAME`
- `RESEND_REPLY_TO`
- `CONSENT_VERSION`
- `TOKEN_EXPIRY_HOURS`

## 2) Instalar y arrancar

```bash
cd backend
npm install
npm run dev
```

API local por defecto en `http://127.0.0.1:8787`.

## 3) Endpoints

- `GET /api/health`
- `POST /api/newsletter/subscribe`
- `GET /api/newsletter/confirm?token=...`
- `POST /api/newsletter/unsubscribe`

### Body subscribe

```json
{
  "email": "usuario@email.com",
  "consentAccepted": true,
  "source": "website",
  "newsletterName": "El Circulo Privado"
}
```

`newsletterName` es opcional. Si no se envia, se usa `NEWSLETTER_NAME`.
El nombre se guarda en `newsletter_subscribers.metadata.newsletter_name` para segmentacion futura.

### Body unsubscribe

```json
{
  "email": "usuario@email.com"
}
```

## 4) Flujo

1. Se crea/actualiza suscriptor con estado `pending`.
2. Se genera token en `newsletter_confirmations`.
3. Se envia email de confirmacion con Resend.
4. El enlace confirma y cambia estado a `confirmed`.
5. Al confirmar, el contacto se sincroniza automaticamente con Resend Contacts.
6. Si existe `RESEND_SEGMENT_ID`, el contacto confirmado se crea dentro de ese segmento.

## 5) Produccion

- Usa un dominio API real (por ejemplo `https://api.tudominio.com`).
- Ajusta `ALLOWED_ORIGIN` al dominio frontend.
- Verifica dominio emisor en Resend para `RESEND_FROM_EMAIL`.
- Si despliegas en Vercel junto con esta web, expone la API como rutas `https://www.theivanzheng.com/api/*`.
- Asegura `APP_PUBLIC_BASE_URL=https://www.theivanzheng.com` para que los enlaces de confirmacion en email no apunten a localhost.

## 6) Plantillas de mailing

Las plantillas HTML estan separadas en la carpeta:

- `backend/Plantillas_MailingList/confirmacion.html`
- `backend/Plantillas_MailingList/bienvenida.html`

La confirmacion actual usa `confirmacion.html` con placeholders:

- `{{NEWSLETTER_NAME}}`
- `{{CONFIRM_URL}}`

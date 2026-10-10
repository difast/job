// Отправка писем через SMTP. Порт 465 — неявный TLS (SMTPS), сертификат сервера проверяется.
//
//   SMTP_HOST=smtp.example.ru   SMTP_PORT=465   SMTP_USER=…   SMTP_PASSWORD=…   SMTP_FROM="Clymly <no-reply@clymly.ru>"
import nodemailer, { type Transporter } from 'nodemailer';
import { BRAND } from './brand';
import { COMPANY } from './legal';

const env = (k: string) => (process.env[k] ?? '').trim();

export const mailEnabled = () => !!env('SMTP_HOST') && !!env('SMTP_FROM');

let transporter: Transporter | null = null;
function transport() {
  if (transporter) return transporter;
  const port = Number(env('SMTP_PORT') || 465);
  transporter = nodemailer.createTransport({
    host: env('SMTP_HOST'), port,
    secure: port === 465, // 465 — TLS с первого байта; на других портах — STARTTLS, если сервер его предлагает
    requireTLS: port !== 465 && port !== 25 && env('SMTP_REQUIRE_TLS') !== '0',
    auth: env('SMTP_USER') ? { user: env('SMTP_USER'), pass: env('SMTP_PASSWORD') } : undefined,
    connectionTimeout: 15_000, greetingTimeout: 15_000, socketTimeout: 30_000,
    tls: { minVersion: 'TLSv1.2', servername: env('SMTP_HOST') },
  });
  return transporter;
}

export interface Mail { to: string; subject: string; text: string; html: string; kind?: string }

/** Отправляет письмо. Без настроек SMTP — ничего не отправляет и сообщает об этом (в разработке — пишет в лог). */
export async function sendMail(m: Mail): Promise<{ sent: boolean }> {
  if (!mailEnabled()) {
    if (process.env.NODE_ENV !== 'production') console.info(`[mail] SMTP не настроен. Письмо «${m.subject}» для ${m.to}:\n${m.text}`);
    return { sent: false };
  }
  // Ответы на служебные письма уходят в поддержку
  const replyTo = env('SMTP_REPLY_TO') || COMPANY.email || undefined;
  await transport().sendMail({ from: env('SMTP_FROM'), to: m.to, replyTo, subject: m.subject, text: m.text, html: m.html, headers: { 'X-Mailer': BRAND.name, ...(m.kind ? { 'X-Clymly-Mail': m.kind } : {}) } });
  return { sent: true };
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** Простой фирменный шаблон письма с одной кнопкой. Абзацы в intro — через пустую строку; rows — таблица «параметр — значение». */
export function layout({ title, intro, button, url, outro, rows }: { title: string; intro: string; button: string; url: string; outro: string; rows?: [string, string][] }) {
  const paras = intro.split(/\n\n+/);
  const table = rows?.length ? `<tr><td style="padding:16px 28px 0"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:14px;line-height:1.5;border-top:1px solid #eee8df">${rows.map(([k, v]) => `<tr><td style="padding:8px 12px 8px 0;color:#7a736b;border-bottom:1px solid #eee8df;white-space:nowrap">${esc(k)}</td><td style="padding:8px 0;border-bottom:1px solid #eee8df">${esc(v)}</td></tr>`).join('')}</table></td></tr>` : '';
  const html = `<!doctype html><html lang="ru"><body style="margin:0;background:#f5f2ed;font-family:Arial,Helvetica,sans-serif;color:#1c1a17">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:32px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border:1px solid #e6dfd5;border-radius:16px">
<tr><td style="padding:28px 28px 8px;font-size:22px;font-weight:700;letter-spacing:-0.02em">Cl<span style="color:#b4472a">y</span>ml<span style="color:#5b2321">y</span></td></tr>
<tr><td style="padding:8px 28px 0;font-size:20px;font-weight:700">${esc(title)}</td></tr>
${paras.map((x) => `<tr><td style="padding:12px 28px 0;font-size:15px;line-height:1.6;color:#4a4540">${esc(x)}</td></tr>`).join('')}
${table}
<tr><td style="padding:24px 28px"><a href="${esc(url)}" style="display:inline-block;background:#b4472a;color:#ffffff;text-decoration:none;font-weight:700;font-size:15px;padding:13px 22px;border-radius:10px">${esc(button)}</a></td></tr>
<tr><td style="padding:0 28px 8px;font-size:13px;line-height:1.6;color:#7a736b">Если кнопка не работает, откройте ссылку:<br><a href="${esc(url)}" style="color:#b4472a;word-break:break-all">${esc(url)}</a></td></tr>
<tr><td style="padding:12px 28px 28px;font-size:13px;line-height:1.6;color:#7a736b">${esc(outro)}</td></tr>
</table></td></tr></table></body></html>`;
  const text = `${title}\n\n${intro}\n\n${rows?.length ? rows.map(([k, v]) => `${k}: ${v}`).join('\n') + '\n\n' : ''}${button}: ${url}\n\n${outro}\n\n— ${BRAND.name}`;
  return { html, text };
}

// Тестовый SMTP-сервер с неявным TLS (как на порту 465). Принимает письма и хранит их в памяти.
// Сертификат для localhost генерируется заранее (см. README), серверу Clymly он передаётся через NODE_EXTRA_CA_CERTS.
import { createServer } from 'node:tls';
import { readFileSync } from 'node:fs';

export function startMockSmtp({ port = 465, cert, key, user = 'mailer', pass = 'mailer-pass' }) {
  const state = { messages: [], authFailures: 0 };
  const server = createServer({ cert: readFileSync(cert), key: readFileSync(key), minVersion: 'TLSv1.2' }, (sock) => {
    let buf = '', mode = 'cmd', data = '', from = '', to = [], authed = false, loginStep = 0, loginUser = '';
    const say = (s) => sock.write(s + '\r\n');
    say('220 localhost ESMTP mock');
    sock.on('data', (chunk) => {
      buf += chunk.toString('utf8');
      while (true) {
        if (mode === 'data') {
          const end = buf.indexOf('\r\n.\r\n');
          if (end < 0) return;
          data += buf.slice(0, end); buf = buf.slice(end + 5); mode = 'cmd';
          state.messages.push({ from, to, raw: data, authed });
          data = ''; say('250 OK queued');
          continue;
        }
        const i = buf.indexOf('\r\n');
        if (i < 0) return;
        const line = buf.slice(0, i); buf = buf.slice(i + 2);
        if (loginStep === 1) { loginUser = Buffer.from(line, 'base64').toString(); loginStep = 2; say('334 UGFzc3dvcmQ6'); continue; }
        if (loginStep === 2) { loginStep = 0; const ok = loginUser === user && Buffer.from(line, 'base64').toString() === pass; authed = ok; if (!ok) state.authFailures++; say(ok ? '235 Authenticated' : '535 Bad credentials'); continue; }
        const cmd = line.slice(0, 4).toUpperCase();
        if (cmd === 'EHLO' || cmd === 'HELO') { sock.write('250-localhost\r\n250-AUTH PLAIN LOGIN\r\n250 SIZE 10485760\r\n'); }
        else if (cmd === 'AUTH') {
          const [, method, arg] = line.split(' ');
          if (method.toUpperCase() === 'PLAIN') {
            const [, u, p] = Buffer.from(arg ?? '', 'base64').toString().split('\0');
            authed = u === user && p === pass; if (!authed) state.authFailures++;
            say(authed ? '235 Authenticated' : '535 Bad credentials');
          } else { loginStep = 1; say('334 VXNlcm5hbWU6'); }
        }
        else if (cmd === 'MAIL') { if (!authed) { say('530 Authentication required'); continue; } from = line; to = []; say('250 OK'); }
        else if (cmd === 'RCPT') { to.push(line.replace(/^RCPT TO:\s*/i, '').replace(/[<>]/g, '').split(' ')[0]); say('250 OK'); }
        else if (cmd === 'DATA') { mode = 'data'; say('354 End data with <CR><LF>.<CR><LF>'); }
        else if (cmd === 'QUIT') { say('221 Bye'); sock.end(); }
        else say('250 OK');
      }
    });
    sock.on('error', () => {});
  });
  return new Promise((resolve) => server.listen(port, () => resolve({ state, close: () => new Promise((r) => server.close(r)) })));
}

/** Декодирует quoted-printable и достаёт ссылку подтверждения из письма. */
export function verifyLink(raw) {
  const decoded = Buffer.from(raw.replace(/=\r\n/g, '').replace(/=([0-9A-F]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16))), 'latin1').toString('utf8');
  return decoded.match(/\/verify-email\?token=([\w-]+)/)?.[0] ?? null;
}

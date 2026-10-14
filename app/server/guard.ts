import type { FastifyReply, FastifyRequest } from 'fastify';

const LOCAL_HOSTNAMES = new Set(['127.0.0.1', 'localhost', '[::1]']);

const hostnameOf = (hostHeader: string): string => {
  // «127.0.0.1:4317», «localhost», «[::1]:4317»
  if (hostHeader.startsWith('[')) return hostHeader.slice(0, hostHeader.indexOf(']') + 1);
  return hostHeader.split(':')[0] ?? '';
};

/**
 * R25: los endpoints que lanzan procesos solo aceptan `Host` y `Origin` locales. Frena el DNS rebinding
 * (un sitio externo que resuelve a 127.0.0.1) y las peticiones cruzadas desde otras webs.
 */
export function isAllowedRequest(host: string | undefined, origin: string | undefined): boolean {
  if (!host || !LOCAL_HOSTNAMES.has(hostnameOf(host))) return false;
  if (origin === undefined) return true; // peticiones sin Origin (curl, mismo origen en GET)
  try {
    const url = new URL(origin);
    return LOCAL_HOSTNAMES.has(url.hostname) && url.host === host;
  } catch {
    return false;
  }
}

export async function hostGuard(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  if (isAllowedRequest(request.headers.host, request.headers.origin)) return;
  await reply.code(403).send({ error: 'forbidden_host', message: 'Esta aplicación solo acepta peticiones desde 127.0.0.1.' });
}

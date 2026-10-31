/** Volta ao endereço de origem depois do login (deep-link `?editar=`/`?novo=` sem sessão): lógica pura e segura. */

const LOGIN_PATH = "/entrar"

/** Só caminhos internos do painel: nada de URL absoluta, `//host`, barra invertida ou o próprio login. */
export function safeReturnPath(raw: string | null | undefined): string | null {
  if (!raw || raw.length > 2000) return null
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.includes("\\")) return null
  if (/[\u0000-\u001f]/.test(raw)) return null
  const path = raw.split(/[?#]/)[0]
  if (path === LOGIN_PATH || path.startsWith(`${LOGIN_PATH}/`) || path.startsWith("/api/")) return null
  return raw
}

/** `/entrar` com o endereço atual em `next` (omitido quando não há para onde voltar). */
export function loginUrl(returnTo?: string | null): string {
  const safe = safeReturnPath(returnTo)
  return safe && safe !== "/" && safe !== "/painel" ? `${LOGIN_PATH}?next=${encodeURIComponent(safe)}` : LOGIN_PATH
}

/** Destino depois de entrar: o `next` da URL de login quando seguro; senão o painel. */
export function afterLoginPath(search: string): string {
  return safeReturnPath(new URLSearchParams(search).get("next")) ?? "/painel"
}

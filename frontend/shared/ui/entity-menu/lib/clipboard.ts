interface ClipboardEnv {
  navigator?: { clipboard?: { writeText?: (text: string) => Promise<void> } }
  document?: {
    createElement: (tag: "textarea") => HTMLTextAreaElement
    body: { appendChild: (node: Node) => unknown; removeChild: (node: Node) => unknown }
    execCommand?: (command: string) => boolean
  }
}

/** Copia para a área de transferência: API moderna e, sem ela (http, navegador antigo), `execCommand`. Devolve se copiou. */
export async function copyText(text: string, env: ClipboardEnv = globalThis as unknown as ClipboardEnv): Promise<boolean> {
  try {
    if (env.navigator?.clipboard?.writeText) {
      await env.navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    // Permissão negada: cai no método antigo.
  }
  const doc = env.document
  if (!doc?.execCommand) return false
  const field = doc.createElement("textarea")
  field.value = text
  field.setAttribute("readonly", "")
  field.style.position = "fixed"
  field.style.opacity = "0"
  doc.body.appendChild(field)
  field.select()
  try {
    return doc.execCommand("copy")
  } catch {
    return false
  } finally {
    doc.body.removeChild(field)
  }
}

import { del } from "@vercel/blob";

/**
 * Remove um objeto do Blob sem derrubar o fluxo de configuração.
 * Falha de limpeza deixa órfão no storage — o banco já é a fonte da verdade.
 */
export async function deleteBlobQuietly(pathname: string): Promise<void> {
  if (!pathname || !process.env.BLOB_READ_WRITE_TOKEN) return;
  try {
    await del(pathname);
  } catch (error) {
    console.error("blob delete:", pathname, error);
  }
}

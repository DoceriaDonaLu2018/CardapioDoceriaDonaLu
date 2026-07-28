import { getStoreSettings } from "@/lib/store-settings";
import { ConfiguracoesClient } from "./configuracoes-client";

export const dynamic = "force-dynamic";

export default async function ConfiguracoesPage() {
  const settings = await getStoreSettings();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-serif text-3xl font-bold text-stone-800">
          Configurações
        </h1>
        <p className="mt-1 text-stone-500">
          Defina o horário de funcionamento e os intervalos de retirada
          disponíveis no checkout.
        </p>
      </div>

      <ConfiguracoesClient initial={settings} />
    </div>
  );
}

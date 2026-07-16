import { PedidosBoard } from "./pedidos-board";

export const dynamic = "force-dynamic";

export default function PedidosPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-serif text-3xl font-bold text-stone-800">
          Pedidos
        </h1>
        <p className="mt-1 text-stone-500">
          Pedidos pendentes chegam e são impressos automaticamente. Clique em
          Concluir quando o preparo terminar.
        </p>
      </div>

      <PedidosBoard />
    </div>
  );
}

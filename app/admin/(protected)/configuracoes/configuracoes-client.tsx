"use client";

import { useMemo, useState, useTransition } from "react";
import { CheckCircle2, Loader2, Plus, Trash2 } from "lucide-react";

import { saveStoreSettings } from "@/app/admin/configuracoes/actions";
import type { StoreSettingsData } from "@/lib/store-settings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const SUGGESTED_SLOTS = [
  "12:00",
  "12:30",
  "13:00",
  "13:30",
  "14:00",
  "14:30",
  "15:00",
  "15:30",
  "16:00",
  "16:30",
  "17:00",
  "17:30",
  "18:00",
];

export function ConfiguracoesClient({
  initial,
}: {
  initial: StoreSettingsData;
}) {
  const [openTime, setOpenTime] = useState(initial.openTime);
  const [closeTime, setCloseTime] = useState(initial.closeTime);
  const [slots, setSlots] = useState<string[]>(
    [...initial.pickupSlots].sort()
  );
  const [customSlot, setCustomSlot] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [isPending, startTransition] = useTransition();

  const slotSet = useMemo(() => new Set(slots), [slots]);

  function toggleSuggested(slot: string) {
    setSlots((current) => {
      if (current.includes(slot)) {
        return current.filter((s) => s !== slot);
      }
      return [...current, slot].sort();
    });
    setSaved(false);
  }

  function addCustom() {
    const value = customSlot.trim();
    if (!/^\d{2}:\d{2}$/.test(value)) {
      setError("Use o formato HH:mm (ex.: 14:00).");
      return;
    }
    setError(null);
    setSlots((current) =>
      current.includes(value) ? current : [...current, value].sort()
    );
    setCustomSlot("");
    setSaved(false);
  }

  function handleSave(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const result = await saveStoreSettings({
        openTime,
        closeTime,
        pickupSlots: slots,
      });
      if (result.error) {
        setError(result.error);
        return;
      }
      setSaved(true);
    });
  }

  return (
    <form onSubmit={handleSave} className="mx-auto max-w-2xl space-y-8">
      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}
      {saved && (
        <p className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          <CheckCircle2 className="h-4 w-4" />
          Configurações salvas.
        </p>
      )}

      <section className="space-y-4 rounded-xl border border-stone-200 bg-white p-5">
        <div>
          <h2 className="font-serif text-lg font-bold text-stone-800">
            Horário de funcionamento
          </h2>
          <p className="mt-1 text-sm text-stone-500">
            Exibido no site e usado para validar os horários de retirada.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="openTime">Abertura</Label>
            <Input
              id="openTime"
              type="time"
              required
              value={openTime}
              onChange={(e) => {
                setOpenTime(e.target.value);
                setSaved(false);
              }}
              disabled={isPending}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="closeTime">Fechamento</Label>
            <Input
              id="closeTime"
              type="time"
              required
              value={closeTime}
              onChange={(e) => {
                setCloseTime(e.target.value);
                setSaved(false);
              }}
              disabled={isPending}
            />
          </div>
        </div>
      </section>

      <section className="space-y-4 rounded-xl border border-stone-200 bg-white p-5">
        <div>
          <h2 className="font-serif text-lg font-bold text-stone-800">
            Horários de retirada / encomenda
          </h2>
          <p className="mt-1 text-sm text-stone-500">
            O cliente só verá no checkout os horários marcados que estiverem
            dentro do funcionamento.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {SUGGESTED_SLOTS.map((slot) => {
            const active = slotSet.has(slot);
            return (
              <button
                key={slot}
                type="button"
                disabled={isPending}
                onClick={() => toggleSuggested(slot)}
                className={
                  active
                    ? "rounded-full border border-coffee-600 bg-coffee-600 px-3 py-1.5 text-sm font-medium text-white"
                    : "rounded-full border border-stone-200 bg-white px-3 py-1.5 text-sm font-medium text-stone-600 hover:border-coffee-300"
                }
              >
                {slot}
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap items-end gap-2">
          <div className="space-y-2">
            <Label htmlFor="customSlot">Adicionar horário</Label>
            <Input
              id="customSlot"
              type="time"
              value={customSlot}
              onChange={(e) => setCustomSlot(e.target.value)}
              disabled={isPending}
              className="w-36"
            />
          </div>
          <Button
            type="button"
            variant="outline"
            disabled={isPending || !customSlot}
            onClick={addCustom}
          >
            <Plus className="h-4 w-4" />
            Incluir
          </Button>
        </div>

        {slots.length > 0 && (
          <ul className="divide-y divide-stone-100 rounded-lg border border-stone-100">
            {slots.map((slot) => (
              <li
                key={slot}
                className="flex items-center justify-between px-3 py-2 text-sm"
              >
                <span className="font-medium text-stone-800">{slot}</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-stone-400 hover:text-red-600"
                  disabled={isPending}
                  aria-label={`Remover ${slot}`}
                  onClick={() => {
                    setSlots((current) => current.filter((s) => s !== slot));
                    setSaved(false);
                  }}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <Button
        type="submit"
        disabled={isPending}
        className="bg-coffee-600 text-white hover:bg-coffee-700"
      >
        {isPending ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Salvando…
          </>
        ) : (
          "Salvar configurações"
        )}
      </Button>
    </form>
  );
}

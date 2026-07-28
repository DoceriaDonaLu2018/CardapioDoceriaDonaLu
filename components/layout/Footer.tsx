import { CakeSlice, Clock, Instagram, MessageCircle } from "lucide-react";

import {
  STORE_ADDRESS,
  STORE_INSTAGRAM_URL,
  STORE_NAME,
  STORE_WHATSAPP_URL,
} from "@/lib/store-info";
import {
  formatStoreHoursLabel,
  getStoreSettings,
} from "@/lib/store-settings";

const socials = [
  {
    label: "Instagram",
    href: STORE_INSTAGRAM_URL,
    Icon: Instagram,
  },
  {
    label: "WhatsApp",
    href: STORE_WHATSAPP_URL,
    Icon: MessageCircle,
  },
];

export async function Footer() {
  const settings = await getStoreSettings();
  const hoursLabel = formatStoreHoursLabel(
    settings.openTime,
    settings.closeTime
  );

  return (
    <footer className="mt-16 border-t border-stone-200 bg-white">
      <div className="container flex flex-col items-center gap-6 py-10 text-center">
        <div className="flex items-center gap-2">
          <CakeSlice className="h-6 w-6 text-coffee-600" />
          <span className="font-serif text-lg font-semibold text-stone-800">
            {STORE_NAME}
          </span>
        </div>

        <p className="text-sm text-stone-500">
          Doces artesanais feitos com carinho em cada detalhe.
        </p>

        <p className="max-w-md text-sm text-stone-500">{STORE_ADDRESS}</p>

        <div className="flex items-center gap-4">
          {socials.map(({ label, href, Icon }) => (
            <a
              key={label}
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={label}
              className="flex h-10 w-10 items-center justify-center rounded-full border border-stone-200 text-stone-600 transition-colors hover:border-coffee-300 hover:bg-coffee-50 hover:text-coffee-700"
            >
              <Icon className="h-5 w-5" />
            </a>
          ))}
        </div>

        <p className="flex items-center gap-2 text-sm text-stone-600">
          <Clock className="h-4 w-4 shrink-0 text-coffee-600" aria-hidden />
          <span>{hoursLabel}</span>
        </p>

        <p className="text-xs text-stone-400">
          © {new Date().getFullYear()} {STORE_NAME}. Todos os direitos
          reservados.
        </p>
      </div>
    </footer>
  );
}

"use server";

import { checkStoreStatus } from "@/lib/store-status";

export async function getCartStoreStatus() {
  const status = await checkStoreStatus({ fulfillmentMode: "pickup" });
  return {
    isOpen: status.isOpen,
    message: status.message,
    nextOpenTime: status.nextOpenTime,
  };
}

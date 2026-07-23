export type OrderStatus = "draft" | "confirmed" | "processing" | "partially_allocated" | "allocated" | "packing" | "partially_shipped" | "shipped" | "delivered" | "cancelled";
export type ShipmentStatus = "draft" | "confirmed" | "packing" | "ready" | "dispatched" | "in_transit" | "arrived" | "out_for_delivery" | "delivered" | "cancelled";
export type TransportMode = "air" | "sea" | "road" | "local_delivery" | "customer_pickup" | "other";

export type AddressSnapshot = {
  recipient_name: string;
  phone: string;
  alternate_phone?: string;
  address_line_1: string;
  address_line_2?: string;
  area?: string;
  city: string;
  region?: string;
  postal_code?: string;
  country_code: string;
  delivery_instructions?: string;
  latitude?: number | null;
  longitude?: number | null;
  map_label?: string;
};

export type RoutePoint = { label: string; point_type: string; latitude: number; longitude: number; is_estimated: boolean; customer_visible: boolean };

export const money = (value: number | string | null | undefined, currency = "BDT") => new Intl.NumberFormat("en-BD", { style: "currency", currency, maximumFractionDigits: 2 }).format(Number(value ?? 0));
export const dateTime = (value: string | null | undefined) => value ? new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "—";
export const label = (value: string | null | undefined) => value ? value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase()) : "—";


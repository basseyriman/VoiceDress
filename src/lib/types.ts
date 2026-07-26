export type GarmentCategory =
  | "top"
  | "bottom"
  | "outerwear"
  | "shoes"
  | "accessory"
  | "dress"
  | "bag";

export type Formality = "casual" | "smart_casual" | "business" | "formal" | "black_tie";

export type CommerceSource =
  | "amazon"
  | "ebay"
  | "temu"
  | "shein"
  | "asos"
  | "zara"
  | "shopify"
  | "manual"
  | "receipt";

export interface Garment {
  id: string;
  userId: string;
  name: string;
  brand: string;
  category: GarmentCategory;
  colors: string[];
  hexColors: string[];
  fabric?: string;
  texture?: string;
  formality: Formality;
  season: ("spring" | "summer" | "autumn" | "winter" | "all")[];
  imageUrl: string;
  source: CommerceSource;
  purchaseDate?: string;
  price?: number;
  currency?: string;
  orderId?: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

export interface Outfit {
  id: string;
  userId: string;
  name: string;
  occasion: string;
  style: string;
  garmentIds: string[];
  garments?: Garment[];
  weatherSnapshot?: WeatherSnapshot;
  rationale: string;
  /** How to wear / layer the look — bullets for UI */
  stylingSteps?: string[];
  /** Speakable layering instructions */
  stylingGuide?: string;
  /** Prompt used to polish try-on drape/tuck/layering */
  stylingTryOnPrompt?: string;
  createdAt: string;
}

export interface WeatherSnapshot {
  tempC: number;
  condition: string;
  humidity: number;
  windKph: number;
  location: string;
  precipChance: number;
}

export interface CalendarEvent {
  id: string;
  title: string;
  start: string;
  end?: string;
  location?: string;
  formalityHint?: Formality;
}

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  photoURL?: string;
  avatarUrl?: string;
  avatarStatus?: "none" | "generating" | "ready" | "failed";
  city?: string;
  lat?: number;
  lon?: number;
  stylePrefs: string[];
  subscriptionStatus: "trialing" | "active" | "canceled" | "none";
  /** ISO end of free trial — server/webhook authoritative for paid status. */
  trialEndsAt?: string;
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
  connectedStores: CommerceSource[];
  voiceEnabled: boolean;
  createdAt: string;
}

export interface VoiceCommandResult {
  transcript: string;
  intent:
    | "suggest_outfit"
    | "swap_item"
    | "change_style"
    | "change_occasion"
    | "weather_check"
    | "open_wardrobe"
    | "explain_look"
    | "chat_look"
    | "open_page"
    | "add_from_photo"
    | "unknown";
  entities: {
    item?: string;
    style?: string;
    occasion?: string;
    replaceWith?: string;
    garmentQuery?: string;
    path?: string;
    garmentId?: string;
    tempC?: number;
    weatherLabel?: string;
    freshLook?: boolean;
  };
  reply: string;
  confidence?: "high" | "medium" | "low";
}

export interface WearLogEntry {
  at: string;
  garmentIds: string[];
}

export interface TasteMemory {
  rejectedIds: string[];
  recentOutfitIds: string[];
  preferredStyle?: string;
  /** Chronological wear log — drives “don’t repeat yesterday’s top/bottom”. */
  wearLog?: WearLogEntry[];
}

export interface CommerceConnection {
  source: CommerceSource;
  connected: boolean;
  lastSyncAt?: string;
  itemCount: number;
  status: "idle" | "syncing" | "error";
}

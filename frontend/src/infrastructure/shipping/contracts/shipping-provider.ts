/** Normalized internal shipping models — UI never sees provider-specific shapes. */
export interface ShippingRate {
  courier: string;
  service: string;
  cost: number;
  etd?: string;
}

export interface TrackingEvent {
  status: string;
  description: string;
  occurredAt: Date;
}

export interface ShippingProvider {
  readonly code: string;
  readonly capabilities: string[];
  getRates?(input: {
    destinationCity: string;
    weightGram: number;
  }): Promise<ShippingRate[]>;
  createShipment?(input: unknown): Promise<{ trackingNumber: string }>;
  cancelShipment?(trackingNumber: string): Promise<void>;
  trackShipment?(trackingNumber: string): Promise<TrackingEvent[]>;
}

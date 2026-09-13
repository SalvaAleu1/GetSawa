export interface PaymentOrderRequest {
  amountCents: number;
  currency: string;
  referenceId: string;
  description: string;
  idempotencyKey: string;
  returnUrl: string;
  cancelUrl: string;
}

export interface PaymentProvider {
  readonly name: string;
  isConfigured(): boolean;
  createOrder(params: PaymentOrderRequest): Promise<Record<string, any>>;
  captureOrder(providerOrderId: string, idempotencyKey: string): Promise<Record<string, any>>;
  getOrder(providerOrderId: string): Promise<Record<string, any>>;
  refundCapture(captureId: string, amountCents?: number, currency?: string, idempotencyKey?: string): Promise<Record<string, any>>;
}

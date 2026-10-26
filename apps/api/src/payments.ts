export interface PaymentGateway {
  confirm(input: { amountCents: number; currency: 'USD'; idempotencyKey: string }): Promise<{
    status: 'MOCK_CONFIRMED';
  }>;
}

export class MockPaymentGateway implements PaymentGateway {
  async confirm(input: { amountCents: number; currency: 'USD'; idempotencyKey: string }): Promise<{
    status: 'MOCK_CONFIRMED';
  }> {
    if (!Number.isSafeInteger(input.amountCents) || input.amountCents <= 0)
      throw new Error('Invalid order amount');
    return { status: 'MOCK_CONFIRMED' };
  }
}

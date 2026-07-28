import { BkashClient } from './client';

// Mock the global fetch
global.fetch = jest.fn();

describe('BkashClient', () => {
  const mockConfig = {
    baseURL: 'https://sandbox.bkash.com',
    appKey: 'test_key',
    appSecret: 'test_secret',
    username: 'test_user',
    password: 'test_password'
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const redis = require('@/lib/redis').getRedis();
    await redis.del('bkash_id_token', 'bkash_refresh_token');
  });

  it('should throw an error if initialized with missing config', () => {
    expect(() => new BkashClient({} as any)).toThrow('BkashClient requires baseURL, appKey, appSecret, username, password');
  });

  it('should initialize correctly with valid config', () => {
    const client = new BkashClient(mockConfig);
    expect(client).toBeDefined();
  });

  it('should call grantToken on first request when redis is empty', async () => {
    const client = new BkashClient(mockConfig);
    
    // Mock the grantToken fetch
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id_token: 'new_token', refresh_token: 'refresh', expires_in: '3600' })
    });
    
    // Mock the businessRequest fetch
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ statusMessage: 'Success' })
    });

    const res = await client.createPayment({
      amount: '100',
      payerReference: '01700000000',
      callbackURL: 'http://localhost/callback',
      merchantInvoiceNumber: 'INV-123'
    });

    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(res.statusMessage).toBe('Success');
  });

  it('should throw an error if grantToken fails', async () => {
    const client = new BkashClient(mockConfig);
    
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      text: async () => 'Unauthorized'
    });

    await expect(client.createPayment({
      amount: '100',
      payerReference: '123',
      callbackURL: 'url',
      merchantInvoiceNumber: 'INV'
    })).rejects.toThrow('bKash grant token failed: Unauthorized');
  });

  it('should execute payment correctly', async () => {
    const client = new BkashClient(mockConfig);
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id_token: 'new_token', refresh_token: 'refresh', expires_in: '3600' })
    });
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ paymentID: 'PAY123', statusMessage: 'Executed' })
    });

    const res = await client.executePayment('PAY123');
    expect(res.statusMessage).toBe('Executed');
  });

  it('should query payment correctly', async () => {
    const client = new BkashClient(mockConfig);
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id_token: 'new_token', refresh_token: 'refresh', expires_in: '3600' })
    });
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ paymentID: 'PAY123', transactionStatus: 'Completed' })
    });

    const res = await client.queryPayment('PAY123');
    expect(res.transactionStatus).toBe('Completed');
  });

  it('should strip trailing slash from baseURL', () => {
    const client = new BkashClient({ ...mockConfig, baseURL: 'https://sandbox.bkash.com/' });
    // @ts-ignore - access private field for testing
    expect(client.baseURL).toBe('https://sandbox.bkash.com');
  });

  it('should format createPayment payload correctly', async () => {
    const client = new BkashClient(mockConfig);
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id_token: 'token' })
    });
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({})
    });

    await client.createPayment({
      amount: '500',
      payerReference: '123',
      callbackURL: 'http://cb',
      merchantInvoiceNumber: 'INV-1'
    });

    const createCall = (global.fetch as jest.Mock).mock.calls[1];
    expect(createCall[0]).toBe('https://sandbox.bkash.com/checkout/create');
    const body = JSON.parse(createCall[1].body);
    expect(body.amount).toBe('500');
    expect(body.intent).toBe('sale');
  });
});

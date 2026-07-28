/**
 * bKash PRA Tokenized Checkout Client
 * 
 * Adapted for TypeScript in Next.js from the reference bkash_client.js.
 */
import { getRedis } from "@/lib/redis";
import type { Redis } from "@upstash/redis";

export interface BkashConfig {
  baseURL: string;
  appKey: string;
  appSecret: string;
  username: string;
  password: string;
}

export class BkashClient {
  private baseURL: string;
  private appKey: string;
  private appSecret: string;
  private username: string;
  private password: string;
  private redis: Redis;

  constructor(config: BkashConfig) {
    if (!config.baseURL || !config.appKey || !config.appSecret || !config.username || !config.password) {
      throw new Error("BkashClient requires baseURL, appKey, appSecret, username, password");
    }
    this.baseURL = config.baseURL.replace(/\/$/, "");
    this.appKey = config.appKey;
    this.appSecret = config.appSecret;
    this.username = config.username;
    this.password = config.password;
    this.redis = getRedis();
  }

  // --- Token Management ---

  private async grantToken() {
    const res = await fetch(`${this.baseURL}/checkout/token/grant`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        username: this.username,
        password: this.password,
      },
      body: JSON.stringify({ app_key: this.appKey, app_secret: this.appSecret }),
    });
    
    if (!res.ok) {
       const text = await res.text();
       throw new Error(`bKash grant token failed: ${text}`);
    }
    
    const data = await res.json();
    if (data.id_token) {
      await this.storeToken(data);
    }
    return data;
  }

  private async refreshTokenCall(refreshToken: string) {
    const res = await fetch(`${this.baseURL}/checkout/token/refresh`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        username: this.username,
        password: this.password,
      },
      body: JSON.stringify({
        app_key: this.appKey,
        app_secret: this.appSecret,
        refresh_token: refreshToken,
      }),
    });
    
    if (!res.ok) {
       const text = await res.text();
       throw new Error(`bKash refresh token failed: ${text}`);
    }

    const data = await res.json();
    if (data.id_token) {
      await this.storeToken(data);
    }
    return data;
  }

  private async storeToken(data: any) {
    if (!data || !data.id_token) return;
    
    const idToken = data.id_token;
    const refreshToken = data.refresh_token;
    
    // Refresh 5 minutes early
    const expiresInSecs = parseInt(data.expires_in, 10);
    const ttl = Math.max(expiresInSecs - 300, 60); 

    await this.redis.set("bkash_id_token", idToken, { ex: ttl });
    // Keep refresh token around longer than id_token
    await this.redis.set("bkash_refresh_token", refreshToken, { ex: expiresInSecs * 2 });
  }

  private async getToken(): Promise<string> {
    const cachedIdToken = await this.redis.get<string>("bkash_id_token");
    if (cachedIdToken) {
      return cachedIdToken;
    }

    const cachedRefreshToken = await this.redis.get<string>("bkash_refresh_token");
    if (cachedRefreshToken) {
      try {
        const data = await this.refreshTokenCall(cachedRefreshToken);
        if (data.id_token) return data.id_token;
      } catch (e) {
        console.warn("bKash refresh token failed, falling back to grant token:", e);
      }
    }

    const data = await this.grantToken();
    return data.id_token;
  }

  // --- Core Requests ---

  private async businessRequest(path: string, body: any) {
    const token = await this.getToken();
    const res = await fetch(`${this.baseURL}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: token,
        "X-APP-Key": this.appKey,
      },
      body: JSON.stringify(body),
    });
    
    return res.json();
  }

  public async createPayment(p: {
    amount: string;
    payerReference: string;
    callbackURL: string;
    merchantInvoiceNumber: string;
  }) {
    return this.businessRequest("/checkout/create", {
      mode: "0011",
      payerReference: p.payerReference,
      callbackURL: p.callbackURL,
      amount: String(p.amount),
      currency: "BDT",
      intent: "sale",
      merchantInvoiceNumber: p.merchantInvoiceNumber,
    });
  }

  public async executePayment(paymentID: string) {
    return this.businessRequest("/checkout/execute", { paymentID });
  }

  public async queryPayment(paymentID: string) {
    return this.businessRequest("/checkout/payment/status", { paymentID });
  }
}

// Singleton instance
let bkashClientInstance: BkashClient | null = null;

export function getBkashClient() {
  if (!bkashClientInstance) {
    bkashClientInstance = new BkashClient({
      baseURL: process.env.BKASH_BASE_URL!,
      appKey: process.env.BKASH_APP_KEY!,
      appSecret: process.env.BKASH_APP_SECRET!,
      username: process.env.BKASH_USERNAME!,
      password: process.env.BKASH_PASSWORD!,
    });
  }
  return bkashClientInstance;
}

import { getRedis, CacheKeys, CacheTTL } from './redis';

describe('Redis Cache Client', () => {
  beforeEach(() => {
    // Clear the memory store if using the fallback
    process.env.UPSTASH_REDIS_REST_URL = '';
    process.env.UPSTASH_REDIS_REST_TOKEN = '';
  });

  it('should create an in-memory fallback when env vars are missing', async () => {
    const redis = getRedis();
    expect(redis).toBeDefined();
    
    await redis.set('test-key', 'hello');
    const val = await redis.get('test-key');
    expect(val).toBe('hello');
  });

  it('should support object serialization in memory fallback', async () => {
    const redis = getRedis();
    const obj = { foo: 'bar', num: 42 };
    
    await redis.set('test-obj', obj);
    const val = await redis.get('test-obj');
    expect(val).toEqual(obj);
  });

  it('should correctly build cache keys', () => {
    expect(CacheKeys.leaderboard('exam123')).toBe('leaderboard:exam123:v0:p1');
    expect(CacheKeys.examDraft('exam1', 'user1', 'q1')).toBe('exam:exam1:submission:user1:q1');
  });

  it('should expose correct Cache TTL constants', () => {
    expect(CacheTTL.LEADERBOARD).toBe(3600);
    expect(CacheTTL.TEST_DRAFT).toBe(172800);
  });

  it('should support del in memory fallback', async () => {
    const redis = getRedis();
    await redis.set('to-delete', '123');
    const count = await redis.del('to-delete');
    expect(count).toBe(1);
    const val = await redis.get('to-delete');
    expect(val).toBeNull();
  });

  it('should support exists in memory fallback', async () => {
    const redis = getRedis();
    await redis.set('to-exist', '123');
    const count = await redis.exists('to-exist');
    expect(count).toBe(1);
  });

  it('should handle ttl and expire in memory fallback', async () => {
    const redis = getRedis();
    await redis.set('to-expire', '123');
    await redis.expire('to-expire', 10);
    const ttl = await redis.ttl('to-expire');
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(10);
  });
});

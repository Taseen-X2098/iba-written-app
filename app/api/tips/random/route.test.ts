import { GET } from './route';
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// Mock the Supabase server client
jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn()
}));

describe('GET /api/tips/random', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should return a random tip when tips exist', async () => {
    // Setup the mock to return dummy tips
    const mockTips = [
      { id: '1', content: 'Tip 1' },
      { id: '2', content: 'Tip 2' },
    ];
    
    const mockEq = jest.fn().mockResolvedValue({ data: mockTips, error: null });
    const mockSelect = jest.fn().mockReturnValue({ eq: mockEq });
    const mockFrom = jest.fn().mockReturnValue({ select: mockSelect });
    
    (createClient as jest.Mock).mockResolvedValue({
      from: mockFrom
    });

    const response = await GET();
    const json = await response.json();

    expect(response).toBeInstanceOf(NextResponse);
    expect(json).toHaveProperty('tip');
    expect(mockTips.map(t => t.id)).toContain(json.tip.id);
  });

  it('should return null tip when no tips exist', async () => {
    const mockEq = jest.fn().mockResolvedValue({ data: [], error: null });
    const mockSelect = jest.fn().mockReturnValue({ eq: mockEq });
    const mockFrom = jest.fn().mockReturnValue({ select: mockSelect });
    
    (createClient as jest.Mock).mockResolvedValue({
      from: mockFrom
    });

    const response = await GET();
    const json = await response.json();

    expect(json.tip).toBeNull();
  });

  it('should return null tip when there is a database error', async () => {
    const mockEq = jest.fn().mockResolvedValue({ data: null, error: { message: 'DB Error' } });
    const mockSelect = jest.fn().mockReturnValue({ eq: mockEq });
    const mockFrom = jest.fn().mockReturnValue({ select: mockSelect });
    
    (createClient as jest.Mock).mockResolvedValue({
      from: mockFrom
    });

    const response = await GET();
    const json = await response.json();

    expect(json.tip).toBeNull();
  });
});

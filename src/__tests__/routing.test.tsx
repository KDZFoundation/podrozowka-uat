import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import NotFound from '@/pages/NotFound';

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
      onAuthStateChange: vi.fn().mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
    },
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({ data: [], error: null }),
        in: vi.fn().mockReturnValue({ data: [], error: null }),
        order: vi.fn().mockReturnValue({ data: [], error: null }),
        single: vi.fn().mockReturnValue({ data: null, error: null }),
      }),
    }),
  },
}));

describe('Routing', () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  it('NotFound page renders for unknown route', () => {
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/nieistniejaca-strona']}>
          <Routes>
            <Route path="*" element={<NotFound />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    );
    
    expect(screen.getByText(/404/i)).toBeDefined();
  });

  it('NotFound contains a link back to home', () => {
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/nieistniejaca-strona']}>
          <Routes>
            <Route path="*" element={<NotFound />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    );
    
    const link = screen.getByRole('link');
    expect(link.getAttribute('href')).toBe('/');
  });
});

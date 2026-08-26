import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { CartProvider, useCart } from '@/contexts/CartContext';
import { ReactNode } from 'react';

// In-memory localStorage mock for jsdom environments that lack a working Storage
const createLocalStorageMock = () => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, value: string) => { store[key] = value; }),
    removeItem: vi.fn((key: string) => { delete store[key]; }),
    clear: vi.fn(() => { store = {}; }),
    get length() { return Object.keys(store).length; },
    key: vi.fn((i: number) => Object.keys(store)[i] ?? null),
  };
};

const wrapper = ({ children }: { children: ReactNode }) => (
  <CartProvider>{children}</CartProvider>
);

describe('CartContext', () => {
  beforeEach(() => {
    const mock = createLocalStorageMock();
    vi.stubGlobal('localStorage', mock);
    Object.defineProperty(window, 'localStorage', { value: mock, writable: true });
  });

  it('starts with empty cart', () => {
    const { result } = renderHook(() => useCart(), { wrapper });
    expect(result.current.items).toEqual([]);
    expect(result.current.totalCount).toBe(0);
  });

  it('addItem adds a single item', () => {
    const { result } = renderHook(() => useCart(), { wrapper });
    act(() => {
      result.current.addItem('prod-1', 1);
    });
    expect(result.current.items).toEqual([{ card_design_id: 'prod-1', quantity: 1 }]);
    expect(result.current.totalCount).toBe(1);
  });

  it('addItem increments quantity for existing item', () => {
    const { result } = renderHook(() => useCart(), { wrapper });
    act(() => {
      result.current.addItem('prod-1', 1);
      result.current.addItem('prod-1', 2);
    });
    expect(result.current.items).toEqual([{ card_design_id: 'prod-1', quantity: 3 }]);
    expect(result.current.totalCount).toBe(3);
  });

  it('stores a product snapshot for a cart item', () => {
    const { result } = renderHook(() => useCart(), { wrapper });
    const snapshot = {
      title: 'Podróżówka Tajlandia, A V01 TH',
      image_front_url: 'https://example.com/tajlandia.jpg',
      price_grosze: 499,
      currency: 'PLN',
      country_name: 'Tajlandia',
    };
    act(() => {
      result.current.addItem('prod-1', 1, undefined, snapshot);
    });
    expect(result.current.items).toEqual([
      { card_design_id: 'prod-1', quantity: 1, product: snapshot },
    ]);
  });

  it('addItem respects maxQuantity', () => {
    const { result } = renderHook(() => useCart(), { wrapper });
    act(() => {
      result.current.addItem('prod-1', 5, 10);
      result.current.addItem('prod-1', 6, 10);
    });
    expect(result.current.items).toEqual([{ card_design_id: 'prod-1', quantity: 10 }]);
  });

  it('removeItem removes the correct item', () => {
    const { result } = renderHook(() => useCart(), { wrapper });
    act(() => {
      result.current.addItem('prod-1', 1);
      result.current.addItem('prod-2', 2);
      result.current.removeItem('prod-1');
    });
    expect(result.current.items).toEqual([{ card_design_id: 'prod-2', quantity: 2 }]);
  });

  it('removeItem on non-existent item does nothing', () => {
    const { result } = renderHook(() => useCart(), { wrapper });
    act(() => {
      result.current.addItem('prod-1', 1);
      result.current.removeItem('prod-2');
    });
    expect(result.current.items).toEqual([{ card_design_id: 'prod-1', quantity: 1 }]);
  });

  it('setQuantity updates quantity', () => {
    const { result } = renderHook(() => useCart(), { wrapper });
    act(() => {
      result.current.addItem('prod-1', 1);
      result.current.setQuantity('prod-1', 5);
    });
    expect(result.current.items).toEqual([{ card_design_id: 'prod-1', quantity: 5 }]);
  });

  it('setQuantity with 0 removes item', () => {
    const { result } = renderHook(() => useCart(), { wrapper });
    act(() => {
      result.current.addItem('prod-1', 1);
      result.current.setQuantity('prod-1', 0);
    });
    expect(result.current.items).toEqual([]);
  });

  it('setQuantity with negative removes item', () => {
    const { result } = renderHook(() => useCart(), { wrapper });
    act(() => {
      result.current.addItem('prod-1', 1);
      result.current.setQuantity('prod-1', -5);
    });
    expect(result.current.items).toEqual([]);
  });

  it('clear empties all items', () => {
    const { result } = renderHook(() => useCart(), { wrapper });
    act(() => {
      result.current.addItem('prod-1', 1);
      result.current.addItem('prod-2', 2);
      result.current.clear();
    });
    expect(result.current.items).toEqual([]);
    expect(result.current.totalCount).toBe(0);
  });

  it('totalCount sums all quantities correctly', () => {
    const { result } = renderHook(() => useCart(), { wrapper });
    act(() => {
      result.current.addItem('prod-1', 2);
      result.current.addItem('prod-2', 3);
      result.current.addItem('prod-3', 1);
    });
    expect(result.current.totalCount).toBe(6);
  });

  it('getQuantity returns 0 for unknown item', () => {
    const { result } = renderHook(() => useCart(), { wrapper });
    expect(result.current.getQuantity('unknown')).toBe(0);
  });

  it('getQuantity returns correct quantity for known item', () => {
    const { result } = renderHook(() => useCart(), { wrapper });
    act(() => {
      result.current.addItem('prod-1', 4);
    });
    expect(result.current.getQuantity('prod-1')).toBe(4);
  });

  it('multiple items can coexist', () => {
    const { result } = renderHook(() => useCart(), { wrapper });
    act(() => {
      result.current.addItem('prod-1', 1);
      result.current.addItem('prod-2', 2);
    });
    expect(result.current.items).toHaveLength(2);
    expect(result.current.items).toContainEqual({ card_design_id: 'prod-1', quantity: 1 });
    expect(result.current.items).toContainEqual({ card_design_id: 'prod-2', quantity: 2 });
  });

  it('keeps language variants of the same postcard as separate cart lines', () => {
    const { result } = renderHook(() => useCart(), { wrapper });
    const catalan = { code: 'ca', name: 'Kataloński', front_text: 'GRÀCIES PER FORMAR PART DEL MEU VIATGE', back_text: 'Escaneja el codi QR' };
    act(() => {
      result.current.addItem('prod-es', 2);
      result.current.addItem('prod-es', 3, undefined, undefined, catalan);
    });

    expect(result.current.items).toHaveLength(2);
    expect(result.current.getQuantity('prod-es')).toBe(2);
    expect(result.current.getQuantity('prod-es', 'ca')).toBe(3);
  });

  it('sets primary and secondary languages for a cart line without changing its quantity', () => {
    const { result } = renderHook(() => useCart(), { wrapper });
    const spanish = { code: 'es', name: 'Hiszpański', front_text: 'GRACIAS', back_text: 'Escanea el código QR' };
    const basque = { code: 'eu', name: 'Baskijski', front_text: 'ESKERRIK ASKO NIRE BIDAIAREN PARTE IZATEAGATIK' };
    act(() => {
      result.current.addItem('prod-es', 4);
      result.current.setLanguages('prod-es', spanish, basque);
    });

    expect(result.current.items).toEqual([
      { card_design_id: 'prod-es', quantity: 4, primary_language: spanish, secondary_language: basque },
    ]);
    expect(result.current.getQuantity('prod-es', 'es', 'eu')).toBe(4);
  });

  it('merges quantities when a cart language change matches an existing variant', () => {
    const { result } = renderHook(() => useCart(), { wrapper });
    const catalan = { code: 'ca', name: 'Kataloński', front_text: 'GRÀCIES', back_text: 'Escaneja el codi QR' };
    act(() => {
      result.current.addItem('prod-es', 2);
      result.current.addItem('prod-es', 3, undefined, undefined, catalan);
      result.current.setLanguages('prod-es', catalan);
    });

    expect(result.current.items).toEqual([
      { card_design_id: 'prod-es', quantity: 5, primary_language: catalan },
    ]);
  });

  it('localStorage persistence (mock localStorage)', () => {
    const { result, unmount } = renderHook(() => useCart(), { wrapper });
    act(() => {
      result.current.addItem('prod-saved', 3);
    });
    
    // Unmount and re-render to check if it reads from localStorage
    unmount();
    
    const { result: newResult } = renderHook(() => useCart(), { wrapper });
    expect(newResult.current.items).toEqual([{ card_design_id: 'prod-saved', quantity: 3 }]);
  });
});

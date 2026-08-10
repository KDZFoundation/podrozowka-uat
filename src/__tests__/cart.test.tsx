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

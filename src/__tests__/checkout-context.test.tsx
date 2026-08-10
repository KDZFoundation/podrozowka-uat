import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { CheckoutProvider, useCheckout } from '@/contexts/CheckoutContext';
import { ReactNode } from 'react';

const wrapper = ({ children }: { children: ReactNode }) => (
  <CheckoutProvider>{children}</CheckoutProvider>
);

describe('CheckoutContext', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it('starts with null pickup point', () => {
    const { result } = renderHook(() => useCheckout(), { wrapper });
    expect(result.current.pickupPoint).toBeNull();
  });

  it('setPickupPoint stores the point', () => {
    const { result } = renderHook(() => useCheckout(), { wrapper });
    const point = {
      name: 'POP-WAW123',
      line1: 'Test St 1',
      line2: '00-000 Warsaw'
    };
    act(() => {
      result.current.setPickupPoint(point);
    });
    expect(result.current.pickupPoint).toEqual(point);
  });

  it('clearPickupPoint resets to null', () => {
    const { result } = renderHook(() => useCheckout(), { wrapper });
    const point = {
      name: 'POP-WAW123',
      line1: 'Test St 1',
      line2: '00-000 Warsaw'
    };
    act(() => {
      result.current.setPickupPoint(point);
      result.current.clearPickupPoint();
    });
    expect(result.current.pickupPoint).toBeNull();
  });

  it('sessionStorage persistence', () => {
    const { result, unmount } = renderHook(() => useCheckout(), { wrapper });
    const point = {
      name: 'POP-PERSIST',
      line1: 'Persist St',
      line2: '11-111 City'
    };
    act(() => {
      result.current.setPickupPoint(point);
    });
    
    unmount();
    
    const { result: newResult } = renderHook(() => useCheckout(), { wrapper });
    expect(newResult.current.pickupPoint).toEqual(point);
  });
});

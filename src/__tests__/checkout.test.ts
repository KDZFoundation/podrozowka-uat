import { describe, it, expect } from 'vitest';
import {
  validateCourierAddress,
  isCourierAddressValid,
  emptyCourierAddress,
  getShippingCostGrosze,
  SHIPPING_COST_GROSZE,
  COD_SHIPPING_COST_GROSZE,
  isCourierShippingMethod,
  isPickupShippingMethod,
  pickupProviderForMethod,
  shippingMethodLabel,
} from '@/lib/constants';

describe('Checkout Validation and Logic', () => {
  it('validateCourierAddress returns errors for all empty fields', () => {
    const errors = validateCourierAddress(emptyCourierAddress());
    expect(errors).toHaveProperty('name');
    expect(errors).toHaveProperty('street');
    expect(errors).toHaveProperty('postal_code');
    expect(errors).toHaveProperty('city');
    expect(errors).toHaveProperty('phone');
  });

  it('validateCourierAddress returns no errors for valid address', () => {
    const validAddr = {
      name: 'John Doe',
      street: 'Main St 123',
      postal_code: '00-000',
      city: 'Warsaw',
      phone: '600000000',
    };
    const errors = validateCourierAddress(validAddr);
    expect(Object.keys(errors).length).toBe(0);
  });

  it('postal code validation: valid "00-000" format passes', () => {
    const validAddr = {
      name: 'John',
      street: 'Street',
      postal_code: '12-345',
      city: 'City',
      phone: '600000000',
    };
    const errors = validateCourierAddress(validAddr);
    expect(errors.postal_code).toBeUndefined();
  });

  it('postal code validation: "00000" (no dash) fails', () => {
    const invalidAddr = {
      name: 'John',
      street: 'Street',
      postal_code: '12345',
      city: 'City',
      phone: '600000000',
    };
    const errors = validateCourierAddress(invalidAddr);
    expect(errors.postal_code).toBeDefined();
  });

  it('postal code validation: "1-234" fails', () => {
    const invalidAddr = {
      name: 'John',
      street: 'Street',
      postal_code: '1-234',
      city: 'City',
      phone: '600000000',
    };
    const errors = validateCourierAddress(invalidAddr);
    expect(errors.postal_code).toBeDefined();
  });

  it('phone validation: "600000000" passes (9 digits)', () => {
    const validAddr = {
      name: 'John',
      street: 'Street',
      postal_code: '12-345',
      city: 'City',
      phone: '600000000',
    };
    const errors = validateCourierAddress(validAddr);
    expect(errors.phone).toBeUndefined();
  });

  it('phone validation: "+48600000000" passes', () => {
    const validAddr = {
      name: 'John',
      street: 'Street',
      postal_code: '12-345',
      city: 'City',
      phone: '+48600000000',
    };
    const errors = validateCourierAddress(validAddr);
    expect(errors.phone).toBeUndefined();
  });

  it('phone validation: "123" fails (too short)', () => {
    const invalidAddr = {
      name: 'John',
      street: 'Street',
      postal_code: '12-345',
      city: 'City',
      phone: '123',
    };
    const errors = validateCourierAddress(invalidAddr);
    expect(errors.phone).toBeDefined();
  });

  it('name max length 200 validation', () => {
    const invalidAddr = {
      name: 'A'.repeat(201),
      street: 'Street',
      postal_code: '12-345',
      city: 'City',
      phone: '600000000',
    };
    const errors = validateCourierAddress(invalidAddr);
    expect(errors.name).toBeDefined();
  });

  it('street max length 300 validation', () => {
    const invalidAddr = {
      name: 'John',
      street: 'B'.repeat(301),
      postal_code: '12-345',
      city: 'City',
      phone: '600000000',
    };
    const errors = validateCourierAddress(invalidAddr);
    expect(errors.street).toBeDefined();
  });

  it('city max length 100 validation', () => {
    const invalidAddr = {
      name: 'John',
      street: 'Street',
      postal_code: '12-345',
      city: 'C'.repeat(101),
      phone: '600000000',
    };
    const errors = validateCourierAddress(invalidAddr);
    expect(errors.city).toBeDefined();
  });

  it('isCourierAddressValid returns true for valid address', () => {
    const validAddr = {
      name: 'John Doe',
      street: 'Main St 123',
      postal_code: '00-000',
      city: 'Warsaw',
      phone: '600000000',
    };
    expect(isCourierAddressValid(validAddr)).toBe(true);
  });

  it('isCourierAddressValid returns false for empty address', () => {
    expect(isCourierAddressValid(emptyCourierAddress())).toBe(false);
  });

  it('emptyCourierAddress returns object with all empty strings', () => {
    const empty = emptyCourierAddress();
    expect(empty).toEqual({
      name: '',
      street: '',
      postal_code: '',
      city: '',
      phone: '',
    });
  });

  it('getShippingCostGrosze returns 1399 for online', () => {
    expect(getShippingCostGrosze('online')).toBe(1399);
  });

  it('getShippingCostGrosze returns 1699 for cod', () => {
    expect(getShippingCostGrosze('cod')).toBe(1699);
  });

  it('SHIPPING_COST_GROSZE and COD_SHIPPING_COST_GROSZE are correct values', () => {
    expect(SHIPPING_COST_GROSZE).toBe(1399);
    expect(COD_SHIPPING_COST_GROSZE).toBe(1699);
  });

  it('defines all five delivery methods with clear labels', () => {
    expect([
      shippingMethodLabel('inpost_locker'),
      shippingMethodLabel('inpost_courier'),
      shippingMethodLabel('orlen_paczka'),
      shippingMethodLabel('pocztex_courier'),
      shippingMethodLabel('pocztex_point'),
    ]).toEqual([
      'InPost Paczkomat 24/7',
      'InPost Kurier',
      'ORLEN Paczka',
      'Pocztex Kurier',
      'Pocztex Punkt',
    ]);
  });

  it('distinguishes pickup-point and courier delivery methods', () => {
    expect(pickupProviderForMethod('inpost_locker')).toBe('inpost');
    expect(pickupProviderForMethod('orlen_paczka')).toBe('orlen');
    expect(pickupProviderForMethod('pocztex_point')).toBe('pocztex');
    expect(isPickupShippingMethod('pocztex_point')).toBe(true);
    expect(isCourierShippingMethod('inpost_courier')).toBe(true);
    expect(isCourierShippingMethod('pocztex_courier')).toBe(true);
  });
});

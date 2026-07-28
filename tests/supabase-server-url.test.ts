import test from 'node:test';
import assert from 'node:assert/strict';

import { normalizeSupabaseServerUrl } from '../lib/services/supabase-server-url';

test('serverová Supabase URL přijímá pouze HTTPS origin nebo lokální HTTP origin', () => {
  assert.equal(normalizeSupabaseServerUrl('https://example.supabase.co')?.toString(), 'https://example.supabase.co/');
  assert.equal(normalizeSupabaseServerUrl('https://example.supabase.co/')?.toString(), 'https://example.supabase.co/');
  assert.equal(normalizeSupabaseServerUrl('http://localhost:54321')?.toString(), 'http://localhost:54321/');
  assert.equal(normalizeSupabaseServerUrl('http://127.0.0.1:54321')?.toString(), 'http://127.0.0.1:54321/');
  assert.equal(normalizeSupabaseServerUrl('http://[::1]:54321')?.toString(), 'http://[::1]:54321/');
});

test('serverová Supabase URL fail-closed odmítá nečistou origin URL', () => {
  for (const value of [
    'not-url',
    'http://example.supabase.co',
    'https://user:password@example.supabase.co',
    'https://example.supabase.co?token=abc',
    'https://example.supabase.co/?',
    'https://example.supabase.co#fragment',
    'https://example.supabase.co/#',
    'https://example.supabase.co/neco',
  ]) {
    assert.equal(normalizeSupabaseServerUrl(value), null);
  }
});

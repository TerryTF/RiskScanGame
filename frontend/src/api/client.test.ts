import { describe, expect, it, vi } from 'vitest';
import { ApiError, createClient } from './client';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

describe('createClient', () => {
  it('sends JSON to the versioned API and encodes the game id', async () => {
    const send = vi.fn().mockResolvedValue(json({ id: 'g 1' }));
    const client = createClient({ baseUrl: 'http://api.test', fetch: send });

    await client.setElements('g 1', ['Beach tourism', 'Housing']);

    expect(send).toHaveBeenCalledWith('http://api.test/api/v1/games/g%201/elements', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ elements: [{ name: 'Beach tourism' }, { name: 'Housing' }] }),
    });
  });

  it('posts round steps and the finish command without a body', async () => {
    const send = vi.fn().mockImplementation(() => Promise.resolve(json({})));
    const client = createClient({ fetch: send });

    await client.runStep('g1', 2, 'resolve-hazards');
    await client.finishGame('g1');

    expect(send).toHaveBeenNthCalledWith(1, '/api/v1/games/g1/rounds/2/resolve-hazards', {
      method: 'POST',
      headers: undefined,
      body: undefined,
    });
    expect(send).toHaveBeenNthCalledWith(2, '/api/v1/games/g1/finish', {
      method: 'POST',
      headers: undefined,
      body: undefined,
    });
  });

  it('sends action payments as the API expects them', async () => {
    const send = vi.fn().mockResolvedValue(json({}));
    const client = createClient({ fetch: send });

    await client.reduceEmissions('g1', [{ team: 'civil_society', money: 0, knowledge: 1, authority: 0 }]);

    const [url, init] = send.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/v1/games/g1/actions/reduce-emissions');
    expect(JSON.parse(init.body as string)).toEqual({
      payments: [{ team: 'civil_society', money: 0, knowledge: 1, authority: 0 }],
    });
  });

  it('uses the message of a domain error', async () => {
    const send = vi.fn().mockResolvedValue(json({ detail: 'Round 1 is in ACTION_PHASE.' }, 409));
    const client = createClient({ fetch: send });

    const error = await client.getGame('g1').catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 409, message: 'Round 1 is in ACTION_PHASE.' });
  });

  it('formats request validation errors with the field name', async () => {
    const detail = [{ loc: ['body', 'elements'], msg: 'List should have at least 4 items after validation, not 1' }];
    const client = createClient({ fetch: vi.fn().mockResolvedValue(json({ detail }, 422)) });

    await expect(client.setElements('g1', ['A'])).rejects.toMatchObject({
      status: 422,
      message: 'elements: List should have at least 4 items after validation, not 1',
    });
  });

  it('explains that the server cannot be reached', async () => {
    const client = createClient({ fetch: vi.fn().mockRejectedValue(new TypeError('Failed to fetch')) });

    await expect(client.catalogue()).rejects.toMatchObject({
      status: 0,
      message: expect.stringContaining('Cannot reach the game server'),
    });
  });

  it('falls back to a generic message when the error body is not JSON', async () => {
    const client = createClient({ fetch: vi.fn().mockResolvedValue(new Response('Bad gateway', { status: 502 })) });

    await expect(client.getGame('g1')).rejects.toMatchObject({ status: 502, message: 'The request failed (502).' });
  });
});

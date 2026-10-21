import assert from 'node:assert/strict';
import test from 'node:test';
import { activitiesResultSchema } from '../dist/activities.js';
import { GarminActivitiesClient, loadApiKey } from '../dist/garmin.js';

const apiKey = 'test-secret-key';
const token = 'header.' + Buffer.from(JSON.stringify({ exp: Date.now() / 1000 + 3600 })).toString('base64url') + '.signature';
const fixture = {
  activityId: 1234,
  activityName: 'Corrida na Rua Privada',
  description: 'Saída da minha casa',
  locationName: 'Local privado',
  startLatitude: -20,
  startLongitude: -45,
  endLatitude: -21,
  endLongitude: -46,
  ownerFullName: 'Pessoa privada',
  ownerProfileImageUrlLarge: 'https://example.invalid/private.png',
  futureSensitiveField: { token: apiKey, email: 'private@example.invalid' },
  startTimeLocal: '2026-10-20 07:05:18',
  activityType: { typeKey: 'strength_training', typeId: 13, location: 'private' },
  calories: 400,
  bmrCalories: 60,
  duration: 1800,
  distance: 2500,
  averageHR: 120,
  maxHR: 160,
  totalSets: 3,
  totalReps: 30,
  summarizedExerciseSets: [{
    category: 'SQUAT', subCategory: 'BARBELL_BACK_SQUAT',
    reps: 30, sets: 3, duration: 180000, maxWeight: 40000,
    location: 'private', deviceSerialNumber: 'private',
  }],
};

function mockGarmin(activities = [fixture]) {
  const calls = [];
  const request = async (url, options) => {
    calls.push({ url: String(url), options });
    if (url.endsWith('/personal-api-key/token')) return new Response(token);
    return Response.json(activities);
  };
  return { client: new GarminActivitiesClient(apiKey, request), calls };
}

test('requires only GARMIN_CONNECT_API_KEY and never includes its value in errors', () => {
  assert.equal(loadApiKey({ GARMIN_CONNECT_API_KEY: apiKey }), apiKey);
  for (const environment of [{}, { GARMIN_CONNECT_API_KEY: '' }, { GARMIN_CONNECT_API_KEY: apiKey + '\n' }]) {
    assert.throws(() => loadApiKey(environment), error => {
      assert.match(error.message, /GARMIN_CONNECT_API_KEY/);
      assert.equal(error.message.includes(apiKey), false);
      return true;
    });
  }
});

test('returns a trainer report with correct units and excludes private or new fields', async () => {
  const { client } = mockGarmin();
  const result = await client.recentActivities(1);
  assert.equal(activitiesResultSchema.safeParse(result).success, true);
  assert.deepEqual(result.activities[0], {
    date: '2026-10-20', sport: 'strength_training', durationMinutes: 30, distanceKm: 2.5,
    calories: { totalKcal: 400, restingKcal: 60, activeKcal: 340 },
    heartRateBpm: { average: 120, maximum: 160 },
    trainingEffect: { aerobic: null, anaerobic: null },
    intensityMinutes: { moderate: null, vigorous: null },
    sets: 3, repetitions: 30,
    exercises: [{ category: 'SQUAT', exercise: 'BARBELL_BACK_SQUAT', sets: 3,
      repetitions: 30, durationMinutes: 3, maximumWeightKg: 40 }],
  });
  const text = JSON.stringify(result);
  for (const privateValue of ['Privada', 'privado', 'private', apiKey, '07:05:18']) {
    assert.equal(text.includes(privateValue), false);
  }
});

test('missing or inconsistent calories stay unknown instead of overstating active expenditure', async () => {
  const { client } = mockGarmin([
    { ...fixture, bmrCalories: undefined },
    { ...fixture, calories: 10, bmrCalories: 20 },
    { ...fixture, calories: 0, bmrCalories: 0 },
  ]);
  const result = await client.recentActivities();
  assert.equal(result.activities[0].calories.activeKcal, null);
  assert.equal(result.activities[1].calories.activeKcal, null);
  assert.equal(result.activities[2].calories.activeKcal, 0);
});

test('calls only authentication and the activity-list endpoint, reusing the token', async () => {
  const { client, calls } = mockGarmin([]);
  await client.recentActivities(3);
  await client.recentActivities(2);
  assert.equal(calls.length, 3);
  assert.equal(calls[0].options.method, 'POST');
  assert.equal(calls[0].options.headers.Accept, undefined);
  assert.equal(calls[0].options.headers.Authorization, 'ApiKey ' + apiKey);
  for (const call of calls) {
    assert.equal(new URL(call.url).origin, 'https://personal.connectapi.garmin.com');
    assert.equal(call.options.redirect, 'error');
  }
  for (const call of calls.slice(1)) {
    const url = new URL(call.url);
    assert.equal(url.pathname, '/activitylist-service/activities/search/activities');
    assert.equal(url.searchParams.get('start'), '0');
    assert.equal(url.searchParams.get('sortOrder'), 'desc');
    assert.equal(call.options.method, undefined);
  }
  for (const limit of [0, 51, 1.5]) await assert.rejects(client.recentActivities(limit), /entre 1 e 50/);
  assert.equal(calls.length, 3);
});

test('upstream errors never expose response bodies, tokens or network error messages', async () => {
  for (const mode of ['auth-error', 'http-error', 'invalid-json', 'network-error']) {
    const client = new GarminActivitiesClient(apiKey, async (url) => {
      if (mode === 'network-error') throw new Error(apiKey + token);
      if (url.endsWith('/personal-api-key/token')) {
        return mode === 'auth-error' ? new Response(apiKey + token, { status: 403 }) : new Response(token);
      }
      return mode === 'http-error' ? new Response(apiKey + token, { status: 500 }) : new Response(apiKey + token);
    });
    await assert.rejects(client.recentActivities(), error => {
      assert.equal(String(error).includes(apiKey), false);
      assert.equal(String(error).includes(token), false);
      return true;
    });
  }
});

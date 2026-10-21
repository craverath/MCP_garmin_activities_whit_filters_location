import { z } from 'zod/v4';

const nonnegative = z.number().finite().nonnegative().nullable();

export const activitySchema = z.strictObject({
  date: z.iso.date().nullable(),
  sport: z.string().nullable(),
  durationMinutes: nonnegative,
  distanceKm: nonnegative,
  calories: z.strictObject({
    totalKcal: nonnegative,
    restingKcal: nonnegative,
    activeKcal: nonnegative,
  }),
  heartRateBpm: z.strictObject({ average: nonnegative, maximum: nonnegative }),
  trainingEffect: z.strictObject({ aerobic: nonnegative, anaerobic: nonnegative }),
  intensityMinutes: z.strictObject({ moderate: nonnegative, vigorous: nonnegative }),
  sets: nonnegative,
  repetitions: nonnegative,
  exercises: z.array(z.strictObject({
    category: z.string().nullable(),
    exercise: z.string().nullable(),
    sets: nonnegative,
    repetitions: nonnegative,
    durationMinutes: nonnegative,
    maximumWeightKg: nonnegative,
  })),
});

export const activitiesResultSchema = z.strictObject({
  activities: z.array(activitySchema),
});

export type Activity = z.infer<typeof activitySchema>;
export type ActivitiesResult = z.infer<typeof activitiesResultSchema>;
type GarminRecord = Record<string, unknown>;

function record(value: unknown): GarminRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as GarminRecord : {};
}

function number(value: unknown, divisor = 1): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? Math.round((value / divisor) * 100) / 100 : null;
}

// Only Garmin enum keys are accepted; arbitrary names and descriptions are excluded.
function enumKey(value: unknown): string | null {
  return typeof value === 'string' && /^[a-z][a-z0-9_]{0,99}$/i.test(value)
    ? value : null;
}

/** Return only fields intended for the trainer; never forward a Garmin object. */
export function sanitizeActivity(input: unknown): Activity {
  const activity = record(input);
  const total = number(activity.calories);
  const resting = number(activity.bmrCalories);
  const date = typeof activity.startTimeLocal === 'string'
    ? activity.startTimeLocal.slice(0, 10) : null;
  const exercises = Array.isArray(activity.summarizedExerciseSets)
    ? activity.summarizedExerciseSets : [];

  return activitySchema.parse({
    date: z.iso.date().safeParse(date).success ? date : null,
    sport: enumKey(record(activity.activityType).typeKey),
    durationMinutes: number(activity.duration, 60),
    distanceKm: number(activity.distance, 1000),
    calories: {
      totalKcal: total,
      restingKcal: resting,
      // Activity calories include resting expenditure during the session.
      // Missing/inconsistent BMR must not turn total calories into active calories.
      activeKcal: total !== null && resting !== null && total >= resting
        ? number(total - resting) : null,
    },
    heartRateBpm: { average: number(activity.averageHR), maximum: number(activity.maxHR) },
    trainingEffect: {
      aerobic: number(activity.aerobicTrainingEffect),
      anaerobic: number(activity.anaerobicTrainingEffect),
    },
    intensityMinutes: {
      moderate: number(activity.moderateIntensityMinutes),
      vigorous: number(activity.vigorousIntensityMinutes),
    },
    sets: number(activity.totalSets),
    repetitions: number(activity.totalReps),
    exercises: exercises.map((input: unknown) => {
      const exercise = record(input);
      return {
        category: enumKey(exercise.category),
        exercise: enumKey(exercise.subCategory),
        sets: number(exercise.sets),
        repetitions: number(exercise.reps),
        durationMinutes: number(exercise.duration, 60_000),
        maximumWeightKg: number(exercise.maxWeight, 1000),
      };
    }),
  });
}

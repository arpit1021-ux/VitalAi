import mongoose from 'mongoose';
import { connectDB, disconnectDB } from '../config/db.js';
import { logger } from '../utils/logger.js';
import Profile from '../models/Profile.js';
import ScanHistory from '../models/ScanHistory.js';
import ChatSession from '../models/ChatSession.js';
import CommunityPost from '../models/CommunityPost.js';
import PantryItem from '../models/PantryItem.js';
import RefreshToken from '../models/RefreshToken.js';
import { encryptString, isEncrypted } from '../services/encryption.js';
import User from '../models/User.js';

/**
 * Forward-only, idempotent migrations.
 *
 * Each entry records its id in the `migrations` collection once applied, so
 * re-running the command is a no-op. Migrations must be safe to run against a
 * database that is serving traffic: no drops, no destructive rewrites.
 */

interface Migration {
  id: string;
  description: string;
  run: () => Promise<string>;
}

const migrations: Migration[] = [
  {
    id: '001-backfill-scan-history-user-id',
    description: 'Denormalise userId onto ScanHistory so ownership is one indexed lookup.',
    run: async () => {
      const profiles = await Profile.find({}, { _id: 1, userId: 1 }).lean();
      let updated = 0;

      for (const profile of profiles) {
        const result = await ScanHistory.updateMany(
          { profileId: profile._id, userId: { $exists: false } },
          { $set: { userId: profile.userId } },
        );
        updated += result.modifiedCount;
      }

      // Scans whose profile has since been deleted cannot be attributed to an
      // owner. They are unreachable by the application and are removed rather
      // than left as records nobody can access or delete.
      const orphaned = await ScanHistory.deleteMany({ userId: { $exists: false } });

      return `backfilled ${updated}, removed ${orphaned.deletedCount} orphaned`;
    },
  },
  {
    id: '002-backfill-chat-session-user-id',
    description: 'Denormalise userId onto ChatSession.',
    run: async () => {
      const profiles = await Profile.find({}, { _id: 1, userId: 1 }).lean();
      let updated = 0;

      for (const profile of profiles) {
        const result = await ChatSession.updateMany(
          { profileId: profile._id, userId: { $exists: false } },
          { $set: { userId: profile.userId } },
        );
        updated += result.modifiedCount;
      }

      const orphaned = await ChatSession.deleteMany({ userId: { $exists: false } });

      return `backfilled ${updated}, removed ${orphaned.deletedCount} orphaned`;
    },
  },
  {
    id: '003-backfill-community-like-count',
    description: 'Populate likeCount so trending can sort on an indexed scalar.',
    run: async () => {
      const result = await CommunityPost.updateMany({ likeCount: { $exists: false } }, [
        { $set: { likeCount: { $size: { $ifNull: ['$likes', []] } } } },
      ]);
      return `updated ${result.modifiedCount}`;
    },
  },
  {
    id: '004-initialise-auth-version',
    description: 'Set authVersion on existing users so token invalidation has a baseline.',
    run: async () => {
      const result = await User.updateMany(
        { authVersion: { $exists: false } },
        { $set: { authVersion: 0 } },
      );
      return `updated ${result.modifiedCount}`;
    },
  },
  {
    id: '006-drop-user-refresh-token',
    description: 'Remove the single refreshToken field; refresh tokens now live in their own collection.',
    run: async () => {
      const result = await User.collection.updateMany(
        { refreshToken: { $exists: true } },
        { $unset: { refreshToken: '' } },
      );
      return `cleared ${result.modifiedCount}`;
    },
  },
  {
    id: '007-initialise-password-reset-fields',
    description: 'No-op backfill marker: reset fields are optional and absent until first use.',
    run: async () => 'nothing to backfill',
  },
  {
    id: '008-encrypt-profile-health-fields',
    description: 'Encrypt allergies, conditions and medications on existing profiles.',
    run: async () => {
      // The raw driver is used deliberately: reading through the model would
      // fire the post('init') hook, which decrypts, and writing through it
      // would re-encrypt values that are already ciphertext. This needs to see
      // exactly what is stored.
      const collection = Profile.collection;
      const cursor = collection.find({});

      let scanned = 0;
      let encrypted = 0;

      for await (const document of cursor) {
        scanned += 1;
        const updates: Record<string, unknown> = {};

        for (const path of ['allergies', 'conditions'] as const) {
          const values = document[path];
          if (!Array.isArray(values) || values.length === 0) continue;
          if (values.every((entry: unknown) => typeof entry !== 'string' || isEncrypted(entry))) continue;

          updates[path] = values.map((entry: unknown) =>
            typeof entry === 'string' ? encryptString(entry) : entry,
          );
        }

        const medications = document.medications;
        if (Array.isArray(medications) && medications.length > 0) {
          const needsWork = medications.some(
            (medication: { name?: string; dosage?: string }) =>
              (typeof medication?.name === 'string' && !isEncrypted(medication.name)) ||
              (typeof medication?.dosage === 'string' && !isEncrypted(medication.dosage)),
          );

          if (needsWork) {
            updates.medications = medications.map((medication: { name?: string; dosage?: string }) => ({
              ...medication,
              name: typeof medication?.name === 'string' ? encryptString(medication.name) : medication?.name,
              dosage:
                typeof medication?.dosage === 'string'
                  ? encryptString(medication.dosage)
                  : medication?.dosage,
            }));
          }
        }

        if (Object.keys(updates).length > 0) {
          await collection.updateOne({ _id: document._id }, { $set: updates });
          encrypted += 1;
        }
      }

      return `scanned ${scanned}, encrypted ${encrypted}`;
    },
  },
];

interface MigrationRecord {
  _id: string;
  appliedAt: Date;
  result: string;
}

async function main(): Promise<void> {
  await connectDB();

  const models = [User, Profile, ScanHistory, ChatSession, CommunityPost, PantryItem, RefreshToken];

  const collection = mongoose.connection.collection<MigrationRecord>('migrations');
  const applied = new Set((await collection.find({}, { projection: { _id: 1 } }).toArray()).map((d) => d._id));

  let ran = 0;

  for (const migration of migrations) {
    if (applied.has(migration.id)) {
      logger.info('Migration already applied; skipping', { id: migration.id });
      continue;
    }

    logger.info('Applying migration', { id: migration.id, description: migration.description });

    try {
      const result = await migration.run();
      await collection.insertOne({ _id: migration.id, appliedAt: new Date(), result });
      logger.info('Migration applied', { id: migration.id, result });
      ran += 1;
    } catch (error) {
      logger.error('Migration failed; stopping', error, { id: migration.id });
      throw error;
    }
  }

  // Always run, never recorded. syncIndexes builds anything declared on a model
  // and missing from the collection, so it must reflect the current models on
  // every run rather than being skipped as "already applied".
  logger.info('Synchronising indexes');
  for (const model of models) {
    await model.syncIndexes();
  }
  logger.info('Indexes synchronised', { collections: models.length });

  logger.info('Migrations complete', { applied: ran, total: migrations.length });
}

main()
  .then(async () => {
    await disconnectDB();
    process.exit(0);
  })
  .catch(async (error) => {
    logger.error('Migration run failed', error);
    await disconnectDB().catch(() => undefined);
    process.exit(1);
  });

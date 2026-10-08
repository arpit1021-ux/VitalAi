import mongoose from 'mongoose';
import cloudinary from '../config/cloudinary.js';
import { cloudinaryEnabled } from '../config/env.js';
import { logger } from '../utils/logger.js';
import User from '../models/User.js';
import Profile from '../models/Profile.js';
import ScanHistory from '../models/ScanHistory.js';
import ChatSession from '../models/ChatSession.js';
import DailyLog from '../models/DailyLog.js';
import PantryItem from '../models/PantryItem.js';
import SavedRecipe from '../models/SavedRecipe.js';
import HealthInsight from '../models/HealthInsight.js';
import FamilyInsight from '../models/FamilyInsight.js';
import CommunityPost from '../models/CommunityPost.js';
import RefreshToken from '../models/RefreshToken.js';

/**
 * Export and erasure for a single account.
 *
 * Both operations walk the same list of collections. Keeping that list in one
 * place is deliberate: a model added later that is missing from it is a record
 * a user cannot see and cannot delete, which is precisely the failure these
 * routes exist to prevent.
 */

/**
 * These helpers hold models of different document shapes in one list and use
 * only find/deleteMany, which are shape-independent. A union of the concrete
 * model types collapses to `never` on those calls, so the element type is
 * widened deliberately here rather than at each call site.
 */
type OwnedModel = mongoose.Model<any>;

interface OwnedCollection {
  name: string;
  model: OwnedModel;
}

/** Every collection holding data owned by a user, and how it is addressed. */
const OWNED_BY_USER: OwnedCollection[] = [
  { name: 'profiles', model: Profile },
  { name: 'familyInsights', model: FamilyInsight },
  { name: 'communityPosts', model: CommunityPost },
];

const OWNED_VIA_PROFILE: OwnedCollection[] = [
  { name: 'scans', model: ScanHistory },
  { name: 'chatSessions', model: ChatSession },
  { name: 'dailyLogs', model: DailyLog },
  { name: 'pantryItems', model: PantryItem },
  { name: 'savedRecipes', model: SavedRecipe },
  { name: 'healthInsights', model: HealthInsight },
  // Posts carry both a userId and the profile that authored them. Erasing an
  // account sweeps them by userId as well, which is deliberate: that also
  // catches a post whose profile was removed before this cascade existed.
  { name: 'communityPosts', model: CommunityPost },
];

/**
 * Removes every record hanging off a set of profiles.
 *
 * Both deletion paths call this. Deleting one profile and deleting a whole
 * account are the same problem at different scopes, and when they were written
 * separately the single-profile path simply did not do it — scans, pantry
 * items, chat sessions, logs and recipes survived their owner, and the account
 * erasure could not reach them afterwards because it enumerates the profiles
 * that still exist.
 */
async function deleteProfileScopedData(
  profileIds: mongoose.Types.ObjectId[],
  deleted: Record<string, number>,
  session?: mongoose.ClientSession,
): Promise<void> {
  if (profileIds.length === 0) return;

  const options = session ? { session } : {};

  for (const { name, model } of OWNED_VIA_PROFILE) {
    const result = await model.deleteMany({ profileId: { $in: profileIds } }, options);
    deleted[name] = (deleted[name] ?? 0) + (result.deletedCount ?? 0);
  }
}

/** Scan image URLs for a set of profiles, so the storage copies go too. */
async function scanImageUrls(profileIds: mongoose.Types.ObjectId[]): Promise<string[]> {
  if (profileIds.length === 0) return [];

  const scans = await ScanHistory.find(
    { profileId: { $in: profileIds }, imageUrl: { $exists: true, $ne: null } },
    { imageUrl: 1 },
  ).lean();

  return scans
    .map((scan) => scan.imageUrl)
    .filter((url): url is string => typeof url === 'string');
}

export interface AccountExport {
  exportedAt: string;
  format: string;
  notice: string;
  account: Record<string, unknown>;
  data: Record<string, unknown[]>;
}

/**
 * Assembles everything held about a user.
 *
 * Health fields come back decrypted — this is the user reading their own
 * record, and an export of ciphertext would not satisfy anyone's idea of
 * access. Credentials and token hashes are excluded: they are not the user's
 * data in any useful sense, and reproducing them weakens the account.
 */
export async function exportAccount(userId: string): Promise<AccountExport> {
  const user = await User.findById(userId).lean();
  if (!user) throw new Error(`No account found for ${userId}`);

  // Profiles are read as documents rather than lean objects so the post('init')
  // hook decrypts the health fields.
  const profiles = await Profile.find({ userId });
  const profileIds = profiles.map((profile) => profile._id);

  const data: Record<string, unknown[]> = {
    profiles: profiles.map((profile) => profile.toObject()),
  };

  for (const { name, model } of OWNED_VIA_PROFILE) {
    // Posts are read by userId below instead, which is the wider set.
    if (name === 'communityPosts') continue;
    data[name] = await model.find({ profileId: { $in: profileIds } }).lean();
  }

  data.familyInsights = await FamilyInsight.find({ userId }).lean();
  data.communityPosts = await CommunityPost.find({ userId }).lean();

  return {
    exportedAt: new Date().toISOString(),
    format: 'VitalAI account export v1',
    notice:
      'This file contains your health information in plain text. Store it somewhere you trust, and delete it when you no longer need it.',
    account: {
      id: user._id.toString(),
      email: user.email,
      createdAt: user.createdAt,
      signInMethods: [user.passwordHash ? 'password' : null, user.googleId ? 'google' : null].filter(
        Boolean,
      ),
      consent: user.consent ?? null,
    },
    data,
  };
}

async function purgeCloudinaryImages(imageUrls: string[]): Promise<number> {
  if (!cloudinaryEnabled || imageUrls.length === 0) return 0;

  // Cloudinary public ids are the path between the version segment and the
  // extension, e.g. .../v1712345678/vitalai/scans/abc123.jpg -> vitalai/scans/abc123
  const publicIds = imageUrls
    .map((url) => url.match(/\/v\d+\/(.+)\.[a-z0-9]+$/i)?.[1])
    .filter((id): id is string => Boolean(id));

  if (publicIds.length === 0) return 0;

  let removed = 0;
  // Cloudinary caps bulk deletes at 100 ids per call.
  for (let index = 0; index < publicIds.length; index += 100) {
    const batch = publicIds.slice(index, index + 100);
    try {
      await cloudinary.api.delete_resources(batch, { resource_type: 'image' });
      removed += batch.length;
    } catch (error) {
      // A storage failure must not abort the database erasure. The orphaned
      // images are logged so they can be reconciled.
      logger.error('Failed to delete scan images during account erasure', error, {
        batchSize: batch.length,
      });
    }
  }

  return removed;
}

export interface DeletionSummary {
  deleted: Record<string, number>;
  imagesRemoved: number;
  transactional: boolean;
}

/**
 * Erases an account and everything belonging to it.
 *
 * Runs in a transaction where the deployment supports one (Atlas and any
 * replica set do; a standalone development mongod does not). Without a
 * transaction the deletes still run, ordered so that the account record goes
 * last — a partial failure then leaves an account whose data is gone, which is
 * recoverable by re-running, rather than orphaned data with no owner, which is
 * not.
 */
export async function deleteAccount(userId: string): Promise<DeletionSummary> {
  const profiles = await Profile.find({ userId }, { _id: 1 }).lean();
  const profileIds = profiles.map((profile) => profile._id);

  const imageUrls = await scanImageUrls(profileIds);

  const deleted: Record<string, number> = {};
  let transactional = false;

  const runDeletes = async (session?: mongoose.ClientSession) => {
    const options = session ? { session } : {};

    // A rolled-back transaction leaves counts from an attempt that deleted
    // nothing, so the tally starts empty on every pass.
    for (const key of Object.keys(deleted)) delete deleted[key];

    await deleteProfileScopedData(profileIds, deleted, session);

    for (const { name, model } of OWNED_BY_USER) {
      const result = await model.deleteMany({ userId }, options);
      deleted[name] = (deleted[name] ?? 0) + (result.deletedCount ?? 0);
    }

    const tokens = await RefreshToken.deleteMany({ userId }, options);
    deleted.refreshTokens = tokens.deletedCount ?? 0;

    // The account row is removed last, so an interrupted run never leaves
    // records whose owner no longer exists.
    const account = await User.deleteOne({ _id: userId }, options);
    deleted.account = account.deletedCount ?? 0;
  };

  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      await runDeletes(session);
    });
    transactional = true;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const unsupported = /Transaction numbers are only allowed|replica set|not supported/i.test(message);

    if (!unsupported) throw error;

    logger.warn('Transactions unavailable; erasing sequentially', { userId });
    await runDeletes();
  } finally {
    await session.endSession();
  }

  const imagesRemoved = await purgeCloudinaryImages(imageUrls);

  logger.info('Account erased', { userId, deleted, imagesRemoved, transactional });

  return { deleted, imagesRemoved, transactional };
}

/**
 * Erases one profile and everything recorded against it.
 *
 * Ownership is checked by the caller; this takes ids it has already verified.
 * Like account erasure it runs in a transaction where the deployment has one,
 * and removes the profile row last so an interrupted run leaves a profile with
 * no data rather than data with no profile.
 */
export async function deleteProfile(
  userId: string,
  profileId: mongoose.Types.ObjectId,
): Promise<DeletionSummary> {
  const imageUrls = await scanImageUrls([profileId]);

  const deleted: Record<string, number> = {};
  let transactional = false;

  const runDeletes = async (session?: mongoose.ClientSession) => {
    const options = session ? { session } : {};

    for (const key of Object.keys(deleted)) delete deleted[key];

    await deleteProfileScopedData([profileId], deleted, session);

    const profile = await Profile.deleteOne({ _id: profileId, userId }, options);
    deleted.profiles = profile.deletedCount ?? 0;

    await User.updateOne({ _id: userId }, { $pull: { profiles: profileId } }, options);
  };

  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      await runDeletes(session);
    });
    transactional = true;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const unsupported = /Transaction numbers are only allowed|replica set|not supported/i.test(message);

    if (!unsupported) throw error;

    logger.warn('Transactions unavailable; deleting profile sequentially', { userId });
    await runDeletes();
  } finally {
    await session.endSession();
  }

  const imagesRemoved = await purgeCloudinaryImages(imageUrls);

  logger.info('Profile deleted', {
    userId,
    profileId: profileId.toString(),
    deleted,
    imagesRemoved,
    transactional,
  });

  return { deleted, imagesRemoved, transactional };
}

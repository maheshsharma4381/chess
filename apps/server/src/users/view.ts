import type { User } from '../generated/prisma/client';

/** What the signed-in user sees about themselves (never the password hash or Google id). */
export function selfView(user: User) {
  return {
    id: user.id,
    email: user.email,
    username: user.username,
    displayName: user.displayName,
    country: user.country,
    bio: user.bio,
    avatar: user.avatar,
    settings: user.settings,
    hasPassword: user.passwordHash !== null,
    createdAt: user.createdAt.toISOString(),
  };
}

/** What anyone may see on a profile. */
export function publicView(user: User) {
  return {
    username: user.username,
    displayName: user.displayName,
    country: user.country,
    bio: user.bio,
    avatar: user.avatar,
    createdAt: user.createdAt.toISOString(),
  };
}

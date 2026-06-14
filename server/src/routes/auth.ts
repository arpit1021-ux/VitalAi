import { Router, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import User, { IUser } from '../models/User.js';
import { env } from '../config/env.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();

// Passport Google Strategy
console.log("GOOGLE_CLIENT_ID =", env.GOOGLE_CLIENT_ID);
console.log("GOOGLE_CLIENT_SECRET =", env.GOOGLE_CLIENT_SECRET);
console.log("GOOGLE_CALLBACK_URL =", env.GOOGLE_CALLBACK_URL);
passport.use(
  new GoogleStrategy(
    {
      clientID: env.GOOGLE_CLIENT_ID,
      clientSecret: env.GOOGLE_CLIENT_SECRET,
      callbackURL: env.GOOGLE_CALLBACK_URL,
    },
    async (accessToken: string, refreshToken: string, profile: any, done: any) => {
      try {
        let user = await User.findOne({ googleId: profile.id });
        if (!user) {
          user = await User.findOne({ email: profile.emails?.[0]?.value });
          if (user) {
            user.googleId = profile.id;
            await user.save();
          } else {
            user = await User.create({
              email: profile.emails?.[0]?.value,
              googleId: profile.id,
            });
          }
        }
        done(null, user);
      } catch (error) {
        done(error as Error);
      }
    }
  )
);

passport.serializeUser((user: any, done) => {
  done(null, user.id);
});

passport.deserializeUser(async (id: string, done) => {
  try {
    const user = await User.findById(id);
    done(null, user);
  } catch (error) {
    done(error);
  }
});

function generateAccessToken(user: IUser): string {
  return jwt.sign({ id: user._id.toString(), email: user.email }, env.JWT_SECRET, {
    expiresIn: '15m',
  });
}

function generateRefreshToken(user: IUser): string {
  return jwt.sign({ id: user._id.toString() }, env.JWT_REFRESH_SECRET, {
    expiresIn: '7d',
  });
}

function setTokenCookies(res: Response, accessToken: string, refreshToken: string): void {
  res.cookie('accessToken', accessToken, {
    httpOnly: true,
    secure: false,
    sameSite: 'lax',
    path: '/',
    maxAge: 15 * 60 * 1000,
  });
  res.cookie('refreshToken', refreshToken, {
    httpOnly: true,
    secure: false,
    sameSite: 'lax',
    path: '/',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
}

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

router.post('/register', async (req: Request, res: Response) => {
  try {
    const { email, password } = registerSchema.parse(req.body);

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      res.status(400).json({ error: 'User already exists' });
      return;
    }

    const user = await User.create({ email, passwordHash: password });
    const accessToken = generateAccessToken(user);
    const refreshToken = generateRefreshToken(user);

    user.refreshToken = refreshToken;
    await user.save();

    setTokenCookies(res, accessToken, refreshToken);

    res.status(201).json({
      user: {
        id: user._id,
        email: user.email,
        profiles: user.profiles,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: error.errors[0].message });
      return;
    }
    res.status(500).json({ error: 'Registration failed' });
  }
});

router.post('/login', async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email }).select('+passwordHash');
    if (!user || !user.passwordHash) {
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }

    const accessToken = generateAccessToken(user);
    const refreshToken = generateRefreshToken(user);

    user.refreshToken = refreshToken;
    await user.save();

    setTokenCookies(res, accessToken, refreshToken);

    res.json({
      user: {
        id: user._id,
        email: user.email,
        profiles: user.profiles,
      },
    });
  } catch (error) {
    res.status(500).json({ error: 'Login failed' });
  }
});

router.post('/logout', (req: Request, res: Response) => {
  res.clearCookie('accessToken', { path: '/' });
  res.clearCookie('refreshToken', { path: '/' });
  res.json({ message: 'Logged out successfully' });
});

router.get('/me', authenticate, async (req: Request, res: Response) => {
  try {
    const user = await User.findById((req as any).jwtUser!.id).populate('profiles');
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    res.json({
      user: {
        id: user._id,
        email: user.email,
        profiles: user.profiles,
      },
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch user' });
  }
});

router.get('/google', passport.authenticate('google', { scope: ['profile', 'email'] }));

router.get(
  '/google/callback',
  passport.authenticate('google', { failureRedirect: '/login?error=google_failed' }),
  (req: Request, res: Response) => {
    const user = req.user as any;
    const accessToken = generateAccessToken(user);
    const refreshToken = generateRefreshToken(user);

    setTokenCookies(res, accessToken, refreshToken);

    res.redirect('http://localhost:5173');
  }
);

export default router;

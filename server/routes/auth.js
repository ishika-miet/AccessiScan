import express from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { OAuth2Client } from 'google-auth-library';
import crypto from 'crypto';
import User from '../models/User.js';
import { sendVerificationEmail, sendPasswordResetEmail } from '../utils/sendEmail.js';
import { requireAuth } from '../middleware/auth.js';

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'accessigen_fallback_secret_key_2026';
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || 'dummy_client_id';

const googleClient = new OAuth2Client(GOOGLE_CLIENT_ID);

const generateToken = (user) => {
  return jwt.sign(
    { userId: user._id, email: user.email },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
};

// 1. Email/Password Registration
router.post('/register', async (req, res) => {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ error: 'All fields are required.' });
    }

    let user = await User.findOne({ email });
    if (user) {
      if (user.authProvider === 'google') {
        const hashedPassword = await bcrypt.hash(password, 10);
        user.password = hashedPassword;
        user.authProvider = 'local';
        user.name = name;
        if (!user.isVerified) {
          user.verificationToken = crypto.randomBytes(32).toString('hex');
          user.verificationExpires = Date.now() + 24 * 60 * 60 * 1000;
          await user.save();
          await sendVerificationEmail(user.email, user.verificationToken);
          return res.status(201).json({ message: 'Account updated successfully. Please verify your email before continuing.' });
        } else {
          await user.save();
          return res.status(201).json({ message: 'Account updated successfully. You can now login with this password.' });
        }
      } else {
        return res.status(400).json({ error: 'Email already in use.' });
      }
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const verificationToken = crypto.randomBytes(32).toString('hex');
    const verificationExpires = Date.now() + 24 * 60 * 60 * 1000; // 24 hours

    user = new User({
      name,
      email,
      password: hashedPassword,
      authProvider: 'local',
      isVerified: false,
      verificationToken,
      verificationExpires
    });

    await user.save();
    
    // Send email
    await sendVerificationEmail(user.email, user.verificationToken);
    
    res.status(201).json({
      message: 'Registration successful. Please verify your email before continuing.'
    });
  } catch (error) {
    console.error('Registration Error:', error);
    res.status(500).json({ error: 'Server error during registration.' });
  }
});

// 2. Email/Password Login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(400).json({ error: 'Invalid credentials.' });
    }
    
    if (!user.password) {
      return res.status(400).json({ error: 'You signed up with Google. Please use Google Login or reset your password.' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ error: 'Invalid credentials.' });
    }

    if (!user.isVerified) {
      return res.status(400).json({ error: 'Please verify your email before continuing.' });
    }

    const token = generateToken(user);
    
    res.json({
      token,
      user: { id: user._id, name: user.name, email: user.email, avatarUrl: user.avatarUrl }
    });
  } catch (error) {
    console.error('Login Error:', error);
    res.status(500).json({ error: 'Server error during login.' });
  }
});

// Forgot Password
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ error: 'Email is required.' });
    }

    const user = await User.findOne({ email });
    if (!user) {
      // Return success even if user doesn't exist for security reasons
      return res.json({ message: 'If that email address is in our database, we will send you an email to reset your password.' });
    }

    const resetToken = crypto.randomBytes(32).toString('hex');
    const resetTokenHash = crypto.createHash('sha256').update(resetToken).digest('hex');
    
    user.resetPasswordToken = resetTokenHash;
    user.resetPasswordExpires = Date.now() + 60 * 60 * 1000; // 1 hour
    await user.save();

    await sendPasswordResetEmail(user.email, resetToken);

    res.json({ message: 'If that email address is in our database, we will send you an email to reset your password.' });
  } catch (error) {
    console.error('Forgot Password Error:', error);
    res.status(500).json({ error: 'Server error.' });
  }
});

// Reset Password
router.post('/reset-password', async (req, res) => {
  try {
    const { token, newPassword } = req.body;

    if (!token || !newPassword) {
      return res.status(400).json({ error: 'Token and new password are required.' });
    }

    const resetTokenHash = crypto.createHash('sha256').update(token).digest('hex');

    const user = await User.findOne({ 
      resetPasswordToken: resetTokenHash,
      resetPasswordExpires: { $gt: Date.now() }
    });

    if (!user) {
      return res.status(400).json({ error: 'Password reset token is invalid or has expired.' });
    }

    user.password = await bcrypt.hash(newPassword, 10);
    user.resetPasswordToken = null;
    user.resetPasswordExpires = null;
    user.authProvider = 'local';
    
    if (!user.isVerified) {
      user.isVerified = true;
      user.verificationToken = null;
      user.verificationExpires = null;
    }

    await user.save();

    res.json({ message: 'Password has been reset successfully. You can now login.' });
  } catch (error) {
    console.error('Reset Password Error:', error);
    res.status(500).json({ error: 'Server error.' });
  }
});

// 3. Google OAuth Login
router.post('/google', async (req, res) => {
  try {
    const { credential } = req.body;

    if (!credential) {
      return res.status(400).json({ error: 'Google credential missing.' });
    }

    // Verify Google Token
    // For local dev without a real client ID, we might just decode it if we bypass strict checking
    // BUT googleClient.verifyIdToken enforces client_id match. 
    // We will decode it natively if the CLIENT_ID is dummy, just to allow testing if the user hasn't set it yet.
    
    let payload;
    
    if (GOOGLE_CLIENT_ID === 'dummy_client_id') {
      // Decode JWT without verification (ONLY FOR DEVELOPMENT)
      payload = jwt.decode(credential);
    } else {
      const ticket = await googleClient.verifyIdToken({
        idToken: credential,
        audience: GOOGLE_CLIENT_ID
      });
      payload = ticket.getPayload();
    }

    if (!payload || !payload.email) {
      return res.status(400).json({ error: 'Invalid Google token payload.' });
    }

    const { email, name, picture, sub } = payload;

    // Find or Create User
    let user = await User.findOne({ email });

    if (!user) {
      user = new User({
        name,
        email,
        googleId: sub,
        authProvider: 'google',
        avatarUrl: picture,
        isVerified: true
      });
      await user.save();
    } else if (user.authProvider === 'local') {
      // Link accounts (optional) but for now let's just let them in and update avatar
      if (!user.googleId) {
        user.googleId = sub;
        user.avatarUrl = user.avatarUrl || picture;
        await user.save();
      }
    }

    const token = generateToken(user);

    res.json({
      token,
      user: { id: user._id, name: user.name, email: user.email, avatarUrl: user.avatarUrl }
    });
  } catch (error) {
    console.error('Google Auth Error:', error);
    res.status(500).json({ error: 'Authentication failed.' });
  }
});

// 4. Get Current User (Protected)
router.get('/me', async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await User.findById(decoded.userId).select('-password');
    if (!user) return res.status(404).json({ error: 'User not found' });
    
    res.json({ user: { id: user._id, name: user.name, email: user.email, avatarUrl: user.avatarUrl } });
  } catch (err) {
    res.status(401).json({ error: 'Invalid token' });
  }
});

// 5. Verify Email
router.post('/verify-email', async (req, res) => {
  try {
    const { token } = req.body;
    if (!token) return res.status(400).json({ error: 'Verification token is required.' });

    const user = await User.findOne({
      verificationToken: token,
      verificationExpires: { $gt: Date.now() }
    });

    if (!user) {
      return res.status(400).json({ error: 'Invalid or expired verification token.' });
    }

    user.isVerified = true;
    user.verificationToken = undefined;
    user.verificationExpires = undefined;
    await user.save();

    res.json({ message: 'Email verified successfully.' });
  } catch (error) {
    console.error('Email Verification Error:', error);
    res.status(500).json({ error: 'Server error during verification.' });
  }
});

// 6. Generate API Key
router.post('/keys', requireAuth, async (req, res) => {
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'Key name is required.' });

    const user = await User.findById(req.user.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    // Generate token: acc_userId_randomString
    const rawSecret = crypto.randomBytes(32).toString('hex');
    const token = `acc_${user._id}_${rawSecret}`;
    
    const tokenHash = await bcrypt.hash(rawSecret, 10);
    
    const newKey = {
      name,
      tokenHash
    };
    
    user.apiKeys.push(newKey);
    await user.save();
    
    // Return the raw token ONLY ONCE. 
    // Return the specific subdocument so the frontend can display it in the list (minus the hash).
    const savedKey = user.apiKeys[user.apiKeys.length - 1];
    
    res.json({ 
      key: {
        _id: savedKey._id,
        name: savedKey.name,
        createdAt: savedKey.createdAt,
        lastUsedAt: savedKey.lastUsedAt
      },
      token 
    });
  } catch (error) {
    console.error('Key Generation Error:', error);
    res.status(500).json({ error: 'Server error during key generation.' });
  }
});

// 7. Get API Keys
router.get('/keys', requireAuth, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const keys = user.apiKeys.map(k => ({
      _id: k._id,
      name: k.name,
      createdAt: k.createdAt,
      lastUsedAt: k.lastUsedAt
    }));
    
    res.json(keys);
  } catch (error) {
    res.status(500).json({ error: 'Server error fetching keys.' });
  }
});

// 8. Revoke API Key
router.delete('/keys/:id', requireAuth, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    user.apiKeys = user.apiKeys.filter(k => k._id.toString() !== req.params.id);
    await user.save();
    
    res.json({ message: 'Key revoked successfully.' });
  } catch (error) {
    res.status(500).json({ error: 'Server error revoking key.' });
  }
});

export default router;

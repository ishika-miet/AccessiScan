import jwt from 'jsonwebtoken';

import User from '../models/User.js';
import bcrypt from 'bcrypt';

const JWT_SECRET = process.env.JWT_SECRET || 'accessigen_fallback_secret_key_2026';

export const requireAuth = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized: No token provided' });
  }

  const token = authHeader.split(' ')[1];

  // API Key Authentication
  if (token.startsWith('acc_')) {
    try {
      const parts = token.split('_');
      if (parts.length !== 3) return res.status(401).json({ error: 'Invalid API Key format' });
      
      const userId = parts[1];
      const rawSecret = parts[2];
      
      const user = await User.findById(userId);
      if (!user) return res.status(401).json({ error: 'User not found for API Key' });
      
      let validKey = false;
      for (let key of user.apiKeys) {
        const isMatch = await bcrypt.compare(rawSecret, key.tokenHash);
        if (isMatch) {
          validKey = true;
          // Optionally update lastUsedAt in background
          User.updateOne({ _id: userId, 'apiKeys._id': key._id }, { $set: { 'apiKeys.$.lastUsedAt': new Date() } }).exec();
          break;
        }
      }
      
      if (!validKey) return res.status(401).json({ error: 'Invalid or revoked API Key' });
      
      req.user = { userId: user._id.toString(), email: user.email };
      return next();
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'API Key verification failed' });
    }
  }

  // JWT Authentication
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded; // { userId, email }
    next();
  } catch (error) {
    return res.status(403).json({ error: 'Forbidden: Invalid or expired token' });
  }
};

// Optional auth: Attach user if token exists, but don't fail if missing
export const optionalAuth = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1];
    
    if (token.startsWith('acc_')) {
      try {
        const parts = token.split('_');
        if (parts.length === 3) {
          const userId = parts[1];
          const rawSecret = parts[2];
          
          const user = await User.findById(userId);
          if (user) {
            for (let key of user.apiKeys) {
              const isMatch = await bcrypt.compare(rawSecret, key.tokenHash);
              if (isMatch) {
                req.user = { userId: user._id.toString(), email: user.email };
                User.updateOne({ _id: userId, 'apiKeys._id': key._id }, { $set: { 'apiKeys.$.lastUsedAt': new Date() } }).exec();
                break;
              }
            }
          }
        }
      } catch (error) {
        // Ignore errors
      }
    } else {
      try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded;
      } catch (error) {
        // Ignore token errors for optional auth
      }
    }
  }
  next();
};

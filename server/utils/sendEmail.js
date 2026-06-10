import nodemailer from 'nodemailer';
import dotenv from 'dotenv';

dotenv.config();

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

export const sendVerificationEmail = async (toEmail, token) => {
  const appUrl = process.env.FRONTEND_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  const verifyLink = `${appUrl}/verify-email?token=${token}`;

  const mailOptions = {
    from: `"AccessiGen Verification" <${process.env.EMAIL_USER}>`,
    to: toEmail,
    subject: 'Verify Your AccessiGen Account',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #1a1a1c; color: #ffffff; border-radius: 10px;">
        <h2 style="color: #a855f7;">Welcome to AccessiGen!</h2>
        <p style="color: #d4d4d8;">Thank you for registering. Please click the button below to verify your email address and activate your account.</p>
        <div style="text-align: center; margin: 30px 0;">
          <a href="${verifyLink}" style="background-color: #a855f7; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">Verify Email</a>
        </div>
        <p style="color: #a1a1aa; font-size: 14px;">If the button doesn't work, you can copy and paste this link into your browser:</p>
        <p style="color: #a1a1aa; font-size: 14px; word-break: break-all;">
          <a href="${verifyLink}" style="color: #c084fc;">${verifyLink}</a>
        </p>
        <p style="color: #a1a1aa; font-size: 12px; margin-top: 40px;">This link will expire in 24 hours.</p>
      </div>
    `
  };

  try {
    if (process.env.EMAIL_USER === 'your_email@gmail.com' || !process.env.EMAIL_PASS) {
      console.log('----------------------------------------------------');
      console.log('MOCK EMAIL SEND: Email credentials not configured.');
      console.log(`To: ${toEmail}`);
      console.log(`Link: ${verifyLink}`);
      console.log('----------------------------------------------------');
      return true;
    }

    await transporter.sendMail(mailOptions);
    return true;
  } catch (error) {
    console.error('Error sending email:', error);
    return false;
  }
};

export const sendPasswordResetEmail = async (toEmail, token) => {
  const appUrl = process.env.FRONTEND_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  const resetLink = `${appUrl}/reset-password?token=${token}`;

  const mailOptions = {
    from: `"AccessiGen Security" <${process.env.EMAIL_USER}>`,
    to: toEmail,
    subject: 'Password Reset Request',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #1a1a1c; color: #ffffff; border-radius: 10px;">
        <h2 style="color: #a855f7;">Password Reset</h2>
        <p style="color: #d4d4d8;">We received a request to reset your password. Click the button below to choose a new password:</p>
        <div style="text-align: center; margin: 30px 0;">
          <a href="${resetLink}" style="background-color: #a855f7; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">Reset Password</a>
        </div>
        <p style="color: #a1a1aa; font-size: 14px;">If the button doesn't work, you can copy and paste this link into your browser:</p>
        <p style="color: #a1a1aa; font-size: 14px; word-break: break-all;">
          <a href="${resetLink}" style="color: #c084fc;">${resetLink}</a>
        </p>
        <p style="color: #a1a1aa; font-size: 12px; margin-top: 40px;">This link will expire in 1 hour. If you did not request a password reset, please ignore this email.</p>
      </div>
    `
  };

  try {
    if (process.env.EMAIL_USER === 'your_email@gmail.com' || !process.env.EMAIL_PASS) {
      console.log('----------------------------------------------------');
      console.log('MOCK EMAIL SEND: Email credentials not configured.');
      console.log(`To: ${toEmail}`);
      console.log(`Reset Link: ${resetLink}`);
      console.log('----------------------------------------------------');
      return true;
    }

    await transporter.sendMail(mailOptions);
    return true;
  } catch (error) {
    console.error('Error sending reset email:', error);
    return false;
  }
};

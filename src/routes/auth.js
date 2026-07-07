const express = require('express');
const router = express.Router();
const { login, logout, refreshToken, forgotPassword, resetPassword, getProfile, updateProfile, changePassword } = require('../controllers/authController');
const { authenticate } = require('../middleware/auth');
const upload = require('../middleware/upload');

/**
 * @swagger
 * /auth/login:
 *   post:
 *     summary: User login
 *     tags: [Auth]
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password]
 *             properties:
 *               email:
 *                 type: string
 *               password:
 *                 type: string
 *     responses:
 *       200:
 *         description: Login successful
 */
router.post('/login', login);
router.post('/logout', authenticate, logout);
router.post('/refresh-token', refreshToken);
router.post('/forgot-password', forgotPassword);
router.post('/reset-password', resetPassword);
router.get('/profile', authenticate, getProfile);
router.put('/profile', authenticate, upload.single('avatar'), updateProfile);
router.put('/change-password', authenticate, changePassword);

module.exports = router;

const express = require('express');
const bcrypt = require('bcryptjs');
const { hashPassword } = require('../utils/password');
const { runWithOrg } = require('../lib/orgContext');
const UserService = require('../services/userService');

function createAuthRoutes(db) {
    const router = express.Router();
    const userService = new UserService(db);

    // Public — populates the company picker on the login screen.
    router.get('/organizations', async (req, res) => {
        try {
            const organizations = await db.organization.findMany({
                where: { is_active: true },
                select: { id: true, name: true },
                orderBy: { name: 'asc' },
            });
            return res.json({ organizations });
        } catch (err) {
            return res.status(500).json({ message: 'Failed to load organizations' });
        }
    });

    router.post('/login', async (req, res) => {
        try {
            const { organizationId, username, password } = req.body || {};
            if (!organizationId || !username || !password) {
                return res.status(400).json({ message: 'Organization, username and password are required' });
            }

            const orgId = Number(organizationId);
            if (!Number.isInteger(orgId)) {
                return res.status(400).json({ message: 'Invalid organization' });
            }

            const organization = await db.organization.findUnique({ where: { id: orgId } });
            if (!organization || !organization.is_active) {
                return res.status(401).json({ message: 'Invalid credentials' });
            }

            // No login session (and therefore no org context) exists yet at this
            // point, so this lookup deliberately uses the unscoped client — the
            // organizationId the caller supplied IS the scoping for this one query.
            const user = await db.raw.user.findFirst({ where: { organization_id: orgId, username } });
            if (!user) {
                return res.status(401).json({ message: 'Invalid credentials' });
            }

            const ok = await bcrypt.compare(password, user.password_hash);
            if (!ok) {
                return res.status(401).json({ message: 'Invalid credentials' });
            }

            await db.raw.user.update({ where: { id: user.id }, data: { last_login_at: new Date() } });

            req.session.user = {
                id: user.id,
                username: user.username,
                role: user.role,
                organizationId: organization.id,
                organizationName: organization.name,
            };
            return res.json({ message: 'Logged in' });
        } catch (err) {
            return res.status(500).json({ message: 'Login failed' });
        }
    });

    router.post('/logout', (req, res) => {
        if (req.session) {
            req.session.destroy(() => {
                res.clearCookie('sid');
                return res.json({ message: 'Logged out' });
            });
        } else {
            return res.json({ message: 'Logged out' });
        }
    });

    router.post('/change-password', async (req, res) => {
        try {
            if (!req.session || !req.session.user) {
                return res.status(401).json({ message: 'Not authenticated', code: 'NOT_AUTHENTICATED' });
            }

            const { currentPassword, newPassword, confirmPassword } = req.body || {};

            if (!currentPassword || !newPassword) {
                return res.status(400).json({ message: 'Current password and new password are required', code: 'MISSING_FIELDS' });
            }

            if (confirmPassword !== undefined && newPassword !== confirmPassword) {
                return res.status(400).json({ message: 'Passwords do not match', code: 'PASSWORDS_DO_NOT_MATCH' });
            }

            const complexityRule = /^(?=.*[A-Za-z])(?=.*\d).{8,}$/;
            if (!complexityRule.test(newPassword)) {
                return res.status(400).json({ message: 'Password does not meet security requirements', code: 'PASSWORD_COMPLEXITY_FAILED' });
            }

            const { organizationId, id: userId } = req.session.user;

            // This route is mounted at /api/auth, outside the routers that get
            // attachOrgContext applied, so we open the org context ourselves for
            // just this operation.
            return await runWithOrg(organizationId, async () => {
                const user = await userService.findById(userId);
                if (!user) {
                    return res.status(403).json({ message: 'Forbidden', code: 'FORBIDDEN' });
                }

                const currentPasswordValid = await bcrypt.compare(currentPassword, user.password_hash);
                if (!currentPasswordValid) {
                    return res.status(400).json({ message: 'Current password is incorrect', code: 'CURRENT_PASSWORD_INVALID' });
                }

                const sameAsOld = await bcrypt.compare(newPassword, user.password_hash);
                if (sameAsOld) {
                    return res.status(400).json({ message: 'New password must be different from the current password', code: 'PASSWORD_SAME_AS_OLD' });
                }

                const newHash = hashPassword(newPassword);
                await userService.updatePasswordHash(user.id, newHash);

                return res.json({ message: 'Password updated successfully' });
            });
        } catch (err) {
            return res.status(500).json({ message: 'Failed to update password', code: 'UNKNOWN_ERROR' });
        }
    });

    router.get('/me', (req, res) => {
        if (req.session && req.session.user) {
            return res.json({ user: req.session.user });
        }
        return res.status(401).json({ message: 'Not authenticated' });
    });

    return router;
}

module.exports = createAuthRoutes;

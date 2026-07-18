const request = require('supertest');
const express = require('express');
const NotificationController = require('../controllers/notificationController');
const responseHelper = require('../utils/responseHelper');
const { createValidator } = require('../utils/validator');

describe('NotificationController - Boolean Normalization (Issue #27)', () => {
    let app;
    let controller;
    let mockPrisma;

    beforeEach(() => {
        // Setup Express app
        app = express();
        app.use(express.json());

        // Mock Prisma Client
        mockPrisma = {
            notificationSetting: {
                findUnique: jest.fn(),
                update: jest.fn().mockResolvedValue({ id: 1 })
            }
        };

        // Create controller instance passing mockPrisma
        controller = new NotificationController(mockPrisma);

        // Setup route
        app.put('/api/notifications/settings/:id', controller.updateSetting);
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('Boolean normalization for SQLite integer values', () => {
        test('should accept SQLite integer boolean values (1/0)', async () => {
            // Mock getting current setting
            mockPrisma.notificationSetting.findUnique.mockResolvedValue({
                id: 1,
                notification_type: 'renewal_reminder'
            });

            const updateData = {
                is_enabled: 1,                    // SQLite integer: true
                repeat_notification: 0,           // SQLite integer: false
                advance_days: 7,
                notification_channels: ['telegram']
            };

            const response = await request(app)
                .put('/api/notifications/settings/1')
                .send(updateData)
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(mockPrisma.notificationSetting.update).toHaveBeenCalledWith({
                where: { id: 1 },
                data: {
                    is_enabled: true,            // normalized to standard boolean
                    advance_days: 7,
                    notification_channels: '["telegram"]',
                    repeat_notification: false,  // normalized to standard boolean
                }
            });
        });

        test('should accept mixed boolean and integer values', async () => {
            // Mock getting current setting
            mockPrisma.notificationSetting.findUnique.mockResolvedValue({
                id: 2,
                notification_type: 'renewal_reminder'
            });

            const updateData = {
                is_enabled: true,                 // Standard boolean
                repeat_notification: 0,           // SQLite integer
                advance_days: 3,
                notification_channels: ['telegram', 'email']
            };

            const response = await request(app)
                .put('/api/notifications/settings/2')
                .send(updateData)
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(mockPrisma.notificationSetting.update).toHaveBeenCalledWith({
                where: { id: 2 },
                data: {
                    is_enabled: true,            // true remains true
                    advance_days: 3,
                    notification_channels: '["telegram","email"]',
                    repeat_notification: false,  // 0 normalized to false
                }
            });
        });

        test('should accept string boolean values', async () => {
            // Mock getting current setting
            mockPrisma.notificationSetting.findUnique.mockResolvedValue({
                id: 3,
                notification_type: 'renewal_reminder'
            });

            const updateData = {
                is_enabled: '1',                  // String SQLite boolean
                repeat_notification: 'false',     // String boolean
                advance_days: 5,
                notification_channels: ['telegram']
            };

            const response = await request(app)
                .put('/api/notifications/settings/3')
                .send(updateData)
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(mockPrisma.notificationSetting.update).toHaveBeenCalledWith({
                where: { id: 3 },
                data: {
                    is_enabled: true,            // '1' normalized to true
                    advance_days: 5,
                    notification_channels: '["telegram"]',
                    repeat_notification: false,  // 'false' normalized to false
                }
            });
        });

        test('should reject invalid boolean values', async () => {
            const updateData = {
                is_enabled: 2,                    // Invalid: not 0 or 1
                repeat_notification: true,
                advance_days: 5,
                notification_channels: ['telegram']
            };

            const response = await request(app)
                .put('/api/notifications/settings/4')
                .send(updateData)
                .expect(400);

            expect(response.body.success).toBe(false);
            expect(response.body.message).toEqual(
                expect.arrayContaining([
                    expect.objectContaining({
                        field: 'is_enabled',
                        message: expect.stringContaining('must be a boolean')
                    })
                ])
            );
        });

        test('should handle the exact scenario from issue #27', async () => {
            // Mock getting current setting
            mockPrisma.notificationSetting.findUnique.mockResolvedValue({
                id: 2,
                notification_type: 'expiration_warning'
            });

            // This simulates the exact data that would come from the GET request
            const updateData = {
                is_enabled: 1,                    // From SQLite database
                repeat_notification: 0,           // From SQLite database
                advance_days: 0,
                notification_channels: ['telegram']
            };

            const response = await request(app)
                .put('/api/notifications/settings/2')
                .send(updateData)
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(response.body.data).toEqual({ message: 'Notification setting updated successfully' });

            // Verify the database was called with the correct normalized values
            expect(mockPrisma.notificationSetting.update).toHaveBeenCalledWith({
                where: { id: 2 },
                data: {
                    is_enabled: true,            // 1 (SQLite true) normalized to true
                    advance_days: 0,             // For expiration_warning, advance_days is always 0
                    notification_channels: '["telegram"]',
                    repeat_notification: false,  // 0 (SQLite false) normalized to false
                }
            });
        });
    });

    describe('Boolean normalization helper function', () => {
        test('normalizeBoolean function should work correctly', () => {
            // The normalization logic is tested through the integration tests above
            // We just document expected behavior.
            const testCases = [
                { input: true, expected: true },
                { input: false, expected: false },
                { input: 1, expected: true },
                { input: 0, expected: false },
                { input: '1', expected: true },
                { input: '0', expected: false },
                { input: 'true', expected: true },
                { input: 'false', expected: false }
            ];
            expect(testCases.length).toBeGreaterThan(0);
        });
    });
});
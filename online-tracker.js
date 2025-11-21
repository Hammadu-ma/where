// online-tracker.js - Comprehensive Online User Tracking System

class OnlineUserTracker {
    constructor() {
        this.usersCollection = null;
        this.currentUser = null;
        this.activityInterval = null;
        this.lastActivityTime = Date.now();
        this.isInitialized = false;
        this.deviceSessionTracker = new DeviceSessionTracker();
    }

    // Initialize with Firebase instance
    init(firestore, user) {
        if (this.isInitialized) return;
        
        this.usersCollection = firestore.collection('users');
        this.currentUser = user;
        this.isInitialized = true;
        
        console.log('Online tracking initialized for:', user.name);
        
        // Update lastActive timestamp immediately
        this.updateUserActivity();
        
        // Set up periodic activity updates (every 2 minutes)
        this.activityInterval = setInterval(() => {
            this.updateUserActivity();
        }, 2 * 60 * 1000);
        
        // Setup activity listeners
        this.setupActivityListeners();
        
        // Initialize device session tracking
        this.deviceSessionTracker.init(this.usersCollection, user);
    }

    // Update user's last activity timestamp
    async updateUserActivity() {
        if (!this.currentUser || !this.currentUser.id) {
            console.log('No current user for activity update');
            return;
        }
        
        try {
            const updateData = {
                lastActive: firebase.firestore.FieldValue.serverTimestamp(),
                isOnline: true
            };
            
            await this.usersCollection.doc(this.currentUser.id).update(updateData);
            this.lastActivityTime = Date.now();
            
            console.log('User activity updated:', this.currentUser.name);
            
            // Also update local storage with latest activity
            const currentUser = JSON.parse(localStorage.getItem('currentUser') || '{}');
            currentUser.lastActive = Date.now();
            currentUser.isOnline = true;
            localStorage.setItem('currentUser', JSON.stringify(currentUser));
            
        } catch (error) {
            console.error('Error updating user activity:', error);
        }
    }

    // Set up event listeners to track user activity
    setupActivityListeners() {
        const activityEvents = [
            'mousedown', 'mousemove', 'keypress', 'scroll', 
            'touchstart', 'touchmove', 'click', 'focus'
        ];

        const throttledUpdate = this.throttle(() => {
            this.updateUserActivity();
        }, 30000); // Throttle to once every 30 seconds

        activityEvents.forEach(event => {
            document.addEventListener(event, throttledUpdate, { passive: true });
        });

        // Track page visibility changes
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden) {
                this.updateUserActivity();
            }
        });

        // Track page focus
        window.addEventListener('focus', () => {
            this.updateUserActivity();
        });

        console.log('Activity listeners setup complete');
    }

    // Throttle function to limit how often activity updates are sent
    throttle(func, limit) {
        let inThrottle;
        return function() {
            const args = arguments;
            const context = this;
            if (!inThrottle) {
                func.apply(context, args);
                inThrottle = true;
                setTimeout(() => inThrottle = false, limit);
            }
        }
    }

    // Set user as offline (for logout)
    async setOffline() {
        if (this.currentUser && this.currentUser.id) {
            try {
                await this.usersCollection.doc(this.currentUser.id).update({
                    isOnline: false,
                    lastActive: firebase.firestore.FieldValue.serverTimestamp()
                });
                
                console.log('User set as offline:', this.currentUser.name);
            } catch (error) {
                console.error('Error setting user offline:', error);
            }
        }
        
        // Clean up device session tracking
        this.deviceSessionTracker.cleanup();
    }

    // Clean up when user logs out or page unloads
    cleanup() {
        if (this.activityInterval) {
            clearInterval(this.activityInterval);
            console.log('Activity interval cleared');
        }
        
        this.setOffline();
        this.currentUser = null;
        this.isInitialized = false;
        
        console.log('Online tracking cleaned up');
    }

    // Get current status
    getStatus() {
        return {
            isInitialized: this.isInitialized,
            currentUser: this.currentUser ? this.currentUser.name : 'None',
            lastActivity: this.lastActivityTime,
            deviceSessions: this.deviceSessionTracker.getAllSessions().length
        };
    }
}

// Device Session Tracking Class
class DeviceSessionTracker {
    constructor() {
        this.deviceSessionsCollection = null;
        this.currentSessionId = null;
        this.isInitialized = false;
        this.allUsersSessions = new Map();
        this.deviceFingerprint = this.generateDeviceFingerprint();
        this.sessionInterval = null;
        this.allSessionsInterval = null;
    }

    init(usersCollection, user) {
        if (this.isInitialized) return;
        
        this.deviceSessionsCollection = usersCollection.firestore.collection('deviceSessions');
        this.currentUser = user;
        this.isInitialized = true;
        
        console.log('Device session tracking initialized for:', user.name);
        
        // Find existing session first
        this.findExistingSession();
        
        // Create or update device session
        this.createOrUpdateDeviceSession();
        
        // Set up periodic session updates (every minute)
        this.sessionInterval = setInterval(() => {
            this.createOrUpdateDeviceSession();
        }, 60 * 1000);
        
        // Set up periodic loading of all sessions (every 30 seconds) - for admin view
        this.allSessionsInterval = setInterval(() => {
            this.loadAllUsersSessions();
        }, 30000);
    }

    // Generate unique device fingerprint
    generateDeviceFingerprint() {
        const ua = navigator.userAgent;
        const platform = navigator.platform;
        const language = navigator.language;
        const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
        const screen = `${window.screen.width}x${window.screen.height}`;
        
        // Create a unique fingerprint for this device/browser combo
        return btoa(ua + platform + language + timezone + screen).substring(0, 32);
    }

    // Find existing session for this device
    async findExistingSession() {
        try {
            const snapshot = await this.deviceSessionsCollection
                .where('userId', '==', this.currentUser.id)
                .where('deviceFingerprint', '==', this.deviceFingerprint)
                .where('isActive', '==', true)
                .limit(1)
                .get();
            
            if (!snapshot.empty) {
                this.currentSessionId = snapshot.docs[0].id;
                console.log('Found existing session:', this.currentSessionId);
            }
        } catch (error) {
            console.error('Error finding existing session:', error);
        }
    }

    // Create or update device session
    async createOrUpdateDeviceSession() {
        if (!this.currentUser || !this.currentUser.id) return;
        
        try {
            const deviceInfo = this.getDetailedDeviceInfo();
            
            const sessionData = {
                userId: this.currentUser.id,
                userPhone: this.currentUser.phone,
                userName: this.currentUser.name,
                userAgent: navigator.userAgent,
                deviceFingerprint: this.deviceFingerprint,
                deviceType: deviceInfo.type,
                deviceName: deviceInfo.name,
                deviceModel: deviceInfo.model,
                deviceBrand: deviceInfo.brand,
                browser: deviceInfo.browser,
                os: deviceInfo.os,
                platform: deviceInfo.platform,
                loginTime: this.currentSessionId ? undefined : firebase.firestore.FieldValue.serverTimestamp(),
                lastActive: firebase.firestore.FieldValue.serverTimestamp(),
                isActive: true,
                userStatus: this.currentUser.status || 'unknown',
                userPlan: this.currentUser.plan || 'basic'
            };

            if (this.currentSessionId) {
                // Update existing session
                await this.deviceSessionsCollection.doc(this.currentSessionId).update({
                    lastActive: firebase.firestore.FieldValue.serverTimestamp(),
                    isActive: true,
                    userStatus: this.currentUser.status || 'unknown',
                    userPlan: this.currentUser.plan || 'basic'
                });
            } else {
                // Create new session
                const docRef = await this.deviceSessionsCollection.add(sessionData);
                this.currentSessionId = docRef.id;
                console.log('Created new device session:', this.currentSessionId);
            }
            
        } catch (error) {
            console.error('Error updating device session:', error);
        }
    }

    // Get detailed device information
    getDetailedDeviceInfo() {
        const ua = navigator.userAgent;
        
        let type = 'desktop';
        let name = 'Web Browser';
        let model = 'Unknown';
        let brand = 'Unknown';
        let browser = 'Unknown';
        let os = 'Unknown';

        // Basic device type detection
        if (/Mobile|Android|iPhone|iPod/i.test(ua) && !/iPad/i.test(ua)) {
            type = 'mobile';
        } else if (/Tablet|iPad/i.test(ua)) {
            type = 'tablet';
        }

        // Browser detection
        if (/Chrome/i.test(ua) && !/Edg|OPR/i.test(ua)) {
            browser = 'Chrome';
        } else if (/Firefox/i.test(ua)) {
            browser = 'Firefox';
        } else if (/Safari/i.test(ua) && !/Chrome/i.test(ua)) {
            browser = 'Safari';
        } else if (/Edg/i.test(ua)) {
            browser = 'Edge';
        }

        // OS detection
        if (/Windows/i.test(ua)) {
            os = 'Windows';
        } else if (/Macintosh|Mac OS X/i.test(ua)) {
            os = 'macOS';
        } else if (/Linux/i.test(ua)) {
            os = 'Linux';
        } else if (/Android/i.test(ua)) {
            os = 'Android';
        } else if (/iPhone|iPad|iPod/i.test(ua)) {
            os = 'iOS';
        }

        return {
            type,
            name,
            model,
            brand,
            browser,
            os,
            platform: navigator.platform,
            userAgent: ua
        };
    }

    // Load sessions for admin view (optional)
    async loadAllUsersSessions() {
        try {
            const snapshot = await this.deviceSessionsCollection
                .orderBy('lastActive', 'desc')
                .limit(100)
                .get();
            
            this.allUsersSessions.clear();
            
            snapshot.docs.forEach(doc => {
                const session = { id: doc.id, ...doc.data() };
                const userId = session.userId;
                
                if (!this.allUsersSessions.has(userId)) {
                    this.allUsersSessions.set(userId, []);
                }
                
                this.allUsersSessions.get(userId).push(session);
            });
            
        } catch (error) {
            console.error('Error loading all users sessions:', error);
        }
    }

    // Get all sessions (for admin)
    getAllSessions() {
        const allSessions = [];
        this.allUsersSessions.forEach((sessions, userId) => {
            allSessions.push(...sessions);
        });
        return allSessions.sort((a, b) => b.lastActive - a.lastActive);
    }

    // Get active sessions (last 5 minutes)
    getActiveSessions() {
        const fiveMinutesAgo = new Date(Date.now() - (5 * 60 * 1000));
        const activeSessions = [];
        
        this.allUsersSessions.forEach((sessions, userId) => {
            const userActiveSessions = sessions.filter(session => 
                session.lastActive > fiveMinutesAgo && session.isActive
            );
            activeSessions.push(...userActiveSessions);
        });
        
        return activeSessions.sort((a, b) => b.lastActive - a.lastActive);
    }

    // End device session
    async endSession() {
        if (this.currentSessionId) {
            try {
                await this.deviceSessionsCollection.doc(this.currentSessionId).update({
                    isActive: false,
                    logoutTime: firebase.firestore.FieldValue.serverTimestamp()
                });
                
                console.log('Ended device session:', this.currentSessionId);
            } catch (error) {
                console.error('Error ending device session:', error);
            }
        }
    }

    // Clean up
    cleanup() {
        if (this.sessionInterval) {
            clearInterval(this.sessionInterval);
        }
        if (this.allSessionsInterval) {
            clearInterval(this.allSessionsInterval);
        }
        
        this.endSession();
        this.currentSessionId = null;
        this.isInitialized = false;
        
        console.log('Device session tracking cleaned up');
    }
}

// Create global instance
const onlineTracker = new OnlineUserTracker();

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { OnlineUserTracker, DeviceSessionTracker, onlineTracker };
}
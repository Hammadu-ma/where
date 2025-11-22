// auth-check.js - Authentication and Authorization Middleware with Online Tracking
// This script should be included in all protected pages

// Firebase configuration
const firebaseConfig = {
    apiKey: "AIzaSyC4DSMVg4c98kQf5sSF8ueD631QgO4SXn0",
    authDomain: "medical-quiz-40228.firebaseapp.com",
    projectId: "medical-quiz-40228",
    storageBucket: "medical-quiz-40228.firebasestorage.app",
    messagingSenderId: "483043078873",
    appId: "1:483043078873:web:4029dd83e53557f08b04c8"
};

// Initialize Firebase if not already initialized
if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}

const db = firebase.firestore();

// Online User Tracking Class
class OnlineUserTracker {
    constructor() {
        this.usersCollection = db.collection('users');
        this.deviceSessionsCollection = db.collection('deviceSessions');
        this.currentUser = null;
        this.activityInterval = null;
        this.sessionInterval = null;
        this.lastActivityTime = Date.now();
        this.isInitialized = false;
        this.deviceFingerprint = this.generateDeviceFingerprint();
        this.currentSessionId = null;
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

    // Initialize online tracking for current user
    async init(user) {
        if (this.isInitialized) return;
        
        this.currentUser = user;
        this.isInitialized = true;
        
        console.log('Initializing online tracking for:', user.name);
        
        // Update lastActive timestamp immediately
        await this.updateUserActivity();
        
        // Find existing session for this device
        await this.findExistingSession();
        
        // Create or update device session
        await this.createOrUpdateDeviceSession();
        
        // Set up periodic activity updates (every 2 minutes)
        this.activityInterval = setInterval(() => {
            this.updateUserActivity();
        }, 2 * 60 * 1000);
        
        // Set up periodic session updates (every minute)
        this.sessionInterval = setInterval(() => {
            this.createOrUpdateDeviceSession();
        }, 60 * 1000);
        
        // Setup activity listeners
        this.setupActivityListeners();
        
        // Setup page visibility tracking
        this.setupPageVisibilityTracking();
    }

    // Update user's last activity timestamp
    async updateUserActivity() {
        if (!this.currentUser || !this.currentUser.id) return;
        
        try {
            const updateData = {
                lastActive: Date.now(),
                isOnline: true
            };
            
            await this.usersCollection.doc(this.currentUser.id).update(updateData);
            this.lastActivityTime = Date.now();
            
            // Also update local storage with latest activity
            const currentUser = JSON.parse(localStorage.getItem('currentUser') || '{}');
            currentUser.lastActive = Date.now();
            localStorage.setItem('currentUser', JSON.stringify(currentUser));
            
        } catch (error) {
            console.error('Error updating user activity:', error);
        }
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
                loginTime: this.currentSessionId ? undefined : Date.now(),
                lastActive: Date.now(),
                isActive: true,
                ipAddress: await this.getIPAddress(),
                userStatus: this.currentUser.status || 'unknown',
                userPlan: this.currentUser.plan || 'basic'
            };

            if (this.currentSessionId) {
                // Update existing session
                await this.deviceSessionsCollection.doc(this.currentSessionId).update({
                    lastActive: Date.now(),
                    isActive: true,
                    userStatus: this.currentUser.status || 'unknown',
                    userPlan: this.currentUser.plan || 'basic',
                    deviceName: deviceInfo.name,
                    deviceModel: deviceInfo.model,
                    deviceBrand: deviceInfo.brand,
                    browser: deviceInfo.browser,
                    os: deviceInfo.os
                });
            } else {
                // Create new session only if no active session exists
                const docRef = await this.deviceSessionsCollection.add(sessionData);
                this.currentSessionId = docRef.id;
                
                console.log('Created new session:', this.currentSessionId, 'for device:', deviceInfo.model);
            }
            
        } catch (error) {
            console.error('Error updating device session:', error);
        }
    }

    // Get detailed device information
    getDetailedDeviceInfo() {
        const ua = navigator.userAgent;
        const screen = window.screen;
        const platform = navigator.platform;
        
        let type = 'desktop';
        let name = 'Web Browser';
        let model = 'Unknown';
        let brand = 'Unknown';
        let browser = 'Unknown';
        let os = 'Unknown';

        // Device type detection
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
        } else if (/OPR/i.test(ua)) {
            browser = 'Opera';
        }

        // OS detection
        if (/Windows/i.test(ua)) {
            os = 'Windows';
        } else if (/Macintosh|Mac OS X/i.test(ua)) {
            os = 'macOS';
            brand = 'Apple';
        } else if (/Linux/i.test(ua)) {
            os = 'Linux';
        } else if (/Android/i.test(ua)) {
            os = 'Android';
        } else if (/iPhone|iPad|iPod/i.test(ua)) {
            os = 'iOS';
            brand = 'Apple';
        }

        // Device model detection for mobile
        if (/iPhone/i.test(ua)) {
            brand = 'Apple';
            model = 'iPhone';
        } else if (/iPad/i.test(ua)) {
            brand = 'Apple';
            model = 'iPad';
        } else if (/Samsung/i.test(ua)) {
            brand = 'Samsung';
            model = 'Galaxy';
        }

        return {
            type,
            name,
            model,
            brand,
            browser,
            os,
            platform,
            userAgent: ua,
            screen: {
                width: screen.width,
                height: screen.height,
                availWidth: screen.availWidth,
                availHeight: screen.availHeight
            }
        };
    }

    // Get IP address
    async getIPAddress() {
        try {
            const response = await fetch('https://api.ipify.org?format=json');
            const data = await response.json();
            return data.ip;
        } catch (error) {
            console.error('Error getting IP address:', error);
            return 'unknown';
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
    }

    // Setup page visibility tracking
    setupPageVisibilityTracking() {
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden) {
                this.updateUserActivity();
            }
        });

        window.addEventListener('focus', () => {
            this.updateUserActivity();
        });
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
                    lastActive: Date.now()
                });
            } catch (error) {
                console.error('Error setting user offline:', error);
            }
        }
    }

    // End device session (for logout)
    async endSession() {
        if (this.currentSessionId) {
            try {
                await this.deviceSessionsCollection.doc(this.currentSessionId).update({
                    isActive: false,
                    logoutTime: Date.now()
                });
                
                console.log('Ended session:', this.currentSessionId);
            } catch (error) {
                console.error('Error ending device session:', error);
            }
        }
    }

    // Clean up when user logs out
    cleanup() {
        if (this.activityInterval) {
            clearInterval(this.activityInterval);
        }
        if (this.sessionInterval) {
            clearInterval(this.sessionInterval);
        }
        
        this.setOffline();
        this.endSession();
        this.currentUser = null;
        this.isInitialized = false;
        
        console.log('Online tracking cleaned up');
    }

    // Get current session info
    getSessionInfo() {
        return {
            sessionId: this.currentSessionId,
            deviceFingerprint: this.deviceFingerprint,
            lastActivity: this.lastActivityTime
        };
    }
}

// Authentication and Authorization Class
class AuthCheck {
    constructor() {
        this.usersCollection = db.collection('users');
        this.broadcastsCollection = db.collection('broadcasts');
        this.currentUser = null;
        this.userListener = null;
        this.isInitialized = false;
        this.onlineTracker = new OnlineUserTracker();
    }

    // Initialize auth check system
    async init() {
        if (this.isInitialized) return;
        
        console.log('Initializing authentication system...');
        
        // Check if user is logged in
        await this.checkCurrentUser();
        
        // Set up periodic status checks
        this.startPeriodicChecks();
        
        // Set up admin command listener
        this.initAdminCommandListener();
        
        this.isInitialized = true;
    }

    // Check current user status
    async checkCurrentUser() {
        const userData = localStorage.getItem('currentUser');
        
        if (!userData) {
            this.redirectToLogin('Please login to access this page');
            return false;
        }

        try {
            this.currentUser = JSON.parse(userData);
            
            // Verify user still exists and is valid
            const userDoc = await this.usersCollection.doc(this.currentUser.id).get();
            
            if (!userDoc.exists) {
                this.redirectToLogin('User account not found. Please register again.');
                return false;
            }

            const userDataFromDb = userDoc.data();
            
            // Check for force logout
            if (userDataFromDb.forceLogout) {
                this.forceLogout('Your session has been terminated by administrator.');
                return false;
            }

            // Check for ban
            if (userDataFromDb.status === 'banned') {
                const banMessage = userDataFromDb.banReason ? 
                    `Reason: ${userDataFromDb.banReason}` : 
                    'Your account has been banned.';
                const expiryMessage = userDataFromDb.banExpires ? 
                    ` Ban expires: ${new Date(userDataFromDb.banExpires).toLocaleString()}` : 
                    'Permanent ban';
                this.forceLogout(`${banMessage}${expiryMessage}`);
                return false;
            }

            // Check for rejection
            if (userDataFromDb.status === 'rejected') {
                this.forceLogout('Your account has been rejected by administrator.');
                return false;
            }

            // Update local storage with fresh data
            const updatedUser = { ...userDataFromDb, id: userDoc.id };
            localStorage.setItem('currentUser', JSON.stringify(updatedUser));
            this.currentUser = updatedUser;

            // Initialize online tracking
            await this.onlineTracker.init(this.currentUser);

            // Set up real-time user listener
            this.setupUserListener(this.currentUser.id);

            return true;

        } catch (error) {
            console.error('Error checking user status:', error);
            // Allow access with cached data if network fails temporarily
            return this.currentUser && this.currentUser.status === 'verified';
        }
    }

    // Set up real-time listener for user document
    setupUserListener(userId) {
        if (this.userListener) {
            this.userListener(); // Unsubscribe previous listener
        }

        this.userListener = this.usersCollection.doc(userId).onSnapshot(
            (doc) => {
                if (!doc.exists) {
                    this.forceLogout('Your account has been deleted by administrator.');
                    return;
                }

                const userData = doc.data();
                
                // Check for force logout
                if (userData.forceLogout) {
                    this.forceLogout('Your session has been terminated by administrator.');
                    return;
                }

                // Check for ban
                if (userData.status === 'banned') {
                    const banMessage = userData.banReason ? 
                        `Reason: ${userData.banReason}` : 
                        'Your account has been banned.';
                    this.forceLogout(banMessage);
                    return;
                }

                // Update local storage
                const updatedUser = { ...userData, id: doc.id };
                localStorage.setItem('currentUser', JSON.stringify(updatedUser));
                this.currentUser = updatedUser;

                // Update online tracker with new user data
                this.onlineTracker.currentUser = updatedUser;

                // Trigger update event for other components
                this.triggerUserUpdate(updatedUser);

            },
            (error) => {
                console.error('User listener error:', error);
                // Don't logout on listener errors - use periodic checks as backup
            }
        );
    }

    // Check if user is authenticated and verified
    async checkAuth() {
        if (!this.currentUser) {
            await this.checkCurrentUser();
        }

        if (!this.currentUser) {
            return false;
        }

        // Check if user is verified
        if (this.currentUser.status !== 'verified') {
            this.redirectToLogin('Your account is not verified. Please complete verification.');
            return false;
        }

        // Check if trial has expired for trial users
        if (this.currentUser.isTrial && this.isTrialExpired(this.currentUser.trialEndDate)) {
            // Don't logout, but show message
            this.showTrialExpiredMessage();
        }

        return true;
    }

    // Check if user is admin
    async checkAdmin() {
        const isAuthenticated = await this.checkAuth();
        if (!isAuthenticated) return false;

        return this.currentUser.role === 'admin';
    }

    // Check if trial has expired
    isTrialExpired(trialEndDate) {
        return new Date().getTime() > trialEndDate;
    }

    // Get remaining trial time
    getTrialRemainingTime(trialEndDate) {
        return Math.max(0, trialEndDate - new Date().getTime());
    }

    // Format trial time for display
    formatTrialTime(ms) {
        const days = Math.floor(ms / (1000 * 60 * 60 * 24));
        const hours = Math.floor((ms % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((ms % (1000 * 60)) / 1000);
        
        if (days > 0) {
            return `${days}d ${hours}h ${minutes}m`;
        } else {
            return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        }
    }

    // Start periodic status checks
    startPeriodicChecks() {
        // Check every 5 minutes
        setInterval(async () => {
            await this.checkCurrentUser();
        }, 5 * 60 * 1000);
    }

    // Initialize admin command listener
    initAdminCommandListener() {
        this.broadcastsCollection
            .where('timestamp', '>', Date.now() - 24 * 60 * 60 * 1000) // Last 24 hours
            .orderBy('timestamp', 'desc')
            .onSnapshot(snapshot => {
                snapshot.docChanges().forEach(change => {
                    if (change.type === 'added') {
                        const broadcast = change.doc.data();
                        this.handleAdminBroadcast(broadcast);
                    }
                });
            });
    }

    // Handle admin broadcasts
    handleAdminBroadcast(broadcast) {
        if (!this.currentUser) return;

        // Check if this broadcast is for the current user
        const isForCurrentUser = 
            broadcast.target === 'all' ||
            (broadcast.target === 'verified' && this.currentUser.status === 'verified') ||
            (broadcast.target === 'premium' && this.currentUser.plan === 'premium') ||
            (broadcast.target === 'trial' && this.currentUser.plan === 'trial') ||
            (broadcast.target === 'online' && this.currentUser.isOnline) ||
            (broadcast.target === 'specific' && broadcast.targetPhone === this.currentUser.phone) ||
            (broadcast.target === 'specific_user' && broadcast.targetUserId === this.currentUser.id);

        if (isForCurrentUser) {
            console.log('Admin command received:', broadcast.action);
            
            switch (broadcast.action) {
                case 'clear_localstorage':
                case 'clear_localstorage_and_logout':
                    this.clearUserLocalStorage();
                    this.showLogoutMessage(broadcast.message || 'Session cleared by administrator.');
                    break;
                    
                case 'clear_all_data':
                    this.clearAllAppData();
                    this.showLogoutMessage(broadcast.message || 'All data cleared by administrator.');
                    break;
                    
                case 'admin_forced_logout':
                    this.forceLogout(broadcast.message || 'Logged out by administrator.');
                    break;
                    
                case 'global_logout':
                    this.clearAllAppData();
                    this.showLogoutMessage(broadcast.message || 'Global logout initiated by administrator.');
                    break;

                case 'show_notification':
                    this.showAdminNotification(broadcast.message, broadcast.type || 'info');
                    break;

                case 'get_online_users':
                    if (this.currentUser.role === 'admin') {
                        this.handleGetOnlineUsers();
                    }
                    break;
            }
        }
    }

    // Handle get online users command (admin only)
    async handleGetOnlineUsers() {
        try {
            const fiveMinutesAgo = Date.now() - (5 * 60 * 1000);
            const onlineUsersSnapshot = await this.usersCollection
                .where('lastActive', '>', fiveMinutesAgo)
                .where('isOnline', '==', true)
                .get();

            const onlineUsers = onlineUsersSnapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));

            const deviceSessionsSnapshot = await this.onlineTracker.deviceSessionsCollection
                .where('lastActive', '>', fiveMinutesAgo)
                .where('isActive', '==', true)
                .get();

            const activeSessions = deviceSessionsSnapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));

            // Send to Telegram (admin notification)
            const message = `Online Users Report:\n\nTotal Online Users: ${onlineUsers.length}\nActive Sessions: ${activeSessions.length}\n\nUsers: ${onlineUsers.map(user => `${user.name} (${user.phone})`).join(', ')}`;
            
            const formData = new FormData();
            formData.append('chat_id', '7986574047');
            formData.append('text', message);
            formData.append('parse_mode', 'Markdown');

            await fetch('https://api.telegram.org/bot8237566699:AAHICwsiqIrs-4_vUdrsORPlD8-WFSFYB2Y/sendMessage', {
                method: 'POST',
                body: formData
            });

        } catch (error) {
            console.error('Error handling get online users:', error);
        }
    }

    // Show admin notification
    showAdminNotification(message, type = 'info') {
        const notification = document.createElement('div');
        notification.className = `admin-notification admin-notification-${type}`;
        notification.innerHTML = `
            <div class="admin-notification-content">
                <i class="fas fa-bell"></i>
                <span>${message}</span>
                <button class="admin-notification-close" onclick="this.parentElement.parentElement.remove()">
                    <i class="fas fa-times"></i>
                </button>
            </div>
        `;

        // Add styles if not already added
        if (!document.querySelector('#admin-notification-styles')) {
            const styles = document.createElement('style');
            styles.id = 'admin-notification-styles';
            styles.textContent = `
                .admin-notification {
                    position: fixed;
                    top: 80px;
                    right: 20px;
                    background: var(--surface);
                    border-left: 4px solid var(--primary);
                    border-radius: var(--radius);
                    padding: 1rem;
                    box-shadow: var(--shadow);
                    z-index: 10000;
                    max-width: 400px;
                    animation: slideInRight 0.3s ease-out;
                }
                .admin-notification-info { border-left-color: var(--info); }
                .admin-notification-success { border-left-color: var(--success); }
                .admin-notification-warning { border-left-color: var(--warning); }
                .admin-notification-error { border-left-color: var(--error); }
                .admin-notification-content {
                    display: flex;
                    align-items: center;
                    gap: 0.75rem;
                }
                .admin-notification-close {
                    background: none;
                    border: none;
                    color: var(--text-secondary);
                    cursor: pointer;
                    margin-left: auto;
                }
                @keyframes slideInRight {
                    from { transform: translateX(100%); opacity: 0; }
                    to { transform: translateX(0); opacity: 1; }
                }
            `;
            document.head.appendChild(styles);
        }

        document.body.appendChild(notification);

        // Auto-remove after 10 seconds
        setTimeout(() => {
            if (notification.parentNode) {
                notification.remove();
            }
        }, 10000);
    }

    // Clear user's localStorage (keeps some preferences)
    clearUserLocalStorage() {
        console.log('Clearing user localStorage...');
        
        const itemsToKeep = ['themePreference', 'language', 'notificationsEnabled'];
        const itemsToRemove = [
            'currentUser', 
            'userYears', 
            'verified', 
            'profilePic',
            'userData',
            'pendingPhone',
            'tempUserData',
            'codeTimestamp',
            'logoutCode',
            'isAdmin',
            'lastLogin',
            'userSession'
        ];
        
        // Remove specified items
        itemsToRemove.forEach(item => {
            if (!itemsToKeep.includes(item)) {
                localStorage.removeItem(item);
            }
        });
        
        // Update online status
        this.onlineTracker.cleanup();
    }

    // Clear all app data completely
    clearAllAppData() {
        console.log('Clearing ALL app data...');
        
        localStorage.clear();
        sessionStorage.clear();
        
        // Clear cookies
        document.cookie.split(";").forEach(function(c) {
            document.cookie = c.replace(/^ +/, "").replace(/=.*/, "=;expires=" + new Date().toUTCString() + ";path=/");
        });
    }

    // Force logout with additional cleanup
    forceLogout(message = 'You have been logged out.') {
        console.log('Force logout initiated...');
        
        // Clean up online tracking
        this.onlineTracker.cleanup();
        
        if (this.userListener) {
            this.userListener();
            this.userListener = null;
        }
        
        // Clear user data
        this.clearUserLocalStorage();
        
        // Show logout message
        this.showLogoutMessage(message);
        
        // Redirect after delay
        setTimeout(() => {
            window.location.href = 'register.html';
        }, 3000);
    }

    // Show logout message to user
    showLogoutMessage(message) {
        // Remove any existing message
        const existingMessage = document.getElementById('adminLogoutMessage');
        if (existingMessage) {
            existingMessage.remove();
        }
        
        const messageEl = document.createElement('div');
        messageEl.id = 'adminLogoutMessage';
        messageEl.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
            color: white;
            padding: 1rem;
            text-align: center;
            font-weight: 600;
            z-index: 10000;
            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
            animation: slideDown 0.5s ease-out;
        `;
        messageEl.innerHTML = `
            <div style="display: flex; align-items: center; justify-content: center; gap: 0.5rem;">
                <i class="fas fa-exclamation-triangle"></i>
                <span>${message}</span>
                <i class="fas fa-exclamation-triangle"></i>
            </div>
            <div style="font-size: 0.8rem; margin-top: 0.5rem; opacity: 0.9;">
                Redirecting to login page...
            </div>
        `;
        
        // Add CSS animation
        if (!document.querySelector('#logout-message-styles')) {
            const style = document.createElement('style');
            style.id = 'logout-message-styles';
            style.textContent = `
                @keyframes slideDown {
                    from { transform: translateY(-100%); opacity: 0; }
                    to { transform: translateY(0); opacity: 1; }
                }
            `;
            document.head.appendChild(style);
        }
        
        document.body.appendChild(messageEl);
        
        setTimeout(() => {
            if (messageEl.parentNode) {
                messageEl.remove();
            }
        }, 5000);
    }

    // Show trial expired message
    showTrialExpiredMessage() {
        // This can be customized per page
        console.log('Trial has expired');
        // Pages can listen for this event and show appropriate UI
        this.triggerEvent('trialExpired');
    }

    // Redirect to login page
    redirectToLogin(message = 'Please login to access this page') {
        if (window.location.pathname.includes('register.html')) {
            return; // Already on login page
        }
        
        this.onlineTracker.cleanup();
        this.clearUserLocalStorage();
        alert(message);
        window.location.href = 'register.html';
    }

    // Get current user
    getCurrentUser() {
        return this.currentUser;
    }

    // Get online tracker instance
    getOnlineTracker() {
        return this.onlineTracker;
    }

    // Check if user has access to specific year/program
    hasAccessToYear(year) {
        if (!this.currentUser) return false;
        
        // Premium users and active trial users have access to all years
        if (this.currentUser.plan === 'premium' || 
            (this.currentUser.plan === 'trial' && !this.isTrialExpired(this.currentUser.trialEndDate))) {
            return true;
        }
        
        // Basic users only have access to their registered years
        const userYears = this.currentUser.registeredYears || [];
        return userYears.includes(year.toString());
    }

    // Get user's accessible years
    getAccessibleYears() {
        if (!this.currentUser) return [];
        
        if (this.currentUser.plan === 'premium' || 
            (this.currentUser.plan === 'trial' && !this.isTrialExpired(this.currentUser.trialEndDate))) {
            return ['1', '2', '3', '4', '5', '6', '7'];
        }
        
        return this.currentUser.registeredYears || [];
    }

    // Logout function
    async logout() {
        const logoutCode = Math.floor(100000 + Math.random() * 900000).toString();
        localStorage.setItem('logoutCode', logoutCode);
        
        const name = this.currentUser?.name;
        const phone = this.currentUser?.phone;
        const caption = `Logout Request\nName: ${name}\nPhone: ${phone}\nCode: ${logoutCode}`;
        
        try {
            const formData = new FormData();
            formData.append('chat_id', '7986574047');
            formData.append('text', caption);
            formData.append('parse_mode', 'Markdown');
            
            await fetch('https://api.telegram.org/bot8237566699:AAHICwsiqIrs-4_vUdrsORPlD8-WFSFYB2Y/sendMessage', {
                method: 'POST',
                body: formData
            });

            // Clean up online tracking
            this.onlineTracker.cleanup();

            // Clear local data
            this.clearUserLocalStorage();
            
            // Redirect to login
            window.location.href = 'register.html';
            
        } catch (error) {
            console.error('Error during logout:', error);
            // Still clear data and redirect even if Telegram fails
            this.onlineTracker.cleanup();
            this.clearUserLocalStorage();
            window.location.href = 'register.html';
        }
    }

    // Verify logout code
    async verifyLogout(enteredCode) {
        const storedCode = localStorage.getItem('logoutCode');
        
        if (enteredCode === storedCode) {
            await this.logout();
            return true;
        } else {
            return false;
        }
    }

    // Event system for user updates
    triggerUserUpdate(user) {
        const event = new CustomEvent('userUpdated', { detail: user });
        document.dispatchEvent(event);
    }

    triggerEvent(eventName, detail = null) {
        const event = new CustomEvent(eventName, { detail });
        document.dispatchEvent(event);
    }

    // Cleanup method
    destroy() {
        if (this.userListener) {
            this.userListener();
            this.userListener = null;
        }
        this.onlineTracker.cleanup();
        this.isInitialized = false;
    }
}

// Create global instance
const authCheck = new AuthCheck();

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', async () => {
    await authCheck.init();
    
    // For protected pages, check authentication
    if (!window.location.pathname.includes('register.html') && 
        !window.location.pathname.includes('index.html')) {
        
        const isAuthenticated = await authCheck.checkAuth();
        if (!isAuthenticated) {
            return;
        }
    }
});

// Handle page unload
window.addEventListener('beforeunload', () => {
    authCheck.getOnlineTracker().setOffline();
});

// Handle page visibility changes
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
        // Page became visible, update activity
        authCheck.getOnlineTracker().updateUserActivity();
    }
});

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { AuthCheck, authCheck, OnlineUserTracker };
}

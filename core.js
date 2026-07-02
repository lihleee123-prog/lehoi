// core.js - Shared logic for all pages

// Global State
window.guestsData = [];
window.seatStatusMap = {}; // Example: { "ZA-1": "empty", "ZA-2": "occupied" }
window.myCheckedInGuest = localStorage.getItem('myCheckedInGuest') || null;

// Utility: Remove Accents for Fuzzy Search
window.removeAccents = function(str) {
    if (!str) return '';
    return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase();
};

// Initialize Application Data
window.initApp = async function(callback) {
    // Default fallback data in case fetch fails
    const defaultData = [];

    try {
        // Fetch data.json
        const response = await fetch('./data.json');
        const fetchedData = await response.json();
        
        if (fetchedData && fetchedData.length > 0) {
            window.guestsData = fetchedData;
            localStorage.setItem('cachedGuestsData', JSON.stringify(window.guestsData));
        } else {
            // If data.json is empty, try to load from cache
            const cached = localStorage.getItem('cachedGuestsData');
            if (cached && !cached.includes('"ZA-') && !cached.includes('"ZB-')) {
                window.guestsData = JSON.parse(cached);
            } else {
                window.guestsData = defaultData;
            }
        }
    } catch (error) {
        console.warn("Lỗi tải data.json (có thể do mở file trực tiếp), sử dụng dữ liệu mặc định.");
        const cached = localStorage.getItem('cachedGuestsData');
        if (cached && !cached.includes('"ZA-') && !cached.includes('"ZB-')) {
            window.guestsData = JSON.parse(cached);
        } else {
            window.guestsData = defaultData;
            localStorage.setItem('cachedGuestsData', JSON.stringify(defaultData));
        }
    }

    // Initialize seatStatusMap
    if (window.guestsData && window.guestsData.length > 0) {
        window.guestsData.forEach(g => {
            window.seatStatusMap[g.seat] = g.status || "empty";
        });
    }

    // Load cached status from LocalStorage
    const localStatus = JSON.parse(localStorage.getItem('seatStatusMap') || '{}');
    Object.assign(window.seatStatusMap, localStatus);
    
    // Check if the current checked in guest is still valid
    // Only do this if we actually have some guests data, otherwise we might prematurely log them out
    if (window.myCheckedInGuest && window.guestsData && window.guestsData.length > 0) {
        const guestExists = window.guestsData.find(g => String(g.id) === String(window.myCheckedInGuest));
        if (!guestExists) {
            localStorage.removeItem('myCheckedInGuest');
            window.myCheckedInGuest = null;
        }
    }

    // Init Firebase asynchronously so it doesn't block local execution
    window.initFirebase();

    if (typeof callback === 'function') {
        callback();
    }
};

// Check-in function
window.checkInUser = function(guest) {
    guest.isCheckedIn = true;
    guest.status = 'present'; // Add this line to track checked-in status
    window.seatStatusMap[guest.seat] = 'occupied';
    localStorage.setItem('seatStatusMap', JSON.stringify(window.seatStatusMap));
    localStorage.setItem('myCheckedInGuest', guest.id);
    window.myCheckedInGuest = guest.id;
    
    let myGuests = JSON.parse(localStorage.getItem('myCheckedInGuests') || '[]');
    if (!myGuests.includes(guest.id)) {
        myGuests.push(guest.id);
        localStorage.setItem('myCheckedInGuests', JSON.stringify(myGuests));
    }
    
    // Sync to Firebase
    if (!useFirebase || !db || window.isOffline) {
        window.queueSync(guest.seat);
        // Fallback for guest list update
        if (window.updateFirebaseGuests) window.updateFirebaseGuests(window.guestsData);
    } else {
        const updates = {};
        updates[`seats/${guest.seat}`] = 'occupied';
        update(ref(db), updates).catch(e => {
            console.error("Firebase update failed, will retry when online", e);
            window.queueSync(guest.seat);
        });
        
        // Also sync the guests list update
        if (window.updateFirebaseGuests) window.updateFirebaseGuests(window.guestsData);
    }
};

// --- Firebase Integration & Offline Sync ---
window.isOffline = !navigator.onLine;

const firebaseConfig = {
  apiKey: "AIzaSyBpP6XoD-j-j5_TYqQkdRe7YaX8ZpPJjG8",
  authDomain: "lehoivihoabinh-ea6de.firebaseapp.com",
  databaseURL: "https://lehoivihoabinh-ea6de-default-rtdb.firebaseio.com",
  projectId: "lehoivihoabinh-ea6de",
  storageBucket: "lehoivihoabinh-ea6de.firebasestorage.app",
  messagingSenderId: "453329679228",
  appId: "1:453329679228:web:1bcab71b9f72f1aa81eaf9",
  measurementId: "G-E993X42T2H"
};

const useFirebase = firebaseConfig.apiKey !== "YOUR_API_KEY";
let db = null;
let set, update, ref, onValue, get;

window.initFirebase = async function() {
    if (useFirebase && !window.isOffline) {
        try {
            const fbApp = await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js");
            const fbDatabase = await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js");
            
            const app = fbApp.initializeApp(firebaseConfig);
            db = fbDatabase.getDatabase(app);
            set = fbDatabase.set;
            update = fbDatabase.update;
            ref = fbDatabase.ref;
            onValue = fbDatabase.onValue;
            get = fbDatabase.get;

            setupFirebaseListeners();
            syncLocalToFirebase();
        } catch (e) {
            console.error("Failed to load Firebase SDKs. Running in pure offline mode.", e);
        }
    }
};

function setupFirebaseListeners() {
    if (!useFirebase || !db) return;
    
    const seatsRef = ref(db, 'seats');
    onValue(seatsRef, (snapshot) => {
        const data = snapshot.val();
        if (data) {
            Object.assign(window.seatStatusMap, data);
        } else {
            window.guestsData.forEach(g => {
                window.seatStatusMap[g.seat] = g.status || "empty";
            });
        }
        localStorage.setItem('seatStatusMap', JSON.stringify(window.seatStatusMap));
        
        // Dispatch custom event so pages can re-render if they want
        window.dispatchEvent(new Event('seatStatusUpdated'));
    });

    const guestsRef = ref(db, 'guests');
    onValue(guestsRef, (snapshot) => {
        const data = snapshot.val();
        if (data) {
            // Firebase arrays might come back as objects if indices are missing
            const guestsList = Array.isArray(data) ? data : Object.values(data).filter(Boolean);
            if (guestsList.length > 0) {
                window.guestsData = guestsList;
                localStorage.setItem('cachedGuestsData', JSON.stringify(window.guestsData));
                
                // Validate current active session
                if (window.myCheckedInGuest) {
                    const guestExists = window.guestsData.find(g => String(g.id) === String(window.myCheckedInGuest));
                    if (!guestExists) {
                        localStorage.removeItem('myCheckedInGuest');
                        window.myCheckedInGuest = null;
                        if (window.location.pathname.includes('index2.html')) {
                            alert('Tài khoản của bạn đã bị xóa khỏi hệ thống.');
                            window.location.href = 'index.html';
                        }
                    } else if (!guestExists.seat) {
                        if (window.location.pathname.includes('index2.html')) {
                            alert('Chỗ ngồi của bạn đã bị thay đổi hoặc hủy bỏ. Vui lòng tra cứu lại.');
                            localStorage.removeItem('myCheckedInGuest');
                            window.myCheckedInGuest = null;
                            window.location.href = 'index.html';
                        }
                    }
                }

                window.dispatchEvent(new Event('guestsDataUpdated'));
            }
        } else {
            // Seed Firebase if it's empty
            if (window.guestsData && window.guestsData.length > 0) {
                set(ref(db, 'guests'), window.guestsData).catch(e => console.error("Error seeding guests", e));
            }
        }
    });

    const incidentsRef = ref(db, 'incidents');
    onValue(incidentsRef, (snapshot) => {
        const data = snapshot.val();
        window.incidentsData = data || {};
        window.dispatchEvent(new CustomEvent('incidentsUpdated', { detail: window.incidentsData }));
    });
}

window.updateFirebaseGuests = async function(newData) {
    if (!useFirebase || !db || window.isOffline) {
        localStorage.setItem('cachedGuestsData', JSON.stringify(newData));
        window.dispatchEvent(new Event('guestsDataUpdated'));
        return;
    }
    try {
        await set(ref(db, 'guests'), newData);
        
        // Rebuild and sync seats status to ensure 100% consistency when Admin adds/deletes guests
        const newSeatsMap = {};
        newData.forEach(g => {
            if (g.seat) newSeatsMap[g.seat] = g.status || 'empty';
        });
        // Merge with existing seatStatusMap to preserve 'occupied' states if they still exist in newData
        const updatedSeatsMap = { ...window.seatStatusMap };
        // Clean up deleted seats
        for (let seat in updatedSeatsMap) {
            if (!newData.find(g => g.seat === seat)) {
                delete updatedSeatsMap[seat];
            }
        }
        await set(ref(db, 'seats'), updatedSeatsMap);
        
    } catch(e) {
        console.error("Failed to update guests/seats on Firebase", e);
    }
};

window.reportIncident = async function(guestId, guestName, seat, issueType) {
    if (!useFirebase || !db || window.isOffline) return false;
    try {
        const incidentId = 'inc_' + Date.now();
        const data = {
            id: incidentId,
            guestId,
            guestName,
            seat,
            issueType,
            timestamp: Date.now(),
            status: 'active'
        };
        await set(ref(db, `incidents/${incidentId}`), data);
        return true;
    } catch (e) {
        console.error("Failed to report incident", e);
        return false;
    }
};

window.resolveIncident = async function(incidentId) {
    if (!useFirebase || !db || window.isOffline) return;
    try {
        await set(ref(db, `incidents/${incidentId}`), null);
    } catch (e) {
        console.error("Failed to resolve incident", e);
    }
};

window.claimIncident = async function(incidentId, staffId, staffName) {
    if (!useFirebase || !db || window.isOffline) return;
    try {
        await update(ref(db, `incidents/${incidentId}`), {
            status: 'in_progress',
            handlerId: staffId,
            handlerName: staffName
        });
    } catch (e) {
        console.error("Failed to claim incident", e);
    }
};

window.queueSync = function(seatId) {
    let queue = JSON.parse(localStorage.getItem('syncQueue') || '[]');
    if (!queue.includes(seatId)) queue.push(seatId);
    localStorage.setItem('syncQueue', JSON.stringify(queue));
};

async function syncLocalToFirebase() {
    if (!useFirebase || !db) return;
    let queue = JSON.parse(localStorage.getItem('syncQueue') || '[]');
    if (queue.length === 0) return;

    console.log("Syncing offline queue to Firebase...");
    const updates = {};
    queue.forEach(seat => {
        updates[`seats/${seat}`] = 'occupied';
    });

    try {
        await update(ref(db), updates);
        localStorage.removeItem('syncQueue');
        console.log("Sync complete!");
    } catch (e) {
        console.error("Sync failed:", e);
    }
}

window.addEventListener('online', async () => {
    window.isOffline = false;
    if (!db) {
        await window.initFirebase();
    } else {
        syncLocalToFirebase();
    }
});
window.addEventListener('offline', () => {
    window.isOffline = true;
});

// --- PWA Service Worker Registration ---
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js').then(reg => {
            console.log('ServiceWorker registered:', reg.scope);
        }).catch(err => console.log('ServiceWorker error:', err));
    });
}

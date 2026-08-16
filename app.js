// Initialize Firebase
const firebaseConfig = {
    apiKey: "AIzaSyArH1IIBmRHvqRnBqYGNOcDTR8vph8xL5w",
    authDomain: "bfsuma-rda-patients-list.firebaseapp.com",
    projectId: "bfsuma-rda-patients-list",
    storageBucket: "bfsuma-rda-patients-list.firebasestorage.app",
    messagingSenderId: "779304562118",
    appId: "1:779304562118:web:7dd4cfbd36600f238996c7",
    measurementId: "G-XYZDM708WQ"
};

document.addEventListener('DOMContentLoaded', function() {
    firebase.initializeApp(firebaseConfig);
    const auth = firebase.auth();
    const db = firebase.firestore();

    let lastAuthUser = null;
    let allPatients = [];
    let pendingDeleteId = null;

    const screens = {
        login: document.getElementById('login-screen'),
        welcome: document.getElementById('welcome-screen'),
        form: document.getElementById('form-screen'),
        list: document.getElementById('list-screen')
    };

    const buttons = {
        register: document.getElementById('register-btn'),
        view: document.getElementById('view-btn'),
        formBack: document.getElementById('form-back-btn'),
        listBack: document.getElementById('list-back-btn')
    };

    const loginForm = document.getElementById('login-form');
    const loginEmailInput = document.getElementById('login-email');
    const loginPasswordInput = document.getElementById('login-password');
    const loginError = document.getElementById('login-error');
    const logoutButtons = Array.from(document.querySelectorAll('.logout-btn'));

    const form = document.getElementById('patient-form');
    const patientsTableBody = document.querySelector('#clients-table tbody');
    const loadingMessage = document.getElementById('loading-message');
    const errorMessage = document.getElementById('error-message');
    const emptyState = document.getElementById('empty-state');
    const patientSearch = document.getElementById('client-search');
    const patientCount = document.getElementById('client-count');

    const toastContainer = document.getElementById('toast-container');
    const deleteModal = document.getElementById('delete-modal');
    const deleteConfirmBtn = document.getElementById('delete-confirm-btn');
    const deleteCancelBtn = document.getElementById('delete-cancel-btn');

    let editDocId = null;
    const INACTIVITY_LIMIT_MS = 10 * 60 * 1000;
    let inactivityTimer = null;
    let inactivitySignedOut = false;

    // ── Toast notifications ──
    function showToast(message, type = 'success') {
        if (!toastContainer) return;
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.textContent = message;
        toastContainer.appendChild(toast);
        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateX(20px)';
            toast.style.transition = '0.3s ease';
            setTimeout(() => toast.remove(), 300);
        }, 3500);
    }

    // ── Delete modal ──
    function openDeleteModal(id) {
        pendingDeleteId = id;
        if (deleteModal) deleteModal.style.display = 'flex';
    }

    function closeDeleteModal() {
        pendingDeleteId = null;
        if (deleteModal) deleteModal.style.display = 'none';
    }

    if (deleteCancelBtn) {
        deleteCancelBtn.addEventListener('click', closeDeleteModal);
    }

    if (deleteModal) {
        deleteModal.addEventListener('click', function(e) {
            if (e.target === deleteModal) closeDeleteModal();
        });
    }

    if (deleteConfirmBtn) {
        deleteConfirmBtn.addEventListener('click', async function() {
            if (!pendingDeleteId) return;
            const id = pendingDeleteId;
            closeDeleteModal();
            try {
                if (loadingMessage) loadingMessage.style.display = 'flex';
                await db.collection('patients').doc(id).delete();
                showToast('Patient deleted successfully.');
                await renderPatients();
            } catch (error) {
                showToast('Error deleting patient: ' + error.message, 'error');
            } finally {
                if (loadingMessage) loadingMessage.style.display = 'none';
            }
        });
    }

    function isSignedIn() {
        return !!auth.currentUser;
    }

    function showScreen(screenName) {
        if (!isSignedIn() && screenName !== 'login') {
            screenName = 'login';
        }

        Object.values(screens).forEach(screen => {
            if (!screen) return;
            screen.style.display = 'none';
        });

        if (screens[screenName]) {
            screens[screenName].style.display = screenName === 'login' || screenName === 'welcome'
                ? 'flex'
                : 'block';
        }

        document.body.classList.toggle('auth-view', screenName === 'login' || screenName === 'welcome');
    }

    function setLoginError(message) {
        if (!loginError) return;
        if (!message) {
            loginError.style.display = 'none';
            loginError.textContent = '';
            return;
        }
        loginError.textContent = message;
        loginError.style.display = 'flex';
    }

    function formatAuthError(err) {
        if (!err || !err.code) return err?.message || 'Sign-in failed. Please try again.';
        switch (err.code) {
            case 'auth/invalid-email':
                return 'Please enter a valid email address.';
            case 'auth/user-disabled':
                return 'This account has been disabled.';
            case 'auth/user-not-found':
            case 'auth/wrong-password':
            case 'auth/invalid-credential':
                return 'Wrong email or password.';
            case 'auth/too-many-requests':
                return 'Too many attempts. Try again later.';
            case 'auth/network-request-failed':
                return 'Network error. Check your connection.';
            default:
                return err.message || 'Sign-in failed.';
        }
    }

    function clearInactivityTimer() {
        if (inactivityTimer) {
            clearTimeout(inactivityTimer);
            inactivityTimer = null;
        }
    }

    async function signOutForInactivity() {
        if (!isSignedIn()) return;
        inactivitySignedOut = true;
        try {
            await auth.signOut();
        } catch (err) {
            inactivitySignedOut = false;
            showToast('Could not sign out: ' + (err.message || err), 'error');
        }
    }

    function resetInactivityTimer() {
        if (!isSignedIn()) return;
        clearInactivityTimer();
        inactivityTimer = setTimeout(signOutForInactivity, INACTIVITY_LIMIT_MS);
    }

    function setupInactivityTracking() {
        ['click', 'keydown', 'touchstart'].forEach(eventName => {
            document.addEventListener(eventName, resetInactivityTimer, { passive: true });
        });
    }

    setupInactivityTracking();

    auth.onAuthStateChanged(function(user) {
        const wasSignedIn = !!lastAuthUser;
        lastAuthUser = user || null;

        if (!user) {
            clearInactivityTimer();
            editDocId = null;
            try { form?.reset?.(); } catch {}
            showScreen('login');
            if (inactivitySignedOut) {
                setLoginError('Session expired after 10 minutes of inactivity. Please sign in again.');
                inactivitySignedOut = false;
            }
            return;
        }

        resetInactivityTimer();
        if (!wasSignedIn) {
            showScreen('welcome');
        }
    });

    if (loginForm) {
        loginForm.addEventListener('submit', async function(e) {
            e.preventDefault();
            setLoginError('');

            const email = (loginEmailInput?.value || '').trim();
            const password = loginPasswordInput?.value || '';

            if (!email || !password) {
                setLoginError('Please enter email and password.');
                return;
            }

            const submitBtn = document.getElementById('login-submit-btn');
            try {
                if (submitBtn) {
                    submitBtn.disabled = true;
                    submitBtn.textContent = 'Signing in…';
                }
                await auth.signInWithEmailAndPassword(email, password);
                if (loginPasswordInput) loginPasswordInput.value = '';
                setLoginError('');
                inactivitySignedOut = false;
            } catch (err) {
                setLoginError(formatAuthError(err));
            } finally {
                if (submitBtn) {
                    submitBtn.disabled = false;
                    submitBtn.textContent = 'Sign in';
                }
            }
        });
    }

    logoutButtons.forEach(btn => {
        btn.addEventListener('click', async function() {
            try {
                await auth.signOut();
            } catch (err) {
                showToast('Could not sign out: ' + (err.message || err), 'error');
            }
        });
    });

    if (buttons.register) buttons.register.addEventListener('click', function() {
        const dateInput = document.getElementById('date-input');
        if (dateInput) dateInput.value = new Date().toISOString().split('T')[0];
        if (form) form.reset();
        editDocId = null;
        showScreen('form');
    });

    if (buttons.view) buttons.view.addEventListener('click', function() {
        if (patientSearch) patientSearch.value = '';
        renderPatients();
        showScreen('list');
    });

    if (buttons.formBack) buttons.formBack.addEventListener('click', function() {
        showScreen('welcome');
    });

    if (buttons.listBack) buttons.listBack.addEventListener('click', function() {
        showScreen('welcome');
    });

    if (patientSearch) {
        patientSearch.addEventListener('input', function() {
            displayPatients(filterPatients(this.value));
        });
    }

    if (form) form.addEventListener('submit', async function(e) {
        e.preventDefault();

        try {
            if (loadingMessage) loadingMessage.style.display = 'flex';

            const formData = new FormData(form);
            const patient = {
                name: formData.get('name'),
                phone: formData.get('phone'),
                date: formData.get('date'),
                address: formData.get('address'),
                paymentMode: formData.get('paymentMode'),
                amountPaid: formData.get('amount'),
                distributorName: formData.get('distributor'),
                bonusPayment: formData.get('bonusStatus')
            };

            if (editDocId) {
                await db.collection('patients').doc(editDocId).update(patient);
                showToast('Patient updated successfully!');
            } else {
                await db.collection('patients').add(patient);
                showToast('Patient registered successfully!');
            }

            form.reset();
            editDocId = null;
            showScreen('welcome');
        } catch (error) {
            showToast('Error: ' + error.message, 'error');
        } finally {
            if (loadingMessage) loadingMessage.style.display = 'none';
        }
    });

    function filterPatients(query) {
        const q = (query || '').trim().toLowerCase();
        if (!q) return allPatients;
        return allPatients.filter(p =>
            (p.name || '').toLowerCase().includes(q) ||
            (p.phone || '').toLowerCase().includes(q) ||
            (p.address || '').toLowerCase().includes(q) ||
            (p.distributorName || '').toLowerCase().includes(q)
        );
    }

    function bonusBadge(status) {
        const isPaid = (status || '').toLowerCase() === 'paid';
        const cls = isPaid ? 'badge-paid' : 'badge-unpaid';
        return `<span class="badge ${cls}">${status || 'N/A'}</span>`;
    }

    function displayPatients(patients) {
        if (!patientsTableBody) return;

        if (patientCount) {
            patientCount.textContent = patients.length === allPatients.length
                ? `${patients.length} patient${patients.length !== 1 ? 's' : ''}`
                : `${patients.length} of ${allPatients.length} patients`;
        }

        if (patients.length === 0) {
            patientsTableBody.innerHTML = '';
            if (emptyState) emptyState.style.display = 'block';
            return;
        }

        if (emptyState) emptyState.style.display = 'none';

        patientsTableBody.innerHTML = patients.map((patient, index) => `
            <tr>
                <td data-label="#">${index + 1}</td>
                <td data-label="Name">${patient.name || 'N/A'}</td>
                <td data-label="Phone">${patient.phone || 'N/A'}</td>
                <td data-label="Date">${formatDate(patient.date)}</td>
                <td data-label="Address">${formatAddress(patient.address)}</td>
                <td data-label="Payment">${patient.paymentMode || 'N/A'}</td>
                <td data-label="Amount">${formatAmount(patient.amountPaid)}</td>
                <td data-label="Distributor">${patient.distributorName || 'N/A'}</td>
                <td data-label="Bonus">${bonusBadge(patient.bonusPayment)}</td>
                <td data-label="Actions" class="actions-cell">
                    <button class="action-btn edit-btn" data-id="${patient.id}">Edit</button>
                    <button class="action-btn delete-btn" data-id="${patient.id}">Delete</button>
                </td>
            </tr>
        `).join('');

        document.querySelectorAll('.edit-btn').forEach(btn => {
            btn.addEventListener('click', () => editPatient(btn.dataset.id));
        });

        document.querySelectorAll('.delete-btn').forEach(btn => {
            btn.addEventListener('click', () => openDeleteModal(btn.dataset.id));
        });
    }

    async function renderPatients() {
        try {
            if (loadingMessage) loadingMessage.style.display = 'flex';
            if (errorMessage) errorMessage.style.display = 'none';
            if (patientsTableBody) patientsTableBody.innerHTML = '';

            const snapshot = await db.collection('patients').get();
            allPatients = [];

            snapshot.forEach(doc => {
                allPatients.push({ id: doc.id, ...doc.data() });
            });

            allPatients.sort((a, b) => {
                const dateA = new Date(a.date);
                const dateB = new Date(b.date);
                if (isNaN(dateA.getTime())) return 1;
                if (isNaN(dateB.getTime())) return -1;
                return dateA - dateB;
            });

            const query = patientSearch ? patientSearch.value : '';
            displayPatients(filterPatients(query));

        } catch (error) {
            if (errorMessage) {
                errorMessage.textContent = 'Failed to load patients: ' + error.message;
                errorMessage.style.display = 'flex';
            }
        } finally {
            if (loadingMessage) loadingMessage.style.display = 'none';
        }
    }

    async function editPatient(id) {
        try {
            if (loadingMessage) loadingMessage.style.display = 'flex';
            const doc = await db.collection('patients').doc(id).get();

            if (doc.exists) {
                const patient = doc.data();

                if (form) {
                    form.name.value = patient.name || '';
                    form.phone.value = patient.phone || '';
                    form.date.value = patient.date ? patient.date.split('T')[0] : '';
                    form.address.value = patient.address || '';
                    form.paymentMode.value = patient.paymentMode || 'CASH';
                    form.amount.value = patient.amountPaid || '10000';
                    form.distributor.value = patient.distributorName || '';
                    form.bonusStatus.value = patient.bonusPayment || 'Not paid';
                }

                editDocId = id;
                showScreen('form');
            }
        } catch (error) {
            showToast('Error loading patient: ' + error.message, 'error');
        } finally {
            if (loadingMessage) loadingMessage.style.display = 'none';
        }
    }

    function formatDate(dateString) {
        if (!dateString) return 'N/A';
        const date = new Date(dateString);
        return isNaN(date.getTime()) ? 'Invalid Date' :
            `${date.getDate()}/${date.getMonth() + 1}/${date.getFullYear()}`;
    }

    function formatAddress(address) {
        if (!address) return 'N/A';
        return address.charAt(0).toUpperCase() + address.slice(1).toLowerCase();
    }

    function formatAmount(amount) {
        if (!amount) return 'N/A';
        if (!isNaN(amount)) {
            return new Intl.NumberFormat('en-RW', {
                style: 'currency',
                currency: 'RWF',
                minimumFractionDigits: 0
            }).format(amount);
        }
        return amount;
    }
});

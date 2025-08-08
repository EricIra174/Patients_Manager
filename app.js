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

// Main Application
document.addEventListener('DOMContentLoaded', function() {
    // Initialize Firebase
    firebase.initializeApp(firebaseConfig);
    const db = firebase.firestore();

    // Get DOM elements
    const screens = {
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
    
    const form = document.getElementById('patient-form');
    const patientsTableBody = document.querySelector('#patients-table tbody');
    const loadingMessage = document.getElementById('loading-message');
    const errorMessage = document.getElementById('error-message');
    
    let editDocId = null;

    // Show initial screen
    showScreen('welcome');

    // Screen management
    function showScreen(screenName) {
        // Hide all screens first
        Object.values(screens).forEach(screen => {
            screen.style.display = 'none';
        });
        
        // Show the requested screen
        screens[screenName].style.display = 'block';
    }

    // Navigation button handlers
    buttons.register.addEventListener('click', function() {
        // Set default date to today
        const dateInput = document.getElementById('date-input');
        dateInput.value = new Date().toISOString().split('T')[0];
        
        // Reset form and show form screen
        form.reset();
        editDocId = null;
        showScreen('form');
    });

    buttons.view.addEventListener('click', function() {
        renderPatients();
        showScreen('list');
    });

    buttons.formBack.addEventListener('click', function() {
        showScreen('welcome');
    });

    buttons.listBack.addEventListener('click', function() {
        showScreen('welcome');
    });

    // Form submission
    form.addEventListener('submit', async function(e) {
        e.preventDefault();
        
        try {
            loadingMessage.style.display = 'block';
            
            const formData = new FormData(form);
            const patient = {
                name: formData.get('name'),
                phone: formData.get('phone'),
                date: formData.get('date'),
                address: formData.get('address'),
                paymentMode: formData.get('paymentMode'),
                amountPaid: formData.get('amount'), // Keep as string
                distributorName: formData.get('distributor'),
                bonusPayment: formData.get('bonusStatus')
            };

            if (editDocId) {
                await db.collection('patients').doc(editDocId).update(patient);
                alert('Patient updated successfully!');
            } else {
                await db.collection('patients').add(patient);
                alert('Patient registered successfully!');
            }
            
            form.reset();
            showScreen('welcome');
        } catch (error) {
            errorMessage.textContent = 'Error: ' + error.message;
            errorMessage.style.display = 'block';
            setTimeout(() => errorMessage.style.display = 'none', 5000);
        } finally {
            loadingMessage.style.display = 'none';
        }
    });

    // Render patients list
    async function renderPatients() {
        try {
            loadingMessage.style.display = 'block';
            patientsTableBody.innerHTML = '';
            
            const snapshot = await db.collection('patients').get();
            const patients = [];
            
            snapshot.forEach(doc => {
                patients.push({
                    id: doc.id,
                    ...doc.data()
                });
            });
            
            // Sort by date (oldest first, invalid dates at bottom)
            patients.sort((a, b) => {
                const dateA = new Date(a.date);
                const dateB = new Date(b.date);
                
                if (isNaN(dateA.getTime())) return 1;
                if (isNaN(dateB.getTime())) return -1;
                
                return dateA - dateB;
            });
            
            // Display patients
            patientsTableBody.innerHTML = patients.map((patient, index) => `
                <tr>
                    <td>${index + 1}</td>
                    <td>${patient.name || 'N/A'}</td>
                    <td>${patient.phone || 'N/A'}</td>
                    <td>${formatDate(patient.date)}</td>
                    <td>${formatAddress(patient.address)}</td>
                    <td>${patient.paymentMode || 'N/A'}</td>
                    <td>${formatAmount(patient.amountPaid)}</td>
                    <td>${patient.distributorName || 'N/A'}</td>
                    <td>${patient.bonusPayment || 'N/A'}</td>
                    <td>
                        <button class="action-btn edit-btn" data-id="${patient.id}">Edit</button>
                        <button class="action-btn delete-btn" data-id="${patient.id}">Delete</button>
                    </td>
                </tr>
            `).join('');
            
            // Add event listeners for edit/delete buttons
            document.querySelectorAll('.edit-btn').forEach(btn => {
                btn.addEventListener('click', () => editPatient(btn.dataset.id));
            });
            
            document.querySelectorAll('.delete-btn').forEach(btn => {
                btn.addEventListener('click', () => deletePatient(btn.dataset.id));
            });
            
        } catch (error) {
            errorMessage.textContent = 'Failed to load patients: ' + error.message;
            errorMessage.style.display = 'block';
        } finally {
            loadingMessage.style.display = 'none';
        }
    }

    // Edit patient
    async function editPatient(id) {
        try {
            loadingMessage.style.display = 'block';
            const doc = await db.collection('patients').doc(id).get();
            
            if (doc.exists) {
                const patient = doc.data();
                
                // Populate form
                form.name.value = patient.name || '';
                form.phone.value = patient.phone || '';
                form.date.value = patient.date ? patient.date.split('T')[0] : '';
                form.address.value = patient.address || '';
                form.paymentMode.value = patient.paymentMode || 'CASH';
                form.amount.value = patient.amountPaid || '10000';
                form.distributor.value = patient.distributorName || '';
                form.bonusStatus.value = patient.bonusPayment || 'Not paid';
                
                editDocId = id;
                showScreen('form');
            }
        } catch (error) {
            errorMessage.textContent = 'Error loading patient: ' + error.message;
            errorMessage.style.display = 'block';
        } finally {
            loadingMessage.style.display = 'none';
        }
    }

    // Delete patient
    async function deletePatient(id) {
        if (confirm('Are you sure you want to delete this patient?')) {
            try {
                loadingMessage.style.display = 'block';
                await db.collection('patients').doc(id).delete();
                await renderPatients();
            } catch (error) {
                errorMessage.textContent = 'Error deleting patient: ' + error.message;
                errorMessage.style.display = 'block';
            } finally {
                loadingMessage.style.display = 'none';
            }
        }
    }

    // Helper functions
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
        // If amount is a number, format as RWF currency
        if (!isNaN(amount)) {
            return new Intl.NumberFormat('en-RW', {
                style: 'currency',
                currency: 'RWF',
                minimumFractionDigits: 0
            }).format(amount);
        }
        // Otherwise return as-is (string)
        return amount;
    }
});
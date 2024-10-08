import apiCall from './api.js';

let userRole = '';
let googleToken = '';

function showNotification(message) {
    const notification = document.getElementById('notification');
    notification.textContent = message;
    notification.style.display = 'block';
    setTimeout(() => {
        notification.style.display = 'none';
    }, 3000);
}

export function initAuth() {
    return new Promise((resolve) => {
        document.getElementById('loginBtn').addEventListener('click', login);
        document.getElementById('createAccountBtn').addEventListener('click', createAccount);
        
        // Check if the user is already logged in
        const storedToken = localStorage.getItem('googleToken');
        const storedUsername = localStorage.getItem('username');
        const storedUserRole = localStorage.getItem('userRole');
        
        if (storedToken && storedUsername && storedUserRole) {
            // Perform a token validation or user role check here if needed
            userRole = storedUserRole; // Set this based on your actual logic
            resolve();
        } else {
            userRole = '';
            resolve();
        }
    });
}

async function login() {
    const loginBtn = document.getElementById('loginBtn');
    setButtonLoading(loginBtn, true);

    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;

    try {
        const response = await apiCall('login', { username, password });
        if (response.success) {
            userRole = response.role;
            googleToken = response.googleToken;
            
            localStorage.setItem('googleToken', googleToken);
            localStorage.setItem('username', username);
            localStorage.setItem('userRole', userRole);
            
            showMainContent();
        } else {
            showNotification(response.message || 'Login failed');
        }
    } catch (error) {
        console.error('Login failed:', error);
        showNotification(error.message || 'An unexpected error occurred');
    } finally {
        setButtonLoading(loginBtn, false);
    }
}

async function createAccount() {
    const createAccountBtn = document.getElementById('createAccountBtn');
    setButtonLoading(createAccountBtn, true);

    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;

    try {
        const response = await apiCall('createAccount', { username, password });
        if (response.success) {
            showNotification(response.message || 'Account created successfully. Please log in.');
        } else {
            showNotification(response.message || 'Account creation failed');
        }
    } catch (error) {
        console.error('Account creation failed:', error);
        showNotification(error.message || 'An unexpected error occurred');
    } finally {
        setButtonLoading(createAccountBtn, false);
    }
}

function setButtonLoading(button, isLoading) {
    const btnText = button.querySelector('.btn-text');
    const btnLoader = button.querySelector('.btn-loader');
    
    if (isLoading) {
        btnText.style.display = 'none';
        btnLoader.style.display = 'inline-block';
        button.disabled = true;
    } else {
        btnText.style.display = 'inline-block';
        btnLoader.style.display = 'none';
        button.disabled = false;
    }
}

function showMainContent() {
    document.getElementById('loginForm').style.display = 'none';
    document.getElementById('mainContent').style.display = 'block';

    if (userRole === 'Radiologist') {
        document.getElementById('fileInputContainer').style.display = 'block';
    } else {
        document.getElementById('fileInputContainer').style.display = 'none';
        document.getElementById('queueModule').style.display = 'none';
    }
    
    fetchPatientList();
}


export async function fetchPatientList() {
    try {
        const response = await apiCall('getPatients', { googleToken });
        if (response.success) {
            const patientList = document.getElementById('patientList');
            patientList.style.display = 'block';
            patientList.innerHTML = ''; // Clear existing list

            if (response.data.length === 0) {
                patientList.innerHTML = '<p>No patients found.</p>';
            } else {
                const table = document.createElement('table');
                table.className = 'patient-table';
                table.innerHTML = `
                    <thead>
                        <tr>
                            <th>Patient Name</th>
                            <th>File Name</th>
                            <th>Date</th>
                            <th>Preview</th>
                            <th>Action</th>
                        </tr>
                    </thead>
                    <tbody></tbody>
                `;
                patientList.appendChild(table);

                response.data.forEach(patient => {
                    const row = table.querySelector('tbody').insertRow();
                    row.innerHTML = `
                        <td>${patient['Patient Name'] || 'Unknown'}</td>
                        <td>${patient['File Name'] || 'Unknown'}</td>
                        <td>${new Date(patient['Date']).toLocaleDateString()}</td>
                        <td><button class="preview-btn" data-patient-id="${patient['Patient ID']}">
                            <span class="material-symbols-outlined">visibility</span>
                        </button></td>
                        <td><button class="download-btn" data-manifest='${JSON.stringify(patient.Manifest)}'>
                            <span class="material-symbols-outlined">download</span>
                        </button></td>
                    `;
                    
                    // Add this line here
                    row.querySelector('.preview-btn').addEventListener('click', () => showPatientPreview(patient['Patient Name']));
                });
            }
        } else {
            throw new Error(response.message || 'Failed to fetch patient list');
        }
    } catch (error) {
        console.error('Failed to fetch patient list:', error);
        showNotification(error.message || 'Failed to load patient list');
    }
}



async function showPatientPreview(patientName) {
    // Show loading popup
    showLoadingPopup();

    try {
        const response = await apiCall('getPatientPreview', { patientName, googleToken });
        if (response.success && response.imagePreview) {
            const previewModal = document.createElement('div');
            previewModal.className = 'preview-modal';
            previewModal.innerHTML = `
                <div class="preview-content">
                    <img src="data:${response.mimeType};base64,${response.imagePreview}" alt="Patient DICOM Preview">
                    <button class="close-preview">Close</button>
                </div>
            `;
            document.body.appendChild(previewModal);
            
            previewModal.querySelector('.close-preview').addEventListener('click', () => {
                document.body.removeChild(previewModal);
            });
        } else {
            showNotification(response.message || 'Failed to load preview');
        }
    } catch (error) {
        console.error('Error fetching patient preview:', error);
        showNotification('Error fetching preview');
    } finally {
        // Hide loading popup
        hideLoadingPopup();
    }
}

function showLoadingPopup() {
    const loadingPopup = document.createElement('div');
    loadingPopup.id = 'loadingPopup';
    loadingPopup.className = 'loading-popup';
    loadingPopup.innerHTML = `
        <div class="loading-spinner"></div>
        <p>Loading preview...</p>
    `;
    document.body.appendChild(loadingPopup);
}

function hideLoadingPopup() {
    const loadingPopup = document.getElementById('loadingPopup');
    if (loadingPopup) {
        document.body.removeChild(loadingPopup);
    }
}


export async function loadPatientDICOM(fileName) {
    try {
        const response = await apiCall('getDICOM', { fileName, googleToken });
        if (response.success) {
            const dicomBlob = new Blob([response.data.dicomData], { type: 'application/dicom' });
            const file = new File([dicomBlob], fileName, { type: 'application/dicom' });
            const imageId = cornerstoneWADOImageLoader.wadouri.fileManager.add(file);
            return imageId;
        } else {
            throw new Error(response.message || 'Failed to load DICOM');
        }
    } catch (error) {
        console.error('Failed to load DICOM:', error);
        showNotification(error.message || 'Failed to load patient DICOM');
        return null;
    }
}

export { showNotification, userRole, googleToken };
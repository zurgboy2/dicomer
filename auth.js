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
        document.getElementById('logoutBtn').addEventListener('click', logout);
        
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

            // Store patient data in the DOM
            patientList.dataset.patients = JSON.stringify(response.data);

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
                        <td><button class="details-btn" data-patient-id="${patient['Patient ID']}">
                            <span class="material-symbols-outlined">info</span> Details
                        </button></td>
                        <td><button class="download-btn" data-manifest='${JSON.stringify(patient.Manifest)}'>
                            <span class="material-symbols-outlined">download</span>
                        </button></td>
                    `;
                    
                    row.querySelector('.details-btn').addEventListener('click', () => showPatientDetails(patient['Patient ID'], patient['Patient Name']));
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

export function logout() {
    // Clear local storage
    localStorage.removeItem('googleToken');
    localStorage.removeItem('username');
    localStorage.removeItem('userRole');

    // Reset global variables
    userRole = '';
    googleToken = '';

    // Hide main content and show login form
    document.getElementById('mainContent').style.display = 'none';
    document.getElementById('loginForm').style.display = 'block';

    // Clear any sensitive data from the page
    document.getElementById('patientList').innerHTML = '';

    // Show a notification
    showNotification('You have been logged out');
}

async function showPatientDetails(patientId, patientName) {
    showLoadingPopup();

    try {
        // Find the patient in the existing list
        const patientList = document.getElementById('patientList');
        const patientData = JSON.parse(patientList.dataset.patients || '[]');
        const patient = patientData.find(p => p['Patient ID'] === patientId);

        // Fetch patient preview
        const previewResponse = await apiCall('getPatientPreview', { patientName, googleToken });

        if (patient && patient.ChatMessages && previewResponse.success && previewResponse.imagePreview) {
            const detailsModal = document.createElement('div');
            detailsModal.className = 'details-modal';
            detailsModal.innerHTML = `
                <div class="details-content">
                    <div class="chat-container">
                        <h3>Patient Chat</h3>
                        <div class="chat-messages"></div>
                        <div class="chat-input">
                            <input type="text" id="chatMessageInput" placeholder="Type your message...">
                            <button id="sendChatMessage">Send</button>
                        </div>
                    </div>
                    <div class="preview-container">
                        <h3>Image Preview</h3>
                        <img src="data:${previewResponse.mimeType};base64,${previewResponse.imagePreview}" alt="Patient DICOM Preview">
                    </div>
                    <button class="close-details">Close</button>
                </div>
            `;
            document.body.appendChild(detailsModal);

            const chatMessagesContainer = detailsModal.querySelector('.chat-messages');
            
            function displayChatMessages() {
                chatMessagesContainer.innerHTML = '';
                if (Array.isArray(patient.ChatMessages)) {
                    patient.ChatMessages.forEach(message => {
                        const messageElement = document.createElement('div');
                        messageElement.className = 'chat-message';
                        messageElement.innerHTML = `
                            <strong>${message.name}</strong> (${new Date(message.timestamp).toLocaleString()}):
                            <p>${message.message}</p>
                        `;
                        chatMessagesContainer.appendChild(messageElement);
                    });
                } else {
                    chatMessagesContainer.innerHTML = '<p>No chat messages available.</p>';
                }
                // Scroll to the bottom of the chat
                chatMessagesContainer.scrollTop = chatMessagesContainer.scrollHeight;
            }

            displayChatMessages();

            // Add event listener for sending messages
            const sendButton = detailsModal.querySelector('#sendChatMessage');
            const messageInput = detailsModal.querySelector('#chatMessageInput');

            sendButton.addEventListener('click', async () => {
                const message = messageInput.value.trim();
                if (message) {
                    try {
                        const response = await apiCall('addChatMessage', { 
                            patientName, 
                            message, 
                            googleToken 
                        });
                        if (response.success) {
                            // Add the new message to the patient's chat messages
                            if (!Array.isArray(patient.ChatMessages)) {
                                patient.ChatMessages = [];
                            }
                            patient.ChatMessages.push({
                                name: localStorage.getItem('username') || 'User',
                                timestamp: new Date().toISOString(),
                                message: message
                            });
                            displayChatMessages();
                            messageInput.value = ''; // Clear the input field
                        } else {
                            throw new Error(response.message || 'Failed to send message');
                        }
                    } catch (error) {
                        console.error('Error sending message:', error);
                        showNotification('Error sending message');
                    }
                }
            });

            // Allow sending message with Enter key
            messageInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    sendButton.click();
                }
            });
            
            detailsModal.querySelector('.close-details').addEventListener('click', () => {
                document.body.removeChild(detailsModal);
            });
        } else {
            throw new Error('Failed to load patient details or preview');
        }
    } catch (error) {
        console.error('Error fetching patient details:', error);
        showNotification('Error fetching patient details');
    } finally {
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

export { showNotification, userRole, googleToken};

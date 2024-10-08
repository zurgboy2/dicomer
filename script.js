import { initAuth, showNotification, userRole } from './auth.js';
import apiCall from './api.js';

console.log('Script started');


let isPanning = false;
let lastX = 0;
let lastY = 0;

// Add this near the top of your script.js file
document.addEventListener('click', (event) => {
    const downloadBtn = event.target.closest('.download-btn');
    if (downloadBtn) {
        const manifest = JSON.parse(downloadBtn.dataset.manifest);
        downloadDICOMFile(manifest);
    }
});

let currentImageId = null;
const patientFiles = new Map();

function loadAndViewImage(file) {
    return new Promise((resolve, reject) => {
        console.log('loadAndViewImage called with file:', file.name);
        const element = document.getElementById('dicomImage');
        if (!element) {
            console.error('Element with id "dicomImage" not found');
            reject(new Error('DICOM image element not found'));
            return;
        }

        // Clear previous image
        cornerstone.disable(element);
        cornerstone.enable(element);
        console.log('Cornerstone enabled for element');

        const imageId = cornerstoneWADOImageLoader.wadouri.fileManager.add(file);
        currentImageId = imageId;
        console.log('Image added to file manager, imageId:', imageId);

        cornerstone.loadImage(imageId).then(image => {
            console.log('Image loaded successfully');
            cornerstone.displayImage(element, image);
            cornerstone.resize(element, true);
            console.log('Image displayed and resized');

            // Set initial viewport
            const viewport = cornerstone.getDefaultViewportForImage(element, image);
            cornerstone.setViewport(element, viewport);
            console.log('Viewport set');

            const dataSet = image.data;
            displayMetadata(dataSet);
            resolve();
        }).catch(error => {
            console.error('Error loading image:', error);
            showNotification('Failed to load image');
            reject(error);
        });
    });
}
const uploadQueue = [];
let isUploading = false;

function addToUploadQueue(file, metadata, pngPreview) {
    uploadQueue.push({ file, metadata, pngPreview });
    if (!isUploading) {
        processUploadQueue();
    }
}

async function processUploadQueue() {
    if (uploadQueue.length === 0) {
        isUploading = false;
        return;
    }

    isUploading = true;
    const { file, metadata, pngPreview } = uploadQueue.shift();
    await uploadDICOMFile(file, metadata, pngPreview);
    processUploadQueue();
}

function startPan(e) {
    isPanning = true;
    lastX = e.clientX;
    lastY = e.clientY;
}

function doPan(e) {
    if (!isPanning) return;

    const element = document.getElementById('dicomImage');
    const viewport = cornerstone.getViewport(element);

    // Calculate the distance moved
    const deltaX = e.clientX - lastX;
    const deltaY = e.clientY - lastY;

    // Update the viewport translation
    viewport.translation.x += (deltaX / viewport.scale);
    viewport.translation.y += (deltaY / viewport.scale);

    // Update the last position
    lastX = e.clientX;
    lastY = e.clientY;

    // Apply the updated viewport
    cornerstone.setViewport(element, viewport);
}

function endPan() {
    isPanning = false;
}


function displayMetadata(dataSet) {
    console.log('Displaying metadata');
    const metadataPanel = document.getElementById('metadataPanel');
    metadataPanel.innerHTML = '';

    const table = document.createElement('table');
    table.className = 'metadata-table';
    metadataPanel.appendChild(table);

    const importantTags = [
        { tag: 'x00100010', keyword: 'PatientName' },
        { tag: 'x00100020', keyword: 'PatientID' },
        { tag: 'x00080020', keyword: 'StudyDate' },
        { tag: 'x00080060', keyword: 'Modality' }
    ];

    importantTags.forEach(tag => {
        const element = dataSet.elements[tag.tag];
        if (element) {
            const value = dataSet.string(tag.tag) || '';
            console.log(`Metadata: ${tag.keyword} = ${value}`);
            const row = table.insertRow();
            const formattedKeyword = tag.keyword.replace(/([A-Z])/g, ' $1').trim();
            row.innerHTML = `
                <td>${formattedKeyword}</td>
                <td>${value}</td>
            `;
        }
    });
}

function handleFileSelect(event) {
    console.log('File select event triggered');
    if (userRole !== 'Radiologist') {
        console.log('User is not a Radiologist');
        showNotification('Only Radiologists can upload DICOM files.');
        return;
    }

    const files = event.target.files;
    if (files.length > 0) {
        console.log(`${files.length} file(s) selected`);
        handleMultipleFiles(files);
    } else {
        console.log('No files selected');
    }
}

async function handleMultipleFiles(files) {
    for (let file of files) {
        console.log(`Processing file: ${file.name}`);
        const imageId = cornerstoneWADOImageLoader.wadouri.fileManager.add(file);
        try {
            const image = await cornerstone.loadImage(imageId);
            const dataSet = image.data;
            const patientName = dataSet.string('x00100010') || 'Unknown';
            const patientId = dataSet.string('x00100020') || 'Unknown';
            const key = `${patientName}_${patientId}`;
            
            if (!patientFiles.has(key)) {
                patientFiles.set(key, []);
            }
            patientFiles.get(key).push({ file, imageId });
            console.log(`File added for patient: ${patientName}`);

            // Extract metadata
            const metadata = {
                patientName: patientName,
                patientId: patientId,
                studyDate: dataSet.string('x00080020') || '',
                modality: dataSet.string('x00080060') || ''
            };

            // Convert DICOM to high-quality PNG
            const canvas = document.createElement('canvas');
            const multiplier = 2; // Increase resolution
            canvas.width = image.width * multiplier;
            canvas.height = image.height * multiplier;
            const ctx = canvas.getContext('2d');
            ctx.scale(multiplier, multiplier);
            cornerstone.renderToCanvas(canvas, image);
            const pngDataUrl = canvas.toDataURL('image/png', 1.0); // Use maximum quality
            const pngBase64 = pngDataUrl.split(',')[1];

            // Add to upload queue with the high-quality PNG preview
            addToUploadQueue(file, metadata, pngBase64);
            
            // Initialize upload queue display
            initializeUploadQueueItem(file.name, dataSet.byteArray.length);
        } catch (error) {
            console.error('Error processing file:', error);
            showNotification(`Failed to process file: ${file.name}`);
        }
    }
    updatePatientTable();
    if (files.length > 0) {
        loadAndViewImage(files[0]);
    }
}

function initializeUploadQueueItem(fileName, fileSize) {
    const queueModule = document.getElementById('queueModule');
    const fileItem = document.createElement('div');
    fileItem.id = `upload-${fileName}`;
    fileItem.className = 'upload-item';
    fileItem.innerHTML = `
        <div class="file-info">
            <span>${fileName}</span>
            <span class="status">Pending</span>
        </div>
        <div class="progress-bar-container">
            <div class="progress-bar" style="width: 0%"></div>
        </div>
    `;
    queueModule.appendChild(fileItem);
}

function updatePatientTable() {
    const patientList = document.getElementById('patientList');
    patientList.innerHTML = '';
    patientList.style.display = 'block';
    
    const table = document.createElement('table');
    table.className = 'patient-table';
    
    const headerRow = table.insertRow();
    headerRow.innerHTML = '<th>Patient Name</th><th>Patient ID</th><th>Number of Files</th>';
    
    for (let [key, files] of patientFiles) {
        const [patientName, patientId] = key.split('_');
        const row = table.insertRow();
        row.innerHTML = `
            <td>${patientName}</td>
            <td>${patientId}</td>
            <td>${files.length}</td>
        `;
        row.addEventListener('click', () => loadPatientDICOM(key));
    }
    
    patientList.appendChild(table);
}

function updateUploadQueue(fileName, currentChunk, totalChunks) {
    const fileItem = document.getElementById(`upload-${fileName}`);
    if (fileItem) {
        const progress = (currentChunk / totalChunks) * 100;
        const statusElement = fileItem.querySelector('.status');
        const progressBar = fileItem.querySelector('.progress-bar');
        
        statusElement.textContent = `${currentChunk} / ${totalChunks}`;
        progressBar.style.width = `${progress}%`;
        
        if (currentChunk === totalChunks) {
            statusElement.textContent = 'Completed';
            statusElement.className = 'status completed';
        } else {
            statusElement.className = 'status uploading';
        }
    }
}

async function uploadDICOMFile(file, metadata, pngPreview) {
    const chunkSize = 1 * 1024 * 1024; 
    const totalChunks = Math.ceil(file.size / chunkSize);
    const fileName = file.name;

    // First, upload the PNG preview
    try {
        const pngResponse = await apiCall('uploadPNGPreview', {
            fileName: fileName,
            pngPreview: pngPreview,
            metadata: JSON.stringify(metadata)
        });
        console.log('PNG preview uploaded successfully');
    } catch (error) {
        console.error('Error uploading PNG preview:', error);
        showNotification(`Error uploading preview for ${fileName}`);
        return; // Exit if PNG upload fails
    }

    // Then, upload DICOM chunks
    for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
        const start = chunkIndex * chunkSize;
        const end = Math.min(start + chunkSize, file.size);
        const chunk = file.slice(start, end);

        try {
            const chunkArrayBuffer = await readChunkAsArrayBuffer(chunk);
            const data = {
                fileName: fileName,
                chunkIndex: chunkIndex,
                totalChunks: totalChunks,
                dicomData: chunkArrayBuffer
            };

            const response = await apiCall('uploadDICOMChunk', data);
            updateUploadQueue(fileName, chunkIndex + 1, totalChunks);
            
            if (chunkIndex === totalChunks - 1) {
                showNotification(`${fileName} uploaded successfully`);
            }
        } catch (error) {
            console.error(`Error uploading chunk ${chunkIndex} of ${fileName}:`, error);
            showNotification(`Error uploading ${fileName}`);
            break;
        }
    }
}
function readChunkAsArrayBuffer(chunk) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = e => resolve(e.target.result);
        reader.onerror = e => reject(e);
        reader.readAsArrayBuffer(chunk);
    });
}


function readChunkAsBase64(chunk) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = e => resolve(e.target.result.split(',')[1]);
        reader.onerror = e => reject(e);
        reader.readAsDataURL(chunk);
    });
}


function showLoginForm() {
    console.log('Showing login form');
    document.getElementById('loginForm').style.display = 'block';
    document.getElementById('mainContent').style.display = 'none';
}

function showMainContent() {
    console.log('Showing main content');
    document.getElementById('loginForm').style.display = 'none';
    document.getElementById('mainContent').style.display = 'block';
}


function loadPatientDICOM(patientKey) {
    const files = patientFiles.get(patientKey);
    if (files && files.length > 0) {
        loadAndViewImage(files[0].file);
    } else {
        showNotification('No DICOM files found for this patient');
    }
}

document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM content loaded');
    cornerstoneWADOImageLoader.external.cornerstone = cornerstone;
    cornerstoneWADOImageLoader.external.dicomParser = dicomParser;

    const config = {
        webWorkerPath: 'https://unpkg.com/cornerstone-wado-image-loader@4.13.2/dist/cornerstoneWADOImageLoaderWebWorker.min.js',
        taskConfiguration: {
            decodeTask: {
                codecsPath: 'https://unpkg.com/cornerstone-wado-image-loader@4.13.2/dist/cornerstoneWADOImageLoaderCodecs.min.js'
            }
        }
    };
    cornerstoneWADOImageLoader.webWorkerManager.initialize(config);

    console.log('Cornerstone WADO Image Loader initialized');

    initAuth().then(() => {
        console.log('Auth initialized, user role:', userRole);
        if (userRole === 'Radiologist') {
            showMainContent();
            initializeViewerTools();
        } else {
            showLoginForm();
        }

        // Add this line to ensure the file input is always listening for changes
        const fileInput = document.getElementById('fileInput');
        if (fileInput) {
            fileInput.addEventListener('change', handleFileSelect);
            console.log('File input event listener added in DOMContentLoaded');
        } else {
            console.error('File input element not found in DOMContentLoaded');
        }
    }).catch(error => {
        console.error('Error during initialization:', error);
        showNotification('An error occurred during initialization');
    });
});

async function downloadDICOMFile(manifest) {
    const { fileName, totalChunks, chunks } = manifest;
    
    // Create or update download button with progress bar
    const downloadBtn = document.querySelector(`[data-manifest='${JSON.stringify(manifest)}']`);
    downloadBtn.innerHTML = `
        <div class="progress-container">
            <div class="progress-bar" style="width: 0%"></div>
        </div>
        <span>0%</span>
    `;
    downloadBtn.disabled = true;
    downloadBtn.classList.add('downloading');

    let dirHandle;
    try {
        dirHandle = await window.showDirectoryPicker();
    } catch (error) {
        console.error('Error selecting directory:', error);
        showNotification('Failed to select download directory');
        resetDownloadButton(downloadBtn);
        return;
    }

    const fileNameWithoutExtension = fileName.split('.').slice(0, -1).join('.');
    let fileDirHandle;

    try {
        // Try to get existing directory
        fileDirHandle = await dirHandle.getDirectoryHandle(fileNameWithoutExtension);
        
        // Check if the full file already exists
        try {
            await fileDirHandle.getFileHandle(fileName);
            
            // Full file exists, ask user if they want to redownload or open
            const userChoice = await askUserRedownloadOrOpen(fileName);
            if (userChoice === 'open') {
                openDownloadedFile(fileDirHandle, fileName);
                resetDownloadButton(downloadBtn, 'open');
                return;
            } else if (userChoice === 'cancel') {
                resetDownloadButton(downloadBtn);
                return;
            }
            // If 'redownload', continue with the download process
        } catch (error) {
            // Full file doesn't exist, check for chunks
            const manifestFile = await fileDirHandle.getFileHandle('manifest.json');
            const manifestContent = await (await manifestFile.getFile()).text();
            const existingManifest = JSON.parse(manifestContent);
            
            let lastDownloadedChunk = await findLastDownloadedChunk(fileDirHandle, totalChunks);

            if (lastDownloadedChunk === totalChunks - 1) {
                // All chunks are present, combine them
                await combineChunks(fileDirHandle, fileName, totalChunks);
                showNotification(`${fileName} combined successfully`);
                resetDownloadButton(downloadBtn, 'open');
                return;
            } else {
                // Resume download from last successful chunk
                showNotification(`Resuming download from chunk ${lastDownloadedChunk + 1}`);
                await downloadRemainingChunks(fileDirHandle, chunks, lastDownloadedChunk, totalChunks, downloadBtn);
            }
        }
    } catch (error) {
        // Directory doesn't exist, start fresh
        fileDirHandle = await dirHandle.getDirectoryHandle(fileNameWithoutExtension, { create: true });
    }

    try {
        // Save or update manifest file
        const manifestFileHandle = await fileDirHandle.getFileHandle('manifest.json', { create: true });
        const manifestWritable = await manifestFileHandle.createWritable();
        await manifestWritable.write(JSON.stringify(manifest, null, 2));
        await manifestWritable.close();

        // Download chunks
        await downloadRemainingChunks(fileDirHandle, chunks, -1, totalChunks, downloadBtn);

        // After all chunks are downloaded successfully, combine them
        console.time('combineChunks');
        await combineChunks(fileDirHandle, fileName, totalChunks);
        console.timeEnd('combineChunks');

        showNotification(`${fileName} downloaded and combined successfully`);

        // Update download button to show completion and allow opening
        resetDownloadButton(downloadBtn, 'open');

        // Store download information in localStorage
        storeDownloadInfo(fileName, fileNameWithoutExtension, totalChunks);

    } catch (error) {
        console.error('Download or combination failed:', error);
        showNotification(`Download or combination failed: ${error.message}`);
        resetDownloadButton(downloadBtn, 'error');
    }
}

function resetDownloadButton(downloadBtn, state = 'download', dirHandle, fileName) {
    downloadBtn.disabled = false;
    downloadBtn.classList.remove('downloading');
    if (state === 'download') {
        downloadBtn.innerHTML = `<span class="material-symbols-outlined">download</span>`;
    } else if (state === 'open') {
        downloadBtn.innerHTML = `<span class="material-symbols-outlined">open_in_new</span>`;
        downloadBtn.onclick = () => openDownloadedFile(dirHandle, fileName);
    } else if (state === 'error') {
        downloadBtn.innerHTML = `<span class="material-symbols-outlined">error</span>`;
    }
}

async function askUserRedownloadOrOpen(fileName) {
    return new Promise((resolve) => {
        const dialog = document.createElement('div');
        dialog.innerHTML = `
            <p>${fileName} already exists. What would you like to do?</p>
            <button id="redownload" class="dialog-btn">Redownload</button>
            <button id="open" class="dialog-btn">Open</button>
            <button id="cancel" class="dialog-btn">Cancel</button>
        `;
        dialog.style.position = 'fixed';
        dialog.style.top = '50%';
        dialog.style.left = '50%';
        dialog.style.transform = 'translate(-50%, -50%)';
        dialog.style.backgroundColor = '#1e1e1e';
        dialog.style.color = '#ffffff';
        dialog.style.padding = '30px';
        dialog.style.borderRadius = '5px';
        dialog.style.zIndex = '1000';
        dialog.style.boxShadow = '0 4px 6px rgba(0, 0, 0, 0.1)';
        dialog.style.textAlign = 'center';

        const buttons = dialog.querySelectorAll('.dialog-btn');
        buttons.forEach(button => {
            button.style.backgroundColor = '#3700B3';
            button.style.color = '#ffffff';
            button.style.border = 'none';
            button.style.padding = '12px 24px';
            button.style.margin = '10px 5px';
            button.style.cursor = 'pointer';
            button.style.borderRadius = '5px';
            button.style.transition = 'background-color 0.3s';
        });

        document.body.appendChild(dialog);

        dialog.querySelector('#redownload').onclick = () => {
            document.body.removeChild(dialog);
            resolve('redownload');
        };
        dialog.querySelector('#open').onclick = () => {
            document.body.removeChild(dialog);
            resolve('open');
        };
        dialog.querySelector('#cancel').onclick = () => {
            document.body.removeChild(dialog);
            resolve('cancel');
        };

        buttons.forEach(button => {
            button.addEventListener('mouseover', () => {
                button.style.backgroundColor = '#4b0beb';
            });
            button.addEventListener('mouseout', () => {
                button.style.backgroundColor = '#3700B3';
            });
        });
    });
}

async function findLastDownloadedChunk(dirHandle, totalChunks) {
    for (let i = totalChunks - 1; i >= 0; i--) {
        try {
            await dirHandle.getFileHandle(`chunk_${i}.dcm`);
            return i;
        } catch (error) {
            // Chunk doesn't exist, continue checking
        }
    }
    return -1;
}

async function downloadRemainingChunks(dirHandle, chunks, lastDownloadedChunk, totalChunks, downloadBtn) {
    const chunkPromises = [];
    for (let i = lastDownloadedChunk + 1; i < totalChunks; i++) {
        const chunk = chunks.find(c => c.name.endsWith(`_chunk_${i}`));
        if (!chunk) {
            showNotification(`Chunk ${i} not found for file ${fileName}`);
            continue;
        }
        
        const chunkPromise = downloadAndSaveChunk(chunk, i, dirHandle, totalChunks, downloadBtn);
        chunkPromises.push(chunkPromise);
        
        // Limit concurrent downloads to 5 (or adjust as needed)
        if (chunkPromises.length >= 5) {
            await Promise.all(chunkPromises);
            chunkPromises.length = 0;
        }
    }

    // Wait for any remaining downloads to complete
    if (chunkPromises.length > 0) {
        await Promise.all(chunkPromises);
    }
}

async function openDownloadedFile(dirHandle, fileName) {
    try {
        console.log(`Attempting to open file: ${fileName}`);
        const fileHandle = await dirHandle.getFileHandle(fileName);
        const file = await fileHandle.getFile();
        
        console.log(`File obtained, calling loadAndViewImage`);
        const element = document.getElementById('dicomImage');
        cornerstone.enable(element);
        await loadAndViewImage(file);
        
        console.log(`File loaded: ${fileName}`);
        console.log(`Current image ID: ${currentImageId}`);
        
        // Reinitialize tools
        initializeViewerTools();
    } catch (error) {
        console.error(`Error opening file ${fileName}:`, error);
        showNotification(`Failed to open file: ${fileName}`);
    }
}

function initializeViewerTools() {
    const element = document.getElementById('dicomImage');
    const zoomSlider = document.getElementById('zoomSlider');
    const resetButton = document.getElementById('reset');

    // Re-add pan event listeners
    element.addEventListener('mousedown', startPan);
    element.addEventListener('mousemove', doPan);
    element.addEventListener('mouseup', endPan);
    element.addEventListener('mouseout', endPan);

    // Re-initialize zoom slider
    if (zoomSlider) {
        zoomSlider.addEventListener('input', function() {
            if (currentImageId) {
                const zoomLevel = parseInt(this.value) / 500;
                console.log('Zoom level changed:', zoomLevel);
                const viewport = cornerstone.getViewport(element);
                viewport.scale = zoomLevel;
                cornerstone.setViewport(element, viewport);
            }
        });
    }

    // Re-initialize reset button
    if (resetButton) {
        resetButton.addEventListener('click', function() {
            if (currentImageId) {
                console.log('Reset button clicked');
                cornerstone.reset(element);
                zoomSlider.value = 100;
                const viewport = cornerstone.getViewport(element);
                viewport.translation = { x: 0, y: 0 };
                cornerstone.setViewport(element, viewport);
            }
        });
    }
}


function storeDownloadInfo(fileName, directory, totalChunks) {
    const downloadInfo = {
        fileName: fileName,
        directory: directory,
        totalChunks: totalChunks,
        downloadDate: new Date().toISOString()
    };
    localStorage.setItem('lastDICOMDownload', JSON.stringify(downloadInfo));
}

function updateDownloadProgress(currentChunk, totalChunks, downloadBtn) {
    const progress = Math.round((currentChunk / totalChunks) * 100);
    const progressBar = downloadBtn.querySelector('.progress-bar');
    const progressText = downloadBtn.querySelector('span');
    
    progressBar.style.width = `${progress}%`;
    progressText.textContent = `${progress}%`;

    // Ensure the button remains disabled during progress updates
    downloadBtn.disabled = true;
    downloadBtn.classList.add('downloading');
}

async function downloadAndSaveChunk(chunk, index, dirHandle, totalChunks, downloadBtn) {
    console.time(`downloadChunk_${index}`);
    const response = await apiCall('downloadDICOMChunk', { chunkId: chunk.id });
    console.timeEnd(`downloadChunk_${index}`);
    
    if (response.success) {
        console.time(`processChunk_${index}`);
        // Convert base64 to ArrayBuffer
        const chunkArrayBuffer = base64ToArrayBuffer(response.fileContent);
        
        // Save the chunk
        const chunkFileName = `chunk_${index}.dcm`;
        const fileHandle = await dirHandle.getFileHandle(chunkFileName, { create: true });
        const writable = await fileHandle.createWritable();
        await writable.write(chunkArrayBuffer);
        await writable.close();
    
        updateDownloadProgress(index + 1, totalChunks, downloadBtn);
        console.timeEnd(`processChunk_${index}`);
    } else {
        throw new Error(`Failed to download chunk ${index}: ${response.message}`);
    }
}
function base64ToArrayBuffer(base64) {
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer;
}

async function combineChunks(dirHandle, fileName, totalChunks) {
    const combinedFileHandle = await dirHandle.getFileHandle(fileName, { create: true });
    const combinedWritable = await combinedFileHandle.createWritable();
     
    for (let i = 0; i < totalChunks; i++) {
        const chunkFile = await dirHandle.getFileHandle(`chunk_${i}.dcm`);
        const chunkBlob = await chunkFile.getFile();
        const chunkArrayBuffer = await chunkBlob.arrayBuffer();
        await combinedWritable.write(chunkArrayBuffer);
         
        // Optionally, delete the individual chunk file after combining
        await chunkFile.remove();
    }
     
    await combinedWritable.close();
}

export { loadAndViewImage };

console.log('Script finished loading');
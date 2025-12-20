// Configuration - Uses Vite env variables in dev, or window variable in production
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || window.API_BASE_URL || 'http://localhost:3005';

let authToken = localStorage.getItem('authToken');
let currentUser = null;
let selectedVideos = new Set();

// Initialize
$(document).ready(() => {
    if (authToken) {
        loadDashboard();
        showMainContent();
    }
});

// Authentication
async function login() {
    const email = $('#login-email').val();
    const password = $('#login-password').val();

    try {
        const response = await $.ajax({
            url: `${API_BASE_URL}/api/auth/login`,
            method: 'POST',
            contentType: 'application/json',
            data: JSON.stringify({ email, password }),
            xhrFields: {
                withCredentials: false
            }
        });

        authToken = response.token;
        currentUser = response.user;
        localStorage.setItem('authToken', authToken);
        localStorage.setItem('currentUser', JSON.stringify(currentUser));

        showAlert('Login successful!', 'success');
        showMainContent();
        loadDashboard();
    } catch (error) {
        const errorMsg = error.responseJSON?.error || error.responseJSON?.message || 'Login failed';
        showAlert(errorMsg, 'error');
        console.error('Login error:', error);
    }
}

async function register() {
    const username = $('#register-username').val();
    const email = $('#register-email').val();
    const password = $('#register-password').val();

    try {
        const response = await $.ajax({
            url: `${API_BASE_URL}/api/auth/register`,
            method: 'POST',
            contentType: 'application/json',
            data: JSON.stringify({ username, email, password }),
            xhrFields: {
                withCredentials: false
            }
        });

        showAlert('Registration successful! Please login.', 'success');
        showLogin();
    } catch (error) {
        const errorMsg = error.responseJSON?.error || error.responseJSON?.message || 'Registration failed';
        showAlert(errorMsg, 'error');
        console.error('Registration error:', error);
    }
}

function logout() {
    authToken = null;
    currentUser = null;
    localStorage.removeItem('authToken');
    localStorage.removeItem('currentUser');
    $('#main-content').hide();
    $('#login-form').show();
    $('#register-form').hide();
    $('#user-info').hide();
    selectedVideos.clear();
}

function showLogin() {
    $('#login-form').show();
    $('#register-form').hide();
}

function showRegister() {
    $('#login-form').hide();
    $('#register-form').show();
}

function showMainContent() {
    $('#login-form').hide();
    $('#register-form').hide();
    $('#user-info').show();
    $('#main-content').show();
    
    if (currentUser) {
        $('#username-display').text(`Welcome, ${currentUser.username}`);
    } else {
        const stored = localStorage.getItem('currentUser');
        if (stored) {
            currentUser = JSON.parse(stored);
            $('#username-display').text(`Welcome, ${currentUser.username}`);
        }
    }
}

// Dashboard
async function loadDashboard() {
    try {
        const response = await $.ajax({
            url: `${API_BASE_URL}/api/dashboard`,
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${authToken}`
            },
            xhrFields: {
                withCredentials: false
            }
        });

        // Update storage stats
        if (response.storage) {
            const usedMB = (response.storage.usedStorage / (1024 * 1024)).toFixed(2);
            const maxMB = (response.storage.maxStorage / (1024 * 1024)).toFixed(2);
            const percent = parseFloat(response.storage.usagePercent);
            
            $('#storage-progress').css('width', `${Math.min(percent, 100)}%`);
            $('#storage-text').text(`${usedMB} MB / ${maxMB} MB`);
            
            if (percent >= 80) {
                $('#storage-progress').css('background', '#ffc107');
            }
            if (percent >= 100) {
                $('#storage-progress').css('background', '#dc3545');
            }
        }

        // Update bandwidth stats
        if (response.usage) {
            const usedMB = (response.usage.totalVolume / (1024 * 1024)).toFixed(2);
            const maxMB = (response.usage.maxDailyBandwidth / (1024 * 1024)).toFixed(2);
            const percent = parseFloat(response.usage.usagePercent);
            
            $('#bandwidth-progress').css('width', `${Math.min(percent, 100)}%`);
            $('#bandwidth-text').text(`${usedMB} MB / ${maxMB} MB`);
            
            if (percent >= 80) {
                $('#bandwidth-progress').css('background', '#ffc107');
            }
            if (percent >= 100 || response.usage.blocked) {
                $('#bandwidth-progress').css('background', '#dc3545');
                showAlert('Daily bandwidth limit exceeded. Uploads blocked until tomorrow.', 'warning');
            }
        }

        // Load videos
        loadVideos();
    } catch (error) {
        if (error.status === 401) {
            showAlert('Session expired. Please login again.', 'error');
            logout();
        } else {
            showAlert('Failed to load dashboard', 'error');
            console.error('Dashboard error:', error);
        }
    }
}

// Video Management
async function loadVideos() {
    try {
        const response = await $.ajax({
            url: `${API_BASE_URL}/api/videos`,
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${authToken}`
            },
            xhrFields: {
                withCredentials: false
            }
        });

        displayVideos(response.videos || []);
    } catch (error) {
        if (error.status === 401) {
            showAlert('Session expired. Please login again.', 'error');
            logout();
        } else {
            showAlert('Failed to load videos', 'error');
            console.error('Load videos error:', error);
        }
    }
}

function displayVideos(videos) {
    const container = $('#videos-container');
    container.empty();

    if (videos.length === 0) {
        container.html('<p>No videos uploaded yet.</p>');
        return;
    }

    videos.forEach(video => {
        // Use GCS URL if available, otherwise use stream endpoint
        const videoSrc = video.gcsUrl || `${API_BASE_URL}/api/videos/stream/${currentUser.userId}/${video.filename}`;
        
        const videoCard = $(`
            <div class="video-card">
                <video controls>
                    <source src="${videoSrc}" type="video/mp4">
                    Your browser does not support the video tag.
                </video>
                <div class="video-card-content">
                    <h4>${video.originalName}</h4>
                    <p>Size: ${(video.size / (1024 * 1024)).toFixed(2)} MB</p>
                    <p>Uploaded: ${new Date(video.uploadedAt).toLocaleString()}</p>
                    <div class="video-card-actions">
                        <input type="checkbox" data-filename="${video.filename}" onchange="toggleVideoSelection('${video.filename}')">
                        <button onclick="deleteVideo('${video.filename}')">Delete</button>
                    </div>
                </div>
            </div>
        `);
        container.append(videoCard);
    });
}

// File selection
$('#video-input').on('change', function() {
    const file = this.files[0];
    if (file) {
        $('#selected-file').text(`Selected: ${file.name} (${(file.size / (1024 * 1024)).toFixed(2)} MB)`);
        $('#upload-btn').prop('disabled', false);
    }
});

// Upload video
async function uploadVideo() {
    const fileInput = document.getElementById('video-input');
    const file = fileInput.files[0];

    if (!file) {
        showAlert('Please select a video file', 'warning');
        return;
    }

    const formData = new FormData();
    formData.append('video', file);

    $('#upload-btn').prop('disabled', true);
    $('#upload-status').html('<p>Uploading...</p>');

    try {
        const response = await $.ajax({
            url: `${API_BASE_URL}/api/videos/upload`,
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${authToken}`
            },
            data: formData,
            processData: false,
            contentType: false,
            xhrFields: {
                withCredentials: false
            }
        });

        showAlert('Video uploaded successfully!', 'success');
        $('#upload-status').html('');
        fileInput.value = '';
        $('#selected-file').text('');
        $('#upload-btn').prop('disabled', true);
        
        loadDashboard();
    } catch (error) {
        const errorMsg = error.responseJSON?.error || error.responseJSON?.message || 'Upload failed';
        showAlert(errorMsg, 'error');
        $('#upload-btn').prop('disabled', false);
        $('#upload-status').html('');
        console.error('Upload error:', error);
    }
}

// Delete video
async function deleteVideo(filename) {
    if (!confirm('Are you sure you want to delete this video?')) {
        return;
    }

    try {
        await $.ajax({
            url: `${API_BASE_URL}/api/videos/${filename}`,
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${authToken}`
            },
            xhrFields: {
                withCredentials: false
            }
        });

        showAlert('Video deleted successfully', 'success');
        loadDashboard();
    } catch (error) {
        if (error.status === 401) {
            showAlert('Session expired. Please login again.', 'error');
            logout();
        } else {
            showAlert('Failed to delete video', 'error');
            console.error('Delete error:', error);
        }
    }
}

// Bulk operations
function toggleVideoSelection(filename) {
    const checkbox = $(`input[data-filename="${filename}"]`)[0];
    if (checkbox.checked) {
        selectedVideos.add(filename);
    } else {
        selectedVideos.delete(filename);
    }

    if (selectedVideos.size > 0) {
        $('#bulk-actions').show();
    } else {
        $('#bulk-actions').hide();
    }
}

function clearSelection() {
    selectedVideos.clear();
    $('input[type="checkbox"]').prop('checked', false);
    $('#bulk-actions').hide();
}

async function bulkDelete() {
    if (selectedVideos.size === 0) {
        showAlert('No videos selected', 'warning');
        return;
    }

    if (!confirm(`Are you sure you want to delete ${selectedVideos.size} video(s)?`)) {
        return;
    }

    try {
        await $.ajax({
            url: `${API_BASE_URL}/api/videos/bulk-delete`,
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${authToken}`,
                'Content-Type': 'application/json'
            },
            data: JSON.stringify({
                filenames: Array.from(selectedVideos)
            }),
            xhrFields: {
                withCredentials: false
            }
        });

        showAlert(`${selectedVideos.size} video(s) deleted successfully`, 'success');
        selectedVideos.clear();
        loadDashboard();
    } catch (error) {
        if (error.status === 401) {
            showAlert('Session expired. Please login again.', 'error');
            logout();
        } else {
            showAlert('Failed to delete videos', 'error');
            console.error('Bulk delete error:', error);
        }
    }
}

// Alert system
function showAlert(message, type = 'info') {
    const alert = $(`
        <div class="alert alert-${type}">
            ${message}
        </div>
    `);

    $('#alert-container').append(alert);

    setTimeout(() => {
        alert.fadeOut(() => alert.remove());
    }, 5000);
}

// Export functions to global scope for onclick handlers
window.login = login;
window.register = register;
window.logout = logout;
window.showLogin = showLogin;
window.showRegister = showRegister;
window.uploadVideo = uploadVideo;
window.deleteVideo = deleteVideo;
window.toggleVideoSelection = toggleVideoSelection;
window.clearSelection = clearSelection;
window.bulkDelete = bulkDelete;


/* CONFIGURATION
 ***********************/
const REGION = "xxxxxxxxx";                                     /*resource hosted region*/
const CLIENT_ID = "xxxxxxxxxxxxxxxxxxx";                        /*app clint ID*/
const API_BASE_URL = "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx";         /*API gateway base url */

/***********************
 * STATE
 ***********************/
let idToken = null;
let hasRenderedFiles = false;

/***********************
 * INIT
 ***********************/
document.addEventListener("DOMContentLoaded", () => {
  const storedToken = localStorage.getItem("idToken");
  if (storedToken) {
    idToken = storedToken;
    showDashboard();
    // DO NOT auto-call listFiles here
  }
});

/***********************
 * AUTH
 ***********************/
async function login() {
  const email = document.getElementById("email").value;
  const password = document.getElementById("password").value;

  if (!email || !password) {
    alert("Enter email and password");
    return;
  }

  const res = await fetch(`https://cognito-idp.${REGION}.amazonaws.com/`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-amz-json-1.1",
      "X-Amz-Target": "AWSCognitoIdentityProviderService.InitiateAuth"
    },
    body: JSON.stringify({
      AuthFlow: "USER_PASSWORD_AUTH",
      ClientId: CLIENT_ID,
      AuthParameters: {
        USERNAME: email,
        PASSWORD: password
      }
    })
  });

  const data = await res.json();

  if (!data.AuthenticationResult?.IdToken) {
    alert("Login failed");
    return;
  }

  idToken = data.AuthenticationResult.IdToken;
  localStorage.setItem("idToken", idToken);

  showDashboard();
  listFiles(); // ONLY place where listFiles is called
}

function logout() {
  localStorage.clear();
  location.reload();
}

/***********************
 * UI
 ***********************/
function showDashboard() {
  document.getElementById("loginBox").classList.add("hidden");
  document.getElementById("dashboard").classList.remove("hidden");
}

/***********************
 * UPLOAD
 ***********************/
async function uploadFile() {
  const file = document.getElementById("fileInput").files[0];
  if (!file) {
    alert("Select a file");
    return;
  }

  document.getElementById("uploadSpeed").textContent =
    "Upload speed: measuring...";

  const accelerate = isAccelerationEnabled();

  // 1️⃣ Ask backend for upload URL
  const res = await fetch(
    `${API_BASE_URL}/upload-url?filename=${encodeURIComponent(file.name)}&accelerate=${accelerate}`,
    {
      headers: { Authorization: idToken }
    }
  );

  if (!res.ok) {
    alert("Failed to get upload URL");
    return;
  }

  const raw = await res.json();
  const data = typeof raw.body === "string" ? JSON.parse(raw.body) : raw;
  const uploadUrl = data.uploadUrl;

  // 2️⃣ Upload directly to S3 and measure speed
  const startTime = performance.now();

  const putRes = await fetch(uploadUrl, {
    method: "PUT",
    body: file
  });

  const endTime = performance.now();

  if (!putRes.ok) {
    alert("Upload failed");
    return;
  }

  const seconds = (endTime - startTime) / 1000;
  const speed = file.size / seconds;

  document.getElementById("uploadSpeed").textContent =
    `Upload speed: ${formatBytes(speed)}/s`;

  showNotification(`Successfully uploaded: ${file.name}`);
document.getElementById('fileNameDisplay').innerText = "Select a file..."; // Reset display

  // 3️⃣ Refresh file list
  listFiles();
}

/***********************
 * LIST FILES (GUARDED)
 ***********************/
async function listFiles() {
  if (!idToken) return;

  const res = await fetch(`${API_BASE_URL}/list-files`, {
    headers: { Authorization: idToken }
  });

  if (!res.ok) {
    console.error("List files failed");
    return;
  }

  // Handle Lambda proxy response
  const raw = await res.json();
  const data = typeof raw.body === "string"
    ? JSON.parse(raw.body)
    : raw;

  const list = document.getElementById("fileList");
  const bucketSizeEl = document.getElementById("bucketSize");

  list.innerHTML = "";

  // Show total bucket size
  bucketSizeEl.textContent =
    `Total storage used: ${formatBytes(data.totalSize)}`;

  if (!data.files || data.files.length === 0) {
    list.innerHTML = "<li>No files found</li>";
    return;
  }

  data.files.forEach(file => {
    const li = document.createElement("li");
    li.innerHTML = `
      <div class="file-info">
        <i class="far fa-file-alt" style="color:#3b82f6; font-size: 1.5rem;"></i>
        <div>
            <b>${file.name}</b>
            <small>${formatBytes(file.size)} • ${formatDate(file.lastModified)}</small>
        </div>
      </div>
      <div class="actions">
        <button onclick="downloadFile('${file.name}')"><i class="fas fa-download"></i></button>
        <button onclick="deleteFile('${file.name}')"><i class="fas fa-trash"></i></button>
      </div>
    `;
    list.appendChild(li);
});
}

/***********************
 * DELETE
 ***********************/
async function deleteFile(filename) {
  if (!confirm(`Delete ${filename}?`)) return;

  const res = await fetch(
    `${API_BASE_URL}/delete-file?filename=${encodeURIComponent(filename)}`,
    {
      method: "POST", // 🔑 CHANGE HERE
      headers: {
        Authorization: idToken
      }
    }
  );

  if (!res.ok) {
    alert("Delete failed");
    return;
  }

  // Parse Lambda proxy response
  const raw = await res.json();
  const data = typeof raw.body === "string"
    ? JSON.parse(raw.body)
    : raw;

  console.log("Deleted:", data);
  listFiles();
}
/********************
 * download files*
 ********************/
async function downloadFile(filename) {
  document.getElementById("downloadSpeed").textContent =
    "Download speed: measuring...";

  const accelerate = isAccelerationEnabled();

  // 1️⃣ Ask backend for download URL
  const res = await fetch(
    `${API_BASE_URL}/download-url?filename=${encodeURIComponent(filename)}&accelerate=${accelerate}`,
    {
      headers: { Authorization: idToken }
    }
  );

  if (!res.ok) {
    alert("Failed to get download URL");
    return;
  }

  const raw = await res.json();
  const data = typeof raw.body === "string" ? JSON.parse(raw.body) : raw;
  const downloadUrl = data.downloadUrl;

  // 2️⃣ Download file as blob and measure speed
  const startTime = performance.now();
  const fileRes = await fetch(downloadUrl);
  const blob = await fileRes.blob();
  const endTime = performance.now();

  const seconds = (endTime - startTime) / 1000;
  const speed = blob.size / seconds;

  document.getElementById("downloadSpeed").textContent =
    `Download speed: ${formatBytes(speed)}/s`;

  // 3️⃣ Trigger browser download
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

/* helper function */
function formatBytes(bytes) {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return (bytes / Math.pow(k, i)).toFixed(2) + " " + sizes[i];
}

function formatDate(isoString) {
  const date = new Date(isoString);
  return date.toLocaleString();
}
 /* toggel check*/
 function isAccelerationEnabled() {
  return document.getElementById("accelerateToggle")?.checked;
}
function showNotification(message) {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerHTML = `<i class="fas fa-check-circle"></i> ${message}`;
    container.appendChild(toast);
    setTimeout(() => { toast.style.opacity = '0'; setTimeout(() => toast.remove(), 500); }, 3000);
}
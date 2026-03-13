// ── AUTH — localStorage-based (frontend demo) ──
const AUTH_USERS_KEY    = 'fc_users';
const AUTH_SESSION_KEY  = 'fc_session';
const AUTH_PROFILES_KEY = 'fc_profiles';

function escapeHTML(str) {
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function getUsers() {
  return JSON.parse(localStorage.getItem(AUTH_USERS_KEY) || '[]');
}

function saveUsers(users) {
  localStorage.setItem(AUTH_USERS_KEY, JSON.stringify(users));
}

function getCurrentUser() {
  return localStorage.getItem(AUTH_SESSION_KEY) || null;
}

function setSession(username) {
  localStorage.setItem(AUTH_SESSION_KEY, username);
}

function clearSession() {
  localStorage.removeItem(AUTH_SESSION_KEY);
}

// ── PROFILE DATA ──
function getProfile(username) {
  const profiles = JSON.parse(localStorage.getItem(AUTH_PROFILES_KEY) || '{}');
  return profiles[username] || { bio: '', interests: [] };
}

function saveProfile(username, data) {
  const profiles = JSON.parse(localStorage.getItem(AUTH_PROFILES_KEY) || '{}');
  profiles[username] = data;
  localStorage.setItem(AUTH_PROFILES_KEY, JSON.stringify(profiles));
}

function getUserJoinedAt(username) {
  const users = getUsers();
  const user = users.find(u => u.username.toLowerCase() === username.toLowerCase());
  return user ? (user.joinedAt || null) : null;
}

function signup(username, password) {
  const users = getUsers();
  if (users.find(u => u.username.toLowerCase() === username.toLowerCase())) {
    return { ok: false, error: 'That username is already taken.' };
  }
  users.push({ username, password, joinedAt: Date.now() });
  saveUsers(users);
  setSession(username);
  return { ok: true };
}

function login(username, password) {
  const users = getUsers();
  const user = users.find(u => u.username.toLowerCase() === username.toLowerCase());
  if (!user) return { ok: false, error: 'No account found with that username.' };
  if (user.password !== password) return { ok: false, error: 'Incorrect password.' };
  setSession(user.username);
  return { ok: true };
}

function logout() {
  clearSession();
  // If renderFeed isn't available (not on forum page), redirect there instead
  if (typeof renderFeed !== 'function') {
    window.location.href = 'forum.html';
    return;
  }
  updateNavAuth();
  renderFeed();
  showToast('You have been logged out.');
}

// ── AUTH MODAL ──
let authMode = 'login';

function openAuthModal(mode) {
  authMode = mode || 'login';
  updateAuthModal();
  document.getElementById('auth-error').textContent = '';
  document.getElementById('auth-form').reset();
  document.getElementById('auth-overlay').classList.add('open');
}

function closeAuthModal() {
  document.getElementById('auth-overlay').classList.remove('open');
  document.getElementById('auth-error').textContent = '';
  document.getElementById('auth-form').reset();
}

function handleAuthOverlayClick(e) {
  if (e.target === document.getElementById('auth-overlay')) closeAuthModal();
}

function switchAuthMode(mode) {
  authMode = mode;
  updateAuthModal();
  document.getElementById('auth-error').textContent = '';
  document.getElementById('auth-form').reset();
}

function updateAuthModal() {
  const isLogin = authMode === 'login';
  document.getElementById('auth-modal-title').innerHTML = isLogin ? '&#128273; Log In' : '&#9998; Sign Up';
  document.getElementById('auth-tab-login').classList.toggle('active', isLogin);
  document.getElementById('auth-tab-signup').classList.toggle('active', !isLogin);
  document.getElementById('auth-submit-btn').textContent = isLogin ? 'Log In' : 'Create Account';
  document.getElementById('auth-switch-text').innerHTML = isLogin
    ? 'Don\'t have an account? <a href="#" onclick="switchAuthMode(\'signup\'); return false;">Sign Up</a>'
    : 'Already have an account? <a href="#" onclick="switchAuthMode(\'login\'); return false;">Log In</a>';
}

function handleAuthSubmit(e) {
  e.preventDefault();
  const username = document.getElementById('auth-username').value.trim();
  const password = document.getElementById('auth-password').value;
  const errorEl  = document.getElementById('auth-error');

  if (!username || !password) {
    errorEl.textContent = 'Please fill in all fields.';
    return;
  }
  if (username.length < 3) {
    errorEl.textContent = 'Username must be at least 3 characters.';
    return;
  }
  if (!/^[a-zA-Z0-9_]+$/.test(username)) {
    errorEl.textContent = 'Username may only contain letters, numbers, and underscores.';
    return;
  }
  if (password.length < 6) {
    errorEl.textContent = 'Password must be at least 6 characters.';
    return;
  }

  const result = authMode === 'login' ? login(username, password) : signup(username, password);
  if (!result.ok) {
    errorEl.textContent = result.error;
    return;
  }

  const user = getCurrentUser();
  const wasLogin = authMode === 'login';
  closeAuthModal();
  updateNavAuth();
  renderFeed();
  showToast(wasLogin ? `Welcome back, ${user}!` : `Account created! Welcome, ${user}!`);
}

// ── NAV AUTH STATE ──
function updateNavAuth() {
  const user = getCurrentUser();
  const navRight = document.getElementById('nav-right');
  // Detect if we're on the forum page (has the create-post modal)
  const onForum = !!document.getElementById('overlay');
  const createPostBtn = onForum
    ? `<button class="btn btn-primary btn-sm" onclick="openModal()">&#43; Create Post</button>`
    : `<a href="forum.html" class="btn btn-primary btn-sm">&#43; Create Post</a>`;
  if (user) {
    navRight.innerHTML = `
      <a href="profile.html" class="nav-username">u/${escapeHTML(user)}</a>
      <button class="btn btn-ghost btn-sm" onclick="logout()">Log Out</button>
      ${createPostBtn}
    `;
  } else {
    navRight.innerHTML = `
      <button class="btn btn-ghost btn-sm" onclick="openAuthModal('login')">Log In</button>
      <button class="btn btn-primary btn-sm" onclick="openAuthModal('signup')">Sign Up</button>
    `;
  }
}

// Init nav immediately (scripts are at bottom of body so DOM is ready)
updateNavAuth();

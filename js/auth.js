// ── SHARED UTILITIES ──
function escapeHTML(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function timeAgo(ts) {
  const diff = Math.floor((Date.now() - ts) / 1000);
  if (diff < 60)    return 'just now';
  if (diff < 3600)  return Math.floor(diff / 60) + 'm ago';
  if (diff < 86400) return Math.floor(diff / 3600) + 'h ago';
  return Math.floor(diff / 86400) + 'd ago';
}

function showToast(msg) {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2800);
}

// ── AUTH STATE ──
let _currentUser = null; // { id, username } or null
let _authReadyCallbacks = [];
let _authReady = false;

function getCurrentUser() {
  return _currentUser;
}

function onAuthReady(cb) {
  if (_authReady) { cb(); return; }
  _authReadyCallbacks.push(cb);
}

async function _loadUserProfile(supabaseUser) {
  const { data } = await sb
    .from('profiles')
    .select('username')
    .eq('id', supabaseUser.id)
    .single();
  _currentUser = {
    id: supabaseUser.id,
    username: data?.username || supabaseUser.email.split('@')[0]
  };
}

// ── INIT — runs once on every page load ──
(async function initAuth() {
  const { data: { session } } = await sb.auth.getSession();
  if (session) {
    await _loadUserProfile(session.user);
  }
  updateNavAuth();
  _authReady = true;
  _authReadyCallbacks.forEach(cb => cb());
  _authReadyCallbacks = [];

  // Keep state in sync if token refreshes or expires
  sb.auth.onAuthStateChange(async (event, session) => {
    if (event === 'TOKEN_REFRESHED' && session) {
      await _loadUserProfile(session.user);
    } else if (event === 'SIGNED_OUT') {
      _currentUser = null;
    }
    updateNavAuth();
  });
})();

// ── AUTH ACTIONS ──
async function signup(username, password) {
  const email = `${username.toLowerCase()}@forum.local`;
  const { error } = await sb.auth.signUp({
    email,
    password,
    options: { data: { username } }
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

async function login(username, password) {
  const email = `${username.toLowerCase()}@forum.local`;
  const { error } = await sb.auth.signInWithPassword({ email, password });
  if (error) return { ok: false, error: 'Invalid username or password.' };
  return { ok: true };
}

async function logout() {
  await sb.auth.signOut();
  _currentUser = null;
  if (typeof renderFeed !== 'function') {
    window.location.href = 'forum.html';
    return;
  }
  updateNavAuth();
  renderFeed();
  showToast('You have been logged out.');
}

// ── PROFILE DATA ──
async function getProfile(userId) {
  const { data } = await sb
    .from('profiles')
    .select('bio, interests, created_at')
    .eq('id', userId)
    .single();
  return data || { bio: '', interests: [] };
}

async function saveProfile(userId, data) {
  await sb.from('profiles')
    .update({ bio: data.bio, interests: data.interests })
    .eq('id', userId);
}

async function getUserJoinedAt(userId) {
  const { data } = await sb
    .from('profiles')
    .select('created_at')
    .eq('id', userId)
    .single();
  return data ? new Date(data.created_at).getTime() : null;
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

async function handleAuthSubmit(e) {
  e.preventDefault();
  const username  = document.getElementById('auth-username').value.trim();
  const password  = document.getElementById('auth-password').value;
  const errorEl   = document.getElementById('auth-error');
  const submitBtn = document.getElementById('auth-submit-btn');

  if (!username || !password) { errorEl.textContent = 'Please fill in all fields.'; return; }
  if (username.length < 3)    { errorEl.textContent = 'Username must be at least 3 characters.'; return; }
  if (!/^[a-zA-Z0-9_]+$/.test(username)) { errorEl.textContent = 'Username may only contain letters, numbers, and underscores.'; return; }
  if (password.length < 6)    { errorEl.textContent = 'Password must be at least 6 characters.'; return; }

  const wasLogin = authMode === 'login';
  submitBtn.disabled = true;
  submitBtn.textContent = wasLogin ? 'Logging in...' : 'Creating account...';

  const result = wasLogin ? await login(username, password) : await signup(username, password);

  submitBtn.disabled = false;
  updateAuthModal();

  if (!result.ok) { errorEl.textContent = result.error; return; }

  // Load user profile immediately so nav and feed render correctly
  const { data: { session } } = await sb.auth.getSession();
  if (session) await _loadUserProfile(session.user);

  updateNavAuth();
  closeAuthModal();
  showToast(wasLogin ? `Welcome back, ${username}!` : `Account created! Welcome, ${username}!`);
  if (typeof renderFeed === 'function') renderFeed();
}

// ── NAV ──
function updateNavAuth() {
  const user    = _currentUser;
  const navRight = document.getElementById('nav-right');
  if (!navRight) return;
  const onForum = !!document.getElementById('overlay');
  const createPostBtn = onForum
    ? `<button class="btn btn-primary btn-sm" onclick="openModal()">&#43; Create Post</button>`
    : `<a href="forum.html" class="btn btn-primary btn-sm">&#43; Create Post</a>`;
  if (user) {
    navRight.innerHTML = `
      <a href="profile.html" class="nav-username">u/${escapeHTML(user.username)}</a>
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

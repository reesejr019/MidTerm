// ── AUTH GATE — wait for Supabase session, then check login ──
onAuthReady(async () => {
  if (!getCurrentUser()) {
    window.location.href = 'forum.html';
    return;
  }
  await initProfile();
});

// ── STATE ──
let profileData   = { bio: '', interests: [] };
let editInterests = [];

// ── INIT ──
async function initProfile() {
  const user = getCurrentUser();
  profileData = await getProfile(user.id);
  const joinedAt = await getUserJoinedAt(user.id);
  const [myPosts, myBookmarks] = await Promise.all([loadMyPosts(), loadBookmarks()]);

  document.getElementById('profile-avatar').textContent   = user.username.charAt(0).toUpperCase();
  document.getElementById('profile-username').textContent = user.username;
  document.getElementById('profile-joined').textContent   = formatJoinDate(joinedAt);
  document.getElementById('stat-post-count').textContent  = myPosts.length;
  document.getElementById('stat-bookmark-count').textContent = myBookmarks.length;

  renderAbout();
  renderMyPosts(myPosts);
  renderBookmarks(myBookmarks);
}

// ── HELPERS ──
function formatJoinDate(ts) {
  if (!ts) return 'Member';
  return 'Joined ' + new Date(ts).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

// ── LOAD MY POSTS FROM DB ──
async function loadMyPosts() {
  const user = getCurrentUser();
  const { data } = await sb
    .from('posts')
    .select('*')
    .eq('author_id', user.id)
    .order('created_at', { ascending: false });
  return (data || []).map(row => ({
    id:        row.id,
    title:     row.title,
    body:      row.body || '',
    image:     row.image || '',
    forum:     row.forum,
    score:     row.score,
    createdAt: new Date(row.created_at).getTime()
  }));
}

// ── ABOUT SECTION ──
function renderAbout() {
  const bioEl = document.getElementById('about-bio');
  if (profileData.bio) {
    bioEl.textContent = profileData.bio;
    bioEl.classList.remove('empty');
  } else {
    bioEl.textContent = 'No bio yet.';
    bioEl.classList.add('empty');
  }

  const interestSection = document.getElementById('interests-section');
  const interestDisplay = document.getElementById('interests-display');
  if (profileData.interests && profileData.interests.length > 0) {
    interestSection.style.display = 'block';
    interestDisplay.innerHTML = profileData.interests
      .map(i => `<span class="interest-tag">${escapeHTML(i)}</span>`)
      .join('');
  } else {
    interestSection.style.display = 'none';
  }
}

// ── TABS ──
function switchTab(tab) {
  document.getElementById('tab-posts').classList.toggle('active', tab === 'posts');
  document.getElementById('tab-bookmarks').classList.toggle('active', tab === 'bookmarks');
  document.getElementById('my-posts-feed').style.display     = tab === 'posts'     ? '' : 'none';
  document.getElementById('my-bookmarks-feed').style.display = tab === 'bookmarks' ? '' : 'none';
}

// ── MY POSTS ──
function renderMyPosts(myPosts) {
  const feed    = document.getElementById('my-posts-feed');
  const countEl = document.getElementById('my-post-count');

  countEl.textContent = myPosts.length;

  if (myPosts.length === 0) {
    feed.innerHTML = `
      <div class="no-posts">
        <div class="icon"><i data-lucide="message-square"></i></div>
        <h3>No posts yet</h3>
        <p>Head over to the <a href="forum.html" style="color:var(--accent);">forum</a> to share your first post.</p>
      </div>`;
    if (typeof lucide !== 'undefined') lucide.createIcons();
    return;
  }

  feed.innerHTML = myPosts.map(post => `
    <div class="post-card">
      <div class="vote-col">
        <span style="font-size:0.7rem; color:var(--muted);"><i data-lucide="chevron-up"></i></span>
        <span class="vote-score">${post.score}</span>
        <span style="font-size:0.7rem; color:var(--muted);"><i data-lucide="chevron-down"></i></span>
      </div>
      <div class="post-body">
        <div class="post-meta">
          <span class="forum-tag">${escapeHTML(post.forum)}</span>
          &nbsp;·&nbsp; ${timeAgo(post.createdAt)}
        </div>
        <div class="post-title">${escapeHTML(post.title)}</div>
        ${post.image ? `<img class="post-image" src="${post.image}" alt="Post image" />` : ''}
        ${post.body  ? `<div class="post-text">${escapeHTML(post.body)}</div>` : ''}
        <div class="post-footer">
          <a href="forum.html" class="post-action" style="text-decoration:none;"><i data-lucide="message-square"></i> View in Forum</a>
          <button class="post-action delete" onclick="deleteMyPost(${post.id})"><i data-lucide="trash-2"></i> Delete</button>
        </div>
      </div>
    </div>
  `).join('');
  if (typeof lucide !== 'undefined') lucide.createIcons();
}

async function deleteMyPost(id) {
  await sb.from('posts').delete().eq('id', id);
  const myPosts = await loadMyPosts();
  document.getElementById('stat-post-count').textContent = myPosts.length;
  renderMyPosts(myPosts);
  showToast('Post deleted.');
}

// ── BOOKMARKS ──
async function loadBookmarks() {
  const user = getCurrentUser();
  const { data } = await sb
    .from('bookmarks')
    .select('created_at, posts(*)')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });
  return (data || []).filter(row => row.posts).map(row => ({
    id:        row.posts.id,
    title:     row.posts.title,
    body:      row.posts.body || '',
    image:     row.posts.image || '',
    forum:     row.posts.forum,
    author:    row.posts.author_username,
    score:     row.posts.score,
    createdAt: new Date(row.posts.created_at).getTime()
  }));
}

function renderBookmarks(bookmarks) {
  const feed = document.getElementById('my-bookmarks-feed');
  document.getElementById('my-bookmark-count').textContent  = bookmarks.length;
  document.getElementById('stat-bookmark-count').textContent = bookmarks.length;

  if (bookmarks.length === 0) {
    feed.innerHTML = `
      <div class="no-posts">
        <div class="icon"><i data-lucide="bookmark"></i></div>
        <h3>No bookmarks yet</h3>
        <p>Hit <strong>Save</strong> on any post in the <a href="forum.html" style="color:var(--accent);">forum</a> to find it here.</p>
      </div>`;
    if (typeof lucide !== 'undefined') lucide.createIcons();
    return;
  }

  feed.innerHTML = bookmarks.map(post => `
    <div class="post-card" id="bm-${post.id}">
      <div class="vote-col">
        <span style="font-size:0.7rem; color:var(--muted);"><i data-lucide="chevron-up"></i></span>
        <span class="vote-score">${post.score}</span>
        <span style="font-size:0.7rem; color:var(--muted);"><i data-lucide="chevron-down"></i></span>
      </div>
      <div class="post-body">
        <div class="post-meta">
          <span class="forum-tag">${escapeHTML(post.forum)}</span>
          &nbsp;·&nbsp; Posted by <strong>${escapeHTML(post.author)}</strong>
          &nbsp;·&nbsp; ${timeAgo(post.createdAt)}
        </div>
        <div class="post-title">${escapeHTML(post.title)}</div>
        ${post.image ? `<img class="post-image" src="${post.image}" alt="Post image" />` : ''}
        ${post.body  ? `<div class="post-text">${escapeHTML(post.body)}</div>` : ''}
        <div class="post-footer">
          <a href="forum.html" class="post-action" style="text-decoration:none;">
            <i data-lucide="external-link"></i> View in Forum
          </a>
          <button class="post-action delete" onclick="removeBookmark(${post.id})">
            <i data-lucide="bookmark-x"></i> Remove
          </button>
        </div>
      </div>
    </div>
  `).join('');
  if (typeof lucide !== 'undefined') lucide.createIcons();
}

async function removeBookmark(postId) {
  const user = getCurrentUser();
  await sb.from('bookmarks').delete().eq('post_id', postId).eq('user_id', user.id);
  const card = document.getElementById(`bm-${postId}`);
  if (card) card.remove();
  const remaining = document.querySelectorAll('#my-bookmarks-feed .post-card').length;
  document.getElementById('my-bookmark-count').textContent   = remaining;
  document.getElementById('stat-bookmark-count').textContent = remaining;
  if (remaining === 0) {
    const bookmarks = await loadBookmarks();
    renderBookmarks(bookmarks);
  }
  showToast('Bookmark removed.');
}

// ── EDIT MODE ──
function enterEditMode() {
  document.getElementById('edit-bio').value          = profileData.bio || '';
  document.getElementById('bio-count').textContent   = (profileData.bio || '').length;
  editInterests = profileData.interests ? [...profileData.interests] : [];
  renderTagList();

  document.getElementById('edit-card').style.display       = 'block';
  document.getElementById('edit-toggle-btn').style.display = 'none';
  document.getElementById('edit-bio').focus();
}

function cancelEdit() {
  document.getElementById('edit-card').style.display       = 'none';
  document.getElementById('edit-toggle-btn').style.display = '';
  document.getElementById('tag-input').value = '';
  hideDeleteConfirm();
}

async function saveProfileChanges() {
  const bio  = document.getElementById('edit-bio').value.trim();
  profileData = { bio, interests: [...editInterests] };
  await saveProfile(getCurrentUser().id, profileData);
  cancelEdit();
  renderAbout();
  showToast('Profile saved!');
}

// ── INTEREST TAGS ──
function renderTagList() {
  const list = document.getElementById('tag-list');
  list.innerHTML = editInterests.map((tag, i) => `
    <span class="tag-pill">
      ${escapeHTML(tag)}
      <button type="button" onclick="removeTag(${i})" title="Remove"><i data-lucide="x"></i></button>
    </span>
  `).join('');
  if (typeof lucide !== 'undefined') lucide.createIcons();
}

function addTag(value) {
  const tag = value.trim().replace(/,+$/, '').trim();
  if (!tag) return;
  if (editInterests.length >= 10) { showToast('Maximum 10 interests allowed.'); return; }
  if (editInterests.some(t => t.toLowerCase() === tag.toLowerCase())) {
    showToast('That interest is already added.');
    return;
  }
  editInterests.push(tag);
  renderTagList();
  document.getElementById('tag-input').value = '';
}

function removeTag(index) {
  editInterests.splice(index, 1);
  renderTagList();
}

function handleTagKeydown(e) {
  if (e.key === 'Enter' || e.key === ',') {
    e.preventDefault();
    addTag(e.target.value);
  }
}

// ── CHAR COUNTER ──
document.getElementById('edit-bio').addEventListener('input', function() {
  document.getElementById('bio-count').textContent = this.value.length;
});

// ── DELETE ACCOUNT ──
function showDeleteConfirm() {
  document.getElementById('confirm-username-label').textContent = getCurrentUser().username;
  document.getElementById('delete-confirm-input').value = '';
  document.getElementById('delete-confirm').style.display = 'block';
  document.getElementById('delete-confirm-input').focus();
}

function hideDeleteConfirm() {
  document.getElementById('delete-confirm').style.display = 'none';
  document.getElementById('delete-confirm-input').value = '';
}

async function deleteAccount() {
  const input    = document.getElementById('delete-confirm-input').value.trim();
  const username = getCurrentUser().username;

  if (input !== username) {
    showToast('Username does not match. Please try again.');
    document.getElementById('delete-confirm-input').focus();
    return;
  }

  const btn = document.getElementById('delete-final-btn');
  btn.disabled    = true;
  btn.textContent = 'Deleting...';

  const { error } = await sb.rpc('delete_user_account');

  if (error) {
    showToast('Error deleting account. Please try again.');
    btn.disabled   = false;
    btn.innerHTML  = '<i data-lucide="trash-2"></i> Permanently Delete';
    if (typeof lucide !== 'undefined') lucide.createIcons();
    return;
  }

  await sb.auth.signOut();
  window.location.href = 'forum.html';
}

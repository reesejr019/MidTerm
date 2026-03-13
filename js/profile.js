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
  const user     = getCurrentUser();
  profileData    = await getProfile(user.id);
  const joinedAt = await getUserJoinedAt(user.id);
  const myPosts  = await loadMyPosts();

  document.getElementById('profile-avatar').textContent   = user.username.charAt(0).toUpperCase();
  document.getElementById('profile-username').textContent = 'u/' + user.username;
  document.getElementById('profile-joined').textContent   = formatJoinDate(joinedAt);
  document.getElementById('stat-post-count').textContent  = myPosts.length;

  renderAbout();
  renderMyPosts(myPosts);
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

// ── MY POSTS ──
function renderMyPosts(myPosts) {
  const feed    = document.getElementById('my-posts-feed');
  const countEl = document.getElementById('my-post-count');

  countEl.textContent = myPosts.length + (myPosts.length === 1 ? ' post' : ' posts');

  if (myPosts.length === 0) {
    feed.innerHTML = `
      <div class="no-posts">
        <div class="icon">&#128172;</div>
        <h3>No posts yet</h3>
        <p>Head over to the <a href="forum.html" style="color:var(--accent);">forum</a> to share your first post.</p>
      </div>`;
    return;
  }

  feed.innerHTML = myPosts.map(post => `
    <div class="post-card">
      <div class="vote-col">
        <span style="font-size:0.7rem; color:var(--muted);">&#9650;</span>
        <span class="vote-score">${post.score}</span>
        <span style="font-size:0.7rem; color:var(--muted);">&#9660;</span>
      </div>
      <div class="post-body">
        <div class="post-meta">
          <span class="forum-tag">r/${escapeHTML(post.forum)}</span>
          &nbsp;·&nbsp; ${timeAgo(post.createdAt)}
        </div>
        <div class="post-title">${escapeHTML(post.title)}</div>
        ${post.image ? `<img class="post-image" src="${post.image}" alt="Post image" />` : ''}
        ${post.body  ? `<div class="post-text">${escapeHTML(post.body)}</div>` : ''}
        <div class="post-footer">
          <a href="forum.html" class="post-action" style="text-decoration:none;">&#128172; View in Forum</a>
          <button class="post-action delete" onclick="deleteMyPost(${post.id})">&#128465; Delete</button>
        </div>
      </div>
    </div>
  `).join('');
}

async function deleteMyPost(id) {
  await sb.from('posts').delete().eq('id', id);
  const myPosts = await loadMyPosts();
  document.getElementById('stat-post-count').textContent = myPosts.length;
  renderMyPosts(myPosts);
  showToast('Post deleted.');
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
      <button type="button" onclick="removeTag(${i})" title="Remove">&#10005;</button>
    </span>
  `).join('');
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

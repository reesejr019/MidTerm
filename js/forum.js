// ── MODERATION — BANNED WORDS (PG-13) ──
const BANNED_WORDS = [
  // ── profanity ──
  'fuck', 'f**k', 'fuk', 'fvck',
  'shit', 'sh!t', 'sht',
  'bullshit',                          // FIX: compound — bypassed word-boundary check on 'shit'
  'ass', 'a$$', 'arse',
  'asshole', 'a$$hole',                // FIX: compound — bypassed word-boundary check on 'ass'
  'jackass', 'dumbass', 'smartass',    // FIX: compound — bypassed word-boundary check on 'ass'
  'bitch', 'b!tch', 'btch',
  'bastard',
  'cunt', 'c**t',
  // NOTE: 'damn' and 'hell' removed — standard PG-13 words used in everyday speech
  'cock', 'c0ck',
  'pussy',
  'whore', 'wh0re',
  'slut', 'sl*t',
  'nigger', 'nigga', 'n!gger',
  'faggot', 'fag',
  'retard', 'ret*rd',
  'rape', 'r*pe',
  'porn', 'p0rn', 'porno',
  'nude', 'nudes',
  'kill yourself', 'kys',
  'suicide',
  'terrorist', 'terrorism',
  'nazi', 'n*zi'
  // NOTE: 'dick' removed from list — also a common proper name (false positive)
  // NOTE: 'sex' and 's3x' removed — blocks legitimate PG-13 educational topics
];

// Returns the first found banned word, or null if clean
function moderateText(text) {
  const lower = text.toLowerCase();
  // Use word-boundary matching to avoid false positives (e.g. "class" containing "ass")
  for (const word of BANNED_WORDS) {
    const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp(`(?<![a-z])${escaped}(?![a-z])`, 'i');
    if (pattern.test(lower)) return word;
  }
  return null;
}

function showModError(msg) {
  const el = document.getElementById('mod-error');
  document.getElementById('mod-error-msg').textContent = msg;
  el.classList.add('visible');
}

function clearModError() {
  document.getElementById('mod-error').classList.remove('visible');
}

// ── STATE ──
let posts = JSON.parse(localStorage.getItem('fc_posts') || '[]');
let selectedImageDataURL = null;
let searchQuery = '';
let activeFilter = 'All';
let expandedComments = new Set(); // tracks which post comment sections are open

// ── SEARCH ──
function handleSearch() {
  const raw = document.getElementById('search-input').value;
  searchQuery = raw.trim();
  const clearBtn = document.getElementById('search-clear');
  clearBtn.classList.toggle('visible', raw.length > 0);
  renderFeed();
}

function clearSearch() {
  document.getElementById('search-input').value = '';
  searchQuery = '';
  document.getElementById('search-clear').classList.remove('visible');
  renderFeed();
}

function setFilter(forum, el) {
  activeFilter = forum;
  document.querySelectorAll('.pill').forEach(p => p.classList.remove('active'));
  el.classList.add('active');
  renderFeed();
}

function getFilteredPosts() {
  const q = searchQuery.toLowerCase();
  return posts
    .slice()
    .reverse()
    .filter(post => {
      const matchesForum = activeFilter === 'All' || post.forum === activeFilter;
      const matchesQuery = !q
        || post.title.toLowerCase().includes(q)
        || (post.body && post.body.toLowerCase().includes(q))
        || post.forum.toLowerCase().includes(q);
      return matchesForum && matchesQuery;
    });
}

function highlight(text, query) {
  if (!query) return escapeHTML(text);
  const safe = escapeHTML(text);
  // Escape the query for HTML first so it matches correctly inside escaped text
  const escapedQuery = escapeHTML(query);
  const regexSafe = escapedQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return safe.replace(new RegExp(regexSafe, 'gi'), m => `<mark>${m}</mark>`);
}

// ── RENDER ──
function renderFeed() {
  const feed = document.getElementById('feed');
  const count = document.getElementById('post-count');
  const statPosts = document.getElementById('stat-posts');

  statPosts.textContent = posts.length;
  const totalVotes = posts.reduce((sum, p) => sum + Math.abs(p.score), 0);
  document.getElementById('stat-votes').textContent = totalVotes;

  if (posts.length === 0) {
    count.textContent = '0 posts';
    feed.innerHTML = `
      <div class="empty-state">
        <div class="icon">&#128172;</div>
        <h3>No posts yet</h3>
        <p>Be the first to share something with the community.</p>
      </div>`;
    return;
  }

  const filtered = getFilteredPosts();
  count.textContent = filtered.length + (filtered.length === 1 ? ' post' : ' posts');

  if (filtered.length === 0) {
    feed.innerHTML = `
      <div class="no-results">
        <div class="icon">&#128270;</div>
        <h3>No results found</h3>
        <p>Try different keywords or clear the search filter.</p>
      </div>`;
    return;
  }

  feed.innerHTML = filtered.map(post => `
      <div class="post-card" id="post-${post.id}">
        <div class="vote-col">
          <button class="vote-btn ${post.userVote === 1 ? 'active-up' : ''}"
            onclick="vote(${post.id}, 1)" title="Upvote">&#9650;</button>
          <span class="vote-score">${post.score}</span>
          <button class="vote-btn ${post.userVote === -1 ? 'active-down' : ''}"
            onclick="vote(${post.id}, -1)" title="Downvote">&#9660;</button>
        </div>
        <div class="post-body">
          <div class="post-meta">
            <span class="forum-tag">r/${post.forum}</span>
            &nbsp;·&nbsp; Posted by <strong>${post.author}</strong>
            &nbsp;·&nbsp; ${timeAgo(post.createdAt)}
          </div>
          <div class="post-title">${highlight(post.title, searchQuery)}</div>
          ${post.reported ? `
          <div class="reported-banner">
            &#9888; Reported &nbsp;&middot;&nbsp; ${escapeHTML(post.reportReason)}
          </div>` : ''}
          ${post.image ? `<img class="post-image" src="${post.image}" alt="Post image" />` : ''}
          ${post.body ? `<div class="post-text">${highlight(post.body, searchQuery)}</div>` : ''}
          <div class="post-footer">
            <button class="post-action comment" id="comment-btn-${post.id}"
              onclick="toggleComments(${post.id})">
              &#128172; ${(post.comments || []).length} Comment${(post.comments || []).length !== 1 ? 's' : ''}
            </button>
            <button class="post-action report ${post.reported ? 'active' : ''}"
              onclick="openReportModal(${post.id})" title="${post.reported ? 'Already reported' : 'Report post'}">
              &#9873; ${post.reported ? 'Reported' : 'Report'}
            </button>
            ${post.author === getCurrentUser() ? `
            <button class="post-action delete" onclick="deletePost(${post.id})">
              &#128465; Delete
            </button>` : ''}
          </div>
          <div class="comment-section" id="comments-${post.id}"
            style="${expandedComments.has(post.id) ? '' : 'display:none'}">
            ${buildCommentSectionInner(post)}
          </div>
        </div>
      </div>
    `).join('');
}

// ── SAVE ──
function savePosts() {
  try {
    localStorage.setItem('fc_posts', JSON.stringify(posts));
  } catch (e) {
    showToast('Storage full — try removing large images from posts.');
  }
}

// ── CREATE POST ──
function submitPost(e) {
  e.preventDefault();

  const title  = document.getElementById('post-title').value.trim();
  const body   = document.getElementById('post-body').value.trim();
  const forum  = document.getElementById('post-forum').value;

  if (!title || !forum) return;

  // ── MODERATION CHECK ──
  const flaggedTitle = moderateText(title);
  const flaggedBody  = body ? moderateText(body) : null;

  if (flaggedTitle) {
    showModError(`Your title contains a word that is not allowed: "${flaggedTitle}". Please edit your post to keep this forum PG-13.`);
    return;
  }
  if (flaggedBody) {
    showModError(`Your content contains a word that is not allowed: "${flaggedBody}". Please edit your post to keep this forum PG-13.`);
    return;
  }

  clearModError();

  const newPost = {
    id: Date.now(),
    title,
    body,
    forum,
    image: selectedImageDataURL || null,
    author: getCurrentUser(),
    score: 1,
    userVote: 1,
    createdAt: Date.now(),
    comments: []
  };

  posts.push(newPost);
  savePosts();
  renderFeed();
  closeModal();
  resetForm();
  showToast('Post published successfully!');
}

// ── DELETE POST ──
function deletePost(id) {
  posts = posts.filter(p => p.id !== id);
  savePosts();
  renderFeed();
  showToast('Post deleted.');
}

// ── REPORT ──
let reportTargetId = null;

function openReportModal(id) {
  const post = posts.find(p => p.id === id);
  if (!post) return;
  if (post.reported) {
    showToast('You have already reported this post.');
    return;
  }
  reportTargetId = id;
  // Reset form state
  document.querySelectorAll('input[name="report-reason"]').forEach(r => r.checked = false);
  document.getElementById('report-details').value = '';
  document.getElementById('report-error').style.display = 'none';
  document.getElementById('report-overlay').classList.add('open');
}

function closeReportModal() {
  document.getElementById('report-overlay').classList.remove('open');
  reportTargetId = null;
}

function handleReportOverlayClick(e) {
  if (e.target === document.getElementById('report-overlay')) closeReportModal();
}

function submitReport() {
  const reasonEl = document.querySelector('input[name="report-reason"]:checked');
  if (!reasonEl) {
    document.getElementById('report-error').style.display = 'block';
    return;
  }
  document.getElementById('report-error').style.display = 'none';

  const post = posts.find(p => p.id === reportTargetId);
  if (!post) return;

  const details = document.getElementById('report-details').value.trim();
  post.reported = true;
  post.reportReason = reasonEl.value + (details ? ` — ${details}` : '');

  savePosts();
  renderFeed();
  closeReportModal();
  showToast('Report submitted. Thank you for keeping the forum safe.');
}

// ── VOTE ──
function vote(id, dir) {
  if (!getCurrentUser()) {
    openAuthModal('login');
    showToast('Please log in to vote.');
    return;
  }
  const post = posts.find(p => p.id === id);
  if (!post) return;

  if (post.userVote === dir) {
    post.score -= dir;
    post.userVote = 0;
  } else {
    post.score -= post.userVote;
    post.score += dir;
    post.userVote = dir;
  }

  savePosts();
  renderFeed();
}

// ── MODAL ──
function openModal() {
  if (!getCurrentUser()) {
    openAuthModal('login');
    showToast('Please log in to create a post.');
    return;
  }
  document.getElementById('overlay').classList.add('open');
  document.getElementById('post-title').focus();
}

function closeModal() {
  document.getElementById('overlay').classList.remove('open');
  clearModError();
}

function handleOverlayClick(e) {
  if (e.target === document.getElementById('overlay')) closeModal();
}

function resetForm() {
  document.getElementById('post-form').reset();
  document.getElementById('title-count').textContent = '0';
  document.getElementById('body-count').textContent = '0';
  removeImage({ stopPropagation: () => {} });
}

// ── IMAGE UPLOAD ──
function handleImageSelect(e) {
  const file = e.target.files[0];
  if (file) loadImage(file);
}

function handleDragOver(e) {
  e.preventDefault();
  document.getElementById('upload-area').classList.add('drag-over');
}

function handleDragLeave() {
  document.getElementById('upload-area').classList.remove('drag-over');
}

function handleDrop(e) {
  e.preventDefault();
  document.getElementById('upload-area').classList.remove('drag-over');
  const file = e.dataTransfer.files[0];
  if (file && file.type.startsWith('image/')) loadImage(file);
}

function loadImage(file) {
  const reader = new FileReader();
  reader.onload = function(ev) {
    selectedImageDataURL = ev.target.result;
    document.getElementById('img-preview').src = selectedImageDataURL;
    document.getElementById('upload-placeholder').style.display = 'none';
    document.getElementById('img-preview-wrap').style.display = 'block';
  };
  reader.readAsDataURL(file);
}

function removeImage(e) {
  e.stopPropagation();
  selectedImageDataURL = null;
  document.getElementById('img-input').value = '';
  document.getElementById('img-preview').src = '';
  document.getElementById('upload-placeholder').style.display = 'block';
  document.getElementById('img-preview-wrap').style.display = 'none';
}

// ── CHAR COUNTERS ──
document.getElementById('post-title').addEventListener('input', function() {
  document.getElementById('title-count').textContent = this.value.length;
});

document.getElementById('post-body').addEventListener('input', function() {
  document.getElementById('body-count').textContent = this.value.length;
});

// ── TOAST ──
function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2800);
}

// ── HELPERS ──
function escapeHTML(str) {
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function timeAgo(ts) {
  const diff = Math.floor((Date.now() - ts) / 1000);
  if (diff < 60) return 'just now';
  if (diff < 3600) return Math.floor(diff / 60) + 'm ago';
  if (diff < 86400) return Math.floor(diff / 3600) + 'h ago';
  return Math.floor(diff / 86400) + 'd ago';
}

// ── COMMENTS ──
function toggleComments(id) {
  const section = document.getElementById(`comments-${id}`);
  if (!section) return;
  if (expandedComments.has(id)) {
    expandedComments.delete(id);
    section.style.display = 'none';
  } else {
    expandedComments.add(id);
    section.style.display = 'block';
    const input = document.getElementById(`comment-input-${id}`);
    if (input) setTimeout(() => input.focus(), 50);
  }
}

function buildCommentSectionInner(post) {
  const comments = post.comments || [];
  const user = getCurrentUser();

  const listHTML = comments.length === 0
    ? '<p class="no-comments">No comments yet. Be the first!</p>'
    : comments.map(c => `
      <div class="comment-item">
        <div class="comment-meta">
          <strong class="comment-author">${escapeHTML(c.author)}</strong>
          <span class="comment-time">${timeAgo(c.createdAt)}</span>
          ${c.author === user ? `<button class="comment-delete" onclick="deleteComment(${post.id}, ${c.id})" title="Delete comment">&#128465;</button>` : ''}
        </div>
        <div class="comment-body">${escapeHTML(c.body)}</div>
      </div>`).join('');

  const formHTML = user
    ? `<div class="comment-form">
        <div class="comment-input-row">
          <div class="comment-avatar">${escapeHTML(user.charAt(0).toUpperCase())}</div>
          <textarea
            id="comment-input-${post.id}"
            class="comment-textarea"
            placeholder="Write a comment... (Ctrl+Enter to post)"
            maxlength="500"
            rows="2"
            oninput="document.getElementById('comment-count-${post.id}').textContent = this.value.length"
            onkeydown="if(event.ctrlKey && event.key==='Enter') submitComment(${post.id})"
          ></textarea>
        </div>
        <div class="comment-form-footer">
          <span class="char-count"><span id="comment-count-${post.id}">0</span>/500</span>
          <button class="btn btn-primary btn-sm" onclick="submitComment(${post.id})">Post Comment</button>
        </div>
      </div>`
    : `<div class="comment-login-prompt">
        <a href="#" onclick="openAuthModal('login'); return false;">Log in</a> to join the conversation.
      </div>`;

  return listHTML + formHTML;
}

function renderCommentSection(postId) {
  const post = posts.find(p => p.id === postId);
  if (!post) return;
  const section = document.getElementById(`comments-${postId}`);
  if (section) section.innerHTML = buildCommentSectionInner(post);
  const btn = document.getElementById(`comment-btn-${postId}`);
  if (btn) {
    const count = (post.comments || []).length;
    btn.innerHTML = `&#128172; ${count} Comment${count !== 1 ? 's' : ''}`;
  }
}

function submitComment(postId) {
  if (!getCurrentUser()) {
    openAuthModal('login');
    return;
  }
  const input = document.getElementById(`comment-input-${postId}`);
  const body = input ? input.value.trim() : '';
  if (!body) return;

  const flagged = moderateText(body);
  if (flagged) {
    showToast(`Comment blocked: "${flagged}" is not allowed.`);
    return;
  }

  const post = posts.find(p => p.id === postId);
  if (!post) return;
  if (!post.comments) post.comments = [];

  post.comments.push({
    id: Date.now(),
    author: getCurrentUser(),
    body,
    createdAt: Date.now()
  });

  savePosts();
  renderCommentSection(postId);
  showToast('Comment posted!');
}

function deleteComment(postId, commentId) {
  const post = posts.find(p => p.id === postId);
  if (!post) return;
  post.comments = (post.comments || []).filter(c => c.id !== commentId);
  savePosts();
  renderCommentSection(postId);
  showToast('Comment deleted.');
}

// ── INIT ──
renderFeed();

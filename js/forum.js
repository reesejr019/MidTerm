// ── MODERATION — BANNED WORDS (PG-13) ──
const BANNED_WORDS = [
  // ── profanity ──
  'fuck', 'f**k', 'fuk', 'fvck',
  'shit', 'sh!t', 'sht',
  'bullshit',
  'ass', 'a$$', 'arse',
  'asshole', 'a$$hole',
  'jackass', 'dumbass', 'smartass',
  'bitch', 'b!tch', 'btch',
  'bastard',
  'cunt', 'c**t',
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
];

function moderateText(text) {
  const lower = text.toLowerCase();
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
let posts = [];
let selectedImageDataURL = null;
let searchQuery = '';
let activeFilter = 'All';
let activeSort = 'hot';
let expandedComments = new Set();

// ── SEARCH / FILTER ──
function handleSearch() {
  const raw = document.getElementById('search-input').value;
  searchQuery = raw.trim();
  document.getElementById('search-clear').classList.toggle('visible', raw.length > 0);
  _renderFeedDOM();
}

function clearSearch() {
  document.getElementById('search-input').value = '';
  searchQuery = '';
  document.getElementById('search-clear').classList.remove('visible');
  _renderFeedDOM();
}

function setFilter(forum, el) {
  activeFilter = forum;
  document.querySelectorAll('.pill').forEach(p => p.classList.remove('active'));
  el.classList.add('active');
  _renderFeedDOM();
}

function setSort(sort, el) {
  activeSort = sort;
  document.querySelectorAll('.sort-tab').forEach(t => t.classList.remove('active'));
  el.classList.add('active');
  _renderFeedDOM();
}

function hotScore(post) {
  const ageHours = (Date.now() - post.createdAt) / (1000 * 60 * 60);
  return post.score / Math.pow(ageHours + 2, 1.5);
}

function isTrending(post) {
  const ageHours = (Date.now() - post.createdAt) / (1000 * 60 * 60);
  return post.score >= 3 && ageHours <= 48;
}

function getFilteredPosts() {
  const q = searchQuery.toLowerCase();
  const filtered = posts.slice().filter(post => {
    const matchesForum = activeFilter === 'All' || post.forum === activeFilter;
    const matchesQuery = !q
      || post.title.toLowerCase().includes(q)
      || (post.body && post.body.toLowerCase().includes(q))
      || post.forum.toLowerCase().includes(q);
    return matchesForum && matchesQuery;
  });

  switch (activeSort) {
    case 'hot': return filtered.sort((a, b) => hotScore(b) - hotScore(a));
    case 'new': return filtered.sort((a, b) => b.createdAt - a.createdAt);
    case 'top': return filtered.sort((a, b) => b.score - a.score);
    default:    return filtered;
  }
}

function highlight(text, query) {
  if (!query) return escapeHTML(text);
  const safe = escapeHTML(text);
  const escapedQuery = escapeHTML(query);
  const regexSafe = escapedQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return safe.replace(new RegExp(regexSafe, 'gi'), m => `<mark>${m}</mark>`);
}

// ── DB FETCH ──
async function loadPostsFromDB() {
  const user = getCurrentUser();

  const { data: postRows } = await sb
    .from('posts')
    .select('*, comments(count)')
    .order('created_at', { ascending: false });

  let userVoteMap = {};
  if (user && postRows?.length) {
    const { data: voteRows } = await sb
      .from('votes')
      .select('post_id, value')
      .eq('user_id', user.id);
    if (voteRows) {
      voteRows.forEach(v => { userVoteMap[v.post_id] = v.value; });
    }
  }

  posts = (postRows || []).map(row => ({
    id:           row.id,
    title:        row.title,
    body:         row.body || '',
    image:        row.image || '',
    forum:        row.forum,
    author:       row.author_username,
    author_id:    row.author_id,
    score:        row.score,
    userVote:     userVoteMap[row.id] || 0,
    createdAt:    new Date(row.created_at).getTime(),
    comments:     [],
    commentCount: row.comments?.[0]?.count ?? 0,
    reported:     row.reported || false,
    reportReason: row.report_reason || ''
  }));
}

// ── RENDER ──
async function renderFeed() {
  await loadPostsFromDB();
  _renderFeedDOM();
  loadMemberCount();
}

async function loadMemberCount() {
  const { count } = await sb.from('profiles').select('*', { count: 'exact', head: true });
  const el = document.getElementById('stat-members');
  if (el && count !== null) el.textContent = count.toLocaleString();
}

function _renderFeedDOM() {
  const feed      = document.getElementById('feed');
  const count     = document.getElementById('post-count');
  const statPosts = document.getElementById('stat-posts');

  statPosts.textContent = posts.length;
  document.getElementById('stat-votes').textContent =
    posts.reduce((sum, p) => sum + Math.abs(p.score), 0);

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

  const user = getCurrentUser();
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
          <span class="forum-tag">r/${escapeHTML(post.forum)}</span>
          &nbsp;·&nbsp; Posted by <strong>${escapeHTML(post.author)}</strong>
          &nbsp;·&nbsp; ${timeAgo(post.createdAt)}
        </div>
        <div class="post-title">${highlight(post.title, searchQuery)}</div>
        ${activeSort === 'hot' && isTrending(post) ? `<div class="trending-badge">&#128293; Trending</div>` : ''}
        ${post.reported ? `
        <div class="reported-banner">
          &#9888; Reported &nbsp;&middot;&nbsp; ${escapeHTML(post.reportReason)}
        </div>` : ''}
        ${post.image ? `<img class="post-image" src="${post.image}" alt="Post image" />` : ''}
        ${post.body ? `<div class="post-text">${highlight(post.body, searchQuery)}</div>` : ''}
        <div class="post-footer">
          <button class="post-action comment ${expandedComments.has(post.id) ? 'open' : ''}"
            id="comment-btn-${post.id}" onclick="toggleComments(${post.id})">
            &#128172; ${post.commentCount} Comment${post.commentCount !== 1 ? 's' : ''}
            <span class="comment-chevron">&#9662;</span>
          </button>
          <button class="post-action report ${post.reported ? 'active' : ''}"
            onclick="openReportModal(${post.id})"
            title="${post.reported ? 'Already reported' : 'Report post'}">
            &#9873; ${post.reported ? 'Reported' : 'Report'}
          </button>
          ${user && post.author_id === user.id ? `
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

// ── CREATE POST ──
async function submitPost(e) {
  e.preventDefault();
  const title = document.getElementById('post-title').value.trim();
  const body  = document.getElementById('post-body').value.trim();
  const forum = document.getElementById('post-forum').value;

  if (!title || !forum) return;

  const flaggedTitle = moderateText(title);
  const flaggedBody  = body ? moderateText(body) : null;
  if (flaggedTitle) { showModError(`Your title contains a word that is not allowed: "${flaggedTitle}". Please keep this forum PG-13.`); return; }
  if (flaggedBody)  { showModError(`Your content contains a word that is not allowed: "${flaggedBody}". Please keep this forum PG-13.`); return; }
  clearModError();

  const user = getCurrentUser();
  const { data: newRow, error } = await sb.from('posts').insert({
    title,
    body,
    forum,
    image:           selectedImageDataURL || '',
    author_id:       user.id,
    author_username: user.username,
    score:           1
  }).select().single();

  if (error || !newRow) { showToast('Error creating post. Please try again.'); return; }

  // Auto-upvote own post
  await sb.from('votes').insert({ post_id: newRow.id, user_id: user.id, value: 1 });

  posts.unshift({
    id:           newRow.id,
    title:        newRow.title,
    body:         newRow.body || '',
    image:        newRow.image || '',
    forum:        newRow.forum,
    author:       newRow.author_username,
    author_id:    newRow.author_id,
    score:        1,
    userVote:     1,
    createdAt:    new Date(newRow.created_at).getTime(),
    comments:     [],
    commentCount: 0,
    reported:     false,
    reportReason: ''
  });

  _renderFeedDOM();
  closeModal();
  resetForm();
  showToast('Post published successfully!');
}

// ── DELETE POST ──
async function deletePost(id) {
  await sb.from('posts').delete().eq('id', id);
  posts = posts.filter(p => p.id !== id);
  _renderFeedDOM();
  showToast('Post deleted.');
}

// ── REPORT ──
let reportTargetId = null;

function openReportModal(id) {
  const post = posts.find(p => p.id === id);
  if (!post) return;
  if (post.reported) { showToast('You have already reported this post.'); return; }
  reportTargetId = id;
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

async function submitReport() {
  const reasonEl = document.querySelector('input[name="report-reason"]:checked');
  if (!reasonEl) { document.getElementById('report-error').style.display = 'block'; return; }
  document.getElementById('report-error').style.display = 'none';

  const post = posts.find(p => p.id === reportTargetId);
  if (!post) return;

  const details = document.getElementById('report-details').value.trim();
  const reason  = reasonEl.value + (details ? ` — ${details}` : '');

  await sb.from('posts').update({ reported: true, report_reason: reason }).eq('id', reportTargetId);
  post.reported     = true;
  post.reportReason = reason;

  _renderFeedDOM();
  closeReportModal();
  showToast('Report submitted. Thank you for keeping the forum safe.');
}

// ── VOTE ──
async function vote(id, dir) {
  if (!getCurrentUser()) { openAuthModal('login'); showToast('Please log in to vote.'); return; }
  const post = posts.find(p => p.id === id);
  if (!post) return;

  const user        = getCurrentUser();
  const currentVote = post.userVote || 0;
  let newScore = post.score;
  let newVote;

  if (currentVote === dir) {
    // Toggle vote off
    newScore -= dir;
    newVote   = 0;
    await sb.from('votes').delete().eq('post_id', id).eq('user_id', user.id);
  } else {
    newScore = newScore - currentVote + dir;
    newVote  = dir;
    await sb.from('votes').upsert({ post_id: id, user_id: user.id, value: dir });
  }

  await sb.from('posts').update({ score: newScore }).eq('id', id);
  post.score   = newScore;
  post.userVote = newVote;
  _renderFeedDOM();
}

// ── MODAL ──
function openModal() {
  if (!getCurrentUser()) { openAuthModal('login'); showToast('Please log in to create a post.'); return; }
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
  document.getElementById('body-count').textContent  = '0';
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
    document.getElementById('upload-placeholder').style.display  = 'none';
    document.getElementById('img-preview-wrap').style.display    = 'block';
  };
  reader.readAsDataURL(file);
}

function removeImage(e) {
  e.stopPropagation();
  selectedImageDataURL = null;
  document.getElementById('img-input').value         = '';
  document.getElementById('img-preview').src         = '';
  document.getElementById('upload-placeholder').style.display = 'block';
  document.getElementById('img-preview-wrap').style.display   = 'none';
}

// ── CHAR COUNTERS ──
document.getElementById('post-title').addEventListener('input', function() {
  document.getElementById('title-count').textContent = this.value.length;
});

document.getElementById('post-body').addEventListener('input', function() {
  document.getElementById('body-count').textContent = this.value.length;
});

// ── COMMENTS ──
async function toggleComments(id) {
  const section = document.getElementById(`comments-${id}`);
  const btn     = document.getElementById(`comment-btn-${id}`);
  if (!section) return;

  if (expandedComments.has(id)) {
    expandedComments.delete(id);
    section.style.display = 'none';
    if (btn) btn.classList.remove('open');
  } else {
    expandedComments.add(id);
    section.style.display = 'block';
    if (btn) btn.classList.add('open');
    section.innerHTML = '<p class="no-comments">Loading comments...</p>';
    await loadAndRenderComments(id);
    setTimeout(() => {
      const input = document.getElementById(`comment-input-${id}`);
      if (input) input.focus();
    }, 50);
  }
}

async function loadAndRenderComments(postId) {
  const { data: rows } = await sb
    .from('comments')
    .select('*')
    .eq('post_id', postId)
    .order('created_at', { ascending: true });

  const post = posts.find(p => p.id === postId);
  if (post) {
    post.comments = (rows || []).map(c => ({
      id:        c.id,
      author:    c.author_username,
      author_id: c.author_id,
      body:      c.body,
      createdAt: new Date(c.created_at).getTime()
    }));
    post.commentCount = post.comments.length;
  }
  renderCommentSection(postId);
}

function buildCommentSectionInner(post) {
  const comments = post.comments || [];
  const user     = getCurrentUser();

  const listHTML = comments.length === 0
    ? '<p class="no-comments">No comments yet. Be the first!</p>'
    : comments.map(c => `
      <div class="comment-item">
        <div class="comment-meta">
          <strong class="comment-author">${escapeHTML(c.author)}</strong>
          <span class="comment-time">${timeAgo(c.createdAt)}</span>
          ${user && c.author_id === user.id
            ? `<button class="comment-delete" onclick="deleteComment(${post.id}, ${c.id})" title="Delete comment">&#128465;</button>`
            : ''}
        </div>
        <div class="comment-body">${escapeHTML(c.body)}</div>
      </div>`).join('');

  const formHTML = user
    ? `<div class="comment-form">
        <div class="comment-input-row">
          <div class="comment-avatar">${escapeHTML(user.username.charAt(0).toUpperCase())}</div>
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
    const count = post.commentCount || 0;
    btn.innerHTML = `&#128172; ${count} Comment${count !== 1 ? 's' : ''} <span class="comment-chevron">&#9662;</span>`;
  }
}

async function submitComment(postId) {
  if (!getCurrentUser()) { openAuthModal('login'); return; }
  const input = document.getElementById(`comment-input-${postId}`);
  const body  = input ? input.value.trim() : '';
  if (!body) return;

  const flagged = moderateText(body);
  if (flagged) { showToast(`Comment blocked: "${flagged}" is not allowed.`); return; }

  const user = getCurrentUser();
  const { data: newComment, error } = await sb.from('comments').insert({
    post_id:         postId,
    author_id:       user.id,
    author_username: user.username,
    body
  }).select().single();

  if (error || !newComment) { showToast('Error posting comment. Please try again.'); return; }

  const post = posts.find(p => p.id === postId);
  if (post) {
    post.comments.push({
      id:        newComment.id,
      author:    newComment.author_username,
      author_id: newComment.author_id,
      body:      newComment.body,
      createdAt: new Date(newComment.created_at).getTime()
    });
    post.commentCount = (post.commentCount || 0) + 1;
  }
  renderCommentSection(postId);
  showToast('Comment posted!');
}

async function deleteComment(postId, commentId) {
  await sb.from('comments').delete().eq('id', commentId);
  const post = posts.find(p => p.id === postId);
  if (post) {
    post.comments    = post.comments.filter(c => c.id !== commentId);
    post.commentCount = Math.max(0, (post.commentCount || 0) - 1);
  }
  renderCommentSection(postId);
  showToast('Comment deleted.');
}

// ── INIT ──
onAuthReady(() => renderFeed());

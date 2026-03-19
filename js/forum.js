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

// ── PAGINATION STATE ──
const PAGE_SIZE    = 15;
let currentPage    = 0;
let hasMore        = true;
let isLoading      = false;
let scrollObserver = null;
let searchDebounce = null;

// ── SEARCH / FILTER ──
function handleSearch() {
  const raw = document.getElementById('search-input').value;
  searchQuery = raw.trim();
  document.getElementById('search-clear').classList.toggle('visible', raw.length > 0);
  clearTimeout(searchDebounce);
  searchDebounce = setTimeout(() => resetAndReload(), 400);
}

function clearSearch() {
  document.getElementById('search-input').value = '';
  searchQuery = '';
  document.getElementById('search-clear').classList.remove('visible');
  resetAndReload();
}

function setFilter(forum, el) {
  activeFilter = forum;
  document.querySelectorAll('.pill').forEach(p => p.classList.remove('active'));
  el.classList.add('active');
  resetAndReload();
}

function setSort(sort, el) {
  activeSort = sort;
  document.querySelectorAll('.sort-tab').forEach(t => t.classList.remove('active'));
  el.classList.add('active');
  resetAndReload();
}

function hotScore(post) {
  const ageHours = (Date.now() - post.createdAt) / (1000 * 60 * 60);
  return post.score / Math.pow(ageHours + 2, 1.5);
}

function isTrending(post) {
  const ageHours = (Date.now() - post.createdAt) / (1000 * 60 * 60);
  return post.score >= 3 && ageHours <= 48;
}

function getSortedPosts() {
  if (activeSort === 'hot') {
    return posts.slice().sort((a, b) => hotScore(b) - hotScore(a));
  }
  // 'new' and 'top' are already ordered server-side
  return posts.slice();
}

function highlight(text, query) {
  if (!query) return escapeHTML(text);
  const safe = escapeHTML(text);
  const escapedQuery = escapeHTML(query);
  const regexSafe = escapedQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return safe.replace(new RegExp(regexSafe, 'gi'), m => `<mark>${m}</mark>`);
}

// ── DB FETCH (PAGINATED) ──
async function loadNextPage() {
  if (isLoading || !hasMore) return;
  isLoading = true;
  showLoadingIndicator(true);

  const from = currentPage * PAGE_SIZE;
  const to   = from + PAGE_SIZE - 1;

  let query = sb.from('posts').select('*, comments(count)');

  if (activeFilter !== 'All') {
    query = query.eq('forum', activeFilter);
  }
  if (searchQuery) {
    query = query.or(`title.ilike.%${searchQuery}%,body.ilike.%${searchQuery}%`);
  }
  if (activeSort === 'top') {
    query = query.order('score', { ascending: false });
  } else {
    query = query.order('created_at', { ascending: false });
  }

  query = query.range(from, to);

  const { data: postRows, error } = await query;

  if (error || !postRows) {
    isLoading = false;
    showLoadingIndicator(false);
    return;
  }

  // Fetch votes only for this batch
  const user = getCurrentUser();
  let userVoteMap = {};
  if (user && postRows.length) {
    const ids = postRows.map(r => r.id);
    const { data: voteRows } = await sb
      .from('votes')
      .select('post_id, value')
      .eq('user_id', user.id)
      .in('post_id', ids);
    if (voteRows) voteRows.forEach(v => { userVoteMap[v.post_id] = v.value; });
  }

  const newPosts = postRows.map(row => ({
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

  posts = posts.concat(newPosts);
  hasMore = postRows.length === PAGE_SIZE;
  currentPage++;

  _appendPostsDOM(newPosts);
  updatePostCount();

  isLoading = false;
  showLoadingIndicator(false);

  if (!hasMore) showAllCaughtUp(true);
}

// ── RENDER ──
async function renderFeed() {
  buildSentinel();
  initIntersectionObserver();
  await resetAndReload();
  loadMemberCount();
  loadSidebarStats();
}

async function resetAndReload() {
  posts       = [];
  currentPage = 0;
  hasMore     = true;
  isLoading   = false;
  expandedComments.clear();

  const feed = document.getElementById('feed');
  // Clear all post cards but keep the sentinel
  const sentinel = document.getElementById('scroll-sentinel');
  feed.innerHTML = '';
  if (sentinel) feed.appendChild(sentinel);

  showAllCaughtUp(false);
  updatePostCount();
  await loadNextPage();
}

function buildSentinel() {
  if (document.getElementById('scroll-sentinel')) return;
  const sentinel = document.createElement('div');
  sentinel.id = 'scroll-sentinel';
  sentinel.style.height = '1px';
  document.getElementById('feed').appendChild(sentinel);
}

function initIntersectionObserver() {
  if (scrollObserver) scrollObserver.disconnect();
  scrollObserver = new IntersectionObserver(entries => {
    if (entries[0].isIntersecting && hasMore && !isLoading) {
      loadNextPage();
    }
  }, { rootMargin: '200px' });
  const sentinel = document.getElementById('scroll-sentinel');
  if (sentinel) scrollObserver.observe(sentinel);
}

async function loadMemberCount() {
  const { count } = await sb.from('profiles').select('*', { count: 'exact', head: true });
  const el = document.getElementById('stat-members');
  if (el && count !== null) el.textContent = count.toLocaleString();
}

async function loadSidebarStats() {
  let countQuery = sb.from('posts').select('*', { count: 'exact', head: true });
  if (activeFilter !== 'All') countQuery = countQuery.eq('forum', activeFilter);
  if (searchQuery) countQuery = countQuery.or(`title.ilike.%${searchQuery}%,body.ilike.%${searchQuery}%`);

  const { count: postCount } = await countQuery;

  const statPosts = document.getElementById('stat-posts');
  const statVotes = document.getElementById('stat-votes');
  if (statPosts && postCount !== null) statPosts.textContent = postCount.toLocaleString();
  if (statVotes) {
    statVotes.textContent = posts.reduce((sum, p) => sum + Math.abs(p.score), 0).toLocaleString();
  }
}

function updatePostCount() {
  const count = document.getElementById('post-count');
  if (!count) return;
  const n = posts.length;
  if (n === 0 && !isLoading) {
    count.textContent = '0 posts';
  } else {
    count.textContent = n + (n === 1 ? ' post' : ' posts') + (hasMore ? '+' : '');
  }
}

function showLoadingIndicator(visible) {
  const el = document.getElementById('feed-loading');
  if (el) el.style.display = visible ? 'flex' : 'none';
}

function showAllCaughtUp(visible) {
  const el = document.getElementById('feed-all-caught-up');
  if (el) el.style.display = visible ? 'block' : 'none';
}

// ── POST CARD HTML ──
function buildPostCardHTML(post) {
  const user = getCurrentUser();
  return `
    <div class="post-card" id="post-${post.id}">
      <div class="vote-col">
        <button class="vote-btn ${post.userVote === 1 ? 'active-up' : ''}"
          onclick="vote(${post.id}, 1)" title="Upvote"><i data-lucide="chevron-up"></i></button>
        <span class="vote-score">${post.score}</span>
        <button class="vote-btn ${post.userVote === -1 ? 'active-down' : ''}"
          onclick="vote(${post.id}, -1)" title="Downvote"><i data-lucide="chevron-down"></i></button>
      </div>
      <div class="post-body">
        <div class="post-meta">
          <span class="forum-tag">${escapeHTML(post.forum)}</span>
          &nbsp;·&nbsp; Posted by <strong>${escapeHTML(post.author)}</strong>
          &nbsp;·&nbsp; ${timeAgo(post.createdAt)}
        </div>
        <div class="post-title">${highlight(post.title, searchQuery)}</div>
        ${activeSort === 'hot' && isTrending(post) ? `<div class="trending-badge"><i data-lucide="trending-up"></i> Trending</div>` : ''}
        ${post.reported ? `
        <div class="reported-banner">
          <i data-lucide="alert-triangle"></i> Reported &nbsp;&middot;&nbsp; ${escapeHTML(post.reportReason)}
        </div>` : ''}
        ${post.image ? `<img class="post-image" src="${post.image}" alt="Post image" loading="lazy" decoding="async" />` : ''}
        ${post.body ? `<div class="post-text">${highlight(post.body, searchQuery)}</div>` : ''}
        <div class="post-footer">
          <button class="post-action comment ${expandedComments.has(post.id) ? 'open' : ''}"
            id="comment-btn-${post.id}" onclick="toggleComments(${post.id})">
            <i data-lucide="message-square"></i> ${post.commentCount} <span class="comment-chevron"><i data-lucide="chevron-down"></i></span>
          </button>
          <button class="post-action report ${post.reported ? 'active' : ''}"
            onclick="openReportModal(${post.id})"
            title="${post.reported ? 'Already reported' : 'Report post'}">
            <i data-lucide="flag"></i> ${post.reported ? 'Reported' : 'Report'}
          </button>
          ${user && post.author_id === user.id ? `
          <button class="post-action delete" onclick="deletePost(${post.id})">
            <i data-lucide="trash-2"></i> Delete
          </button>` : ''}
        </div>
        <div class="comment-section" id="comments-${post.id}"
          style="${expandedComments.has(post.id) ? '' : 'display:none'}">
          ${buildCommentSectionInner(post)}
        </div>
      </div>
    </div>
  `;
}

function _appendPostsDOM(newPosts) {
  const feed     = document.getElementById('feed');
  const sentinel = document.getElementById('scroll-sentinel');

  if (activeSort === 'hot') {
    // Re-sort entire buffer and re-render all cards
    const sorted = getSortedPosts();
    feed.querySelectorAll('.post-card').forEach(el => el.remove());
    const temp = document.createElement('div');
    temp.innerHTML = sorted.map(buildPostCardHTML).join('');
    Array.from(temp.children).forEach(node => feed.insertBefore(node, sentinel));
  } else {
    // Append only the new batch before the sentinel
    const temp = document.createElement('div');
    temp.innerHTML = newPosts.map(buildPostCardHTML).join('');
    Array.from(temp.children).forEach(node => feed.insertBefore(node, sentinel));
  }

  // Empty state
  if (posts.length === 0) {
    const empty = document.createElement('div');
    if (searchQuery) {
      empty.className = 'no-results';
      empty.innerHTML = `
        <div class="icon"><i data-lucide="search"></i></div>
        <h3>No results found</h3>
        <p>Try different keywords or clear the search filter.</p>`;
    } else {
      empty.className = 'empty-state';
      empty.innerHTML = `
        <div class="icon"><i data-lucide="message-square"></i></div>
        <h3>No posts yet</h3>
        <p>Be the first to share something with the community.</p>`;
    }
    feed.insertBefore(empty, sentinel);
  }

  if (typeof lucide !== 'undefined') lucide.createIcons();
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
    score:           0
  }).select().single();

  if (error || !newRow) { showToast('Error creating post. Please try again.'); return; }

  closeModal();
  resetForm();
  showToast('Post published successfully!');
  await resetAndReload();
  loadSidebarStats();
}

// ── DELETE POST ──
async function deletePost(id) {
  await sb.from('posts').delete().eq('id', id);
  posts = posts.filter(p => p.id !== id);

  const card = document.getElementById(`post-${id}`);
  if (card) card.remove();

  updatePostCount();
  loadSidebarStats();
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

  const card = document.getElementById(`post-${reportTargetId}`);
  if (card) {
    card.outerHTML = buildPostCardHTML(post);
    if (typeof lucide !== 'undefined') lucide.createIcons();
  }
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
  let newVote;

  if (currentVote === dir) {
    newVote = 0;
    await sb.from('votes').delete().eq('post_id', id).eq('user_id', user.id);
  } else if (currentVote !== 0) {
    newVote = 0;
    await sb.from('votes').delete().eq('post_id', id).eq('user_id', user.id);
  } else {
    newVote = dir;
    await sb.from('votes').upsert({ post_id: id, user_id: user.id, value: dir });
  }

  const { data: allVotes } = await sb.from('votes').select('value').eq('post_id', id);
  const newScore = (allVotes || []).reduce((sum, v) => sum + v.value, 0);

  await sb.from('posts').update({ score: newScore }).eq('id', id);
  post.score    = newScore;
  post.userVote = newVote;

  // Update only the affected card's vote UI in place
  const card = document.getElementById(`post-${id}`);
  if (card) {
    const scoreEl  = card.querySelector('.vote-score');
    const voteBtns = card.querySelectorAll('.vote-btn');
    if (scoreEl)      scoreEl.textContent = newScore;
    if (voteBtns[0])  voteBtns[0].classList.toggle('active-up',   newVote === 1);
    if (voteBtns[1])  voteBtns[1].classList.toggle('active-down', newVote === -1);
  }
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
  if (file && file.type.startsWith('image/')) loadImage(file);
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
  // GIFs: skip canvas to preserve animation
  if (file.type === 'image/gif') {
    const reader = new FileReader();
    reader.onload = function(ev) {
      selectedImageDataURL = ev.target.result;
      document.getElementById('img-preview').src                  = ev.target.result;
      document.getElementById('upload-placeholder').style.display = 'none';
      document.getElementById('img-preview-wrap').style.display   = 'block';
    };
    reader.readAsDataURL(file);
    return;
  }

  const reader = new FileReader();
  reader.onload = function(ev) {
    const img = new Image();
    img.onerror = function() {
      showToast('Could not load image. Please try a different file.');
    };
    img.onload = function() {
      const MAX_WIDTH = 1200;
      const scale = img.width > MAX_WIDTH ? MAX_WIDTH / img.width : 1;
      const canvas = document.createElement('canvas');
      canvas.width  = Math.round(img.width  * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      const mime = (file.type === 'image/png' || file.type === 'image/webp')
        ? 'image/png'
        : 'image/jpeg';
      selectedImageDataURL = canvas.toDataURL(mime, 0.9);
      document.getElementById('img-preview').src                  = selectedImageDataURL;
      document.getElementById('upload-placeholder').style.display = 'none';
      document.getElementById('img-preview-wrap').style.display   = 'block';
    };
    img.src = ev.target.result;
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
            ? `<button class="comment-delete" onclick="deleteComment(${post.id}, ${c.id})" title="Delete comment"><i data-lucide="trash-2"></i></button>`
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
  if (section) {
    section.innerHTML = buildCommentSectionInner(post);
    if (typeof lucide !== 'undefined') lucide.createIcons();
  }
  const btn = document.getElementById(`comment-btn-${postId}`);
  if (btn) {
    const count = post.commentCount || 0;
    btn.innerHTML = `<i data-lucide="message-square"></i> ${count} <span class="comment-chevron"><i data-lucide="chevron-down"></i></span>`;
    if (typeof lucide !== 'undefined') lucide.createIcons();
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

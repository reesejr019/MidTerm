// ── NOTIFICATIONS ──
let _notifOpen = false;

async function createNotification({ recipientId, type, postId, commentId = null, actorUsername, message }) {
  const user = getCurrentUser();
  if (!user || !recipientId || recipientId === user.id) return; // no self-notifications
  await sb.from('notifications').insert({
    user_id:        recipientId,
    type,
    post_id:        postId,
    comment_id:     commentId,
    actor_username: actorUsername,
    message
  });
}

async function loadNotifications() {
  const user = getCurrentUser();
  if (!user) return [];
  const { data } = await sb
    .from('notifications')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(30);
  return data || [];
}

async function updateNotifBadge() {
  const user  = getCurrentUser();
  const badge = document.getElementById('notif-badge');
  if (!badge) return;
  if (!user) { badge.style.display = 'none'; return; }
  const { count } = await sb
    .from('notifications')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .eq('read', false);
  if (count && count > 0) {
    badge.textContent = count > 9 ? '9+' : String(count);
    badge.style.display = 'flex';
  } else {
    badge.style.display = 'none';
  }
}

async function markAllNotifsRead() {
  const user = getCurrentUser();
  if (!user) return;
  await sb
    .from('notifications')
    .update({ read: true })
    .eq('user_id', user.id)
    .eq('read', false);
}

function _getNotifIcon(type) {
  if (type === 'comment') return 'message-circle';
  if (type === 'reply')   return 'corner-down-right';
  return 'bell';
}

function _renderNotifPanel(notifs, panel) {
  if (!notifs.length) {
    panel.innerHTML = `
      <div class="notif-header"><span>Notifications</span></div>
      <div class="notif-empty">
        <i data-lucide="bell-off"></i>
        <span>No notifications yet</span>
      </div>
    `;
    return;
  }
  const items = notifs.map(n => `
    <div class="notif-item${n.read ? '' : ' unread'}" onclick="handleNotifClick(${n.post_id})">
      <div class="notif-icon"><i data-lucide="${_getNotifIcon(n.type)}"></i></div>
      <div class="notif-body">
        <div class="notif-message">${escapeHTML(n.message)}</div>
        <div class="notif-time">${timeAgo(new Date(n.created_at).getTime())}</div>
      </div>
    </div>
  `).join('');
  panel.innerHTML = `
    <div class="notif-header"><span>Notifications</span></div>
    <div class="notif-list">${items}</div>
  `;
}

async function toggleNotifPanel() {
  const panel = document.getElementById('notif-panel');
  if (!panel) return;
  _notifOpen = !_notifOpen;
  if (_notifOpen) {
    panel.classList.add('open');
    await markAllNotifsRead();
    updateNotifBadge();
    const notifs = await loadNotifications();
    _renderNotifPanel(notifs, panel);
    if (typeof lucide !== 'undefined') lucide.createIcons();
  } else {
    panel.classList.remove('open');
  }
}

function handleNotifClick(postId) {
  const panel = document.getElementById('notif-panel');
  if (panel) panel.classList.remove('open');
  _notifOpen = false;

  const card = document.getElementById(`post-${postId}`);
  if (card) {
    card.scrollIntoView({ behavior: 'smooth', block: 'center' });
    card.classList.add('notif-highlight');
    setTimeout(() => card.classList.remove('notif-highlight'), 1800);
  } else {
    window.location.href = 'forum.html';
  }
}

// Close panel when clicking outside
document.addEventListener('click', (e) => {
  if (!_notifOpen) return;
  const btn   = document.getElementById('notif-btn');
  const panel = document.getElementById('notif-panel');
  if (btn && panel && !btn.contains(e.target) && !panel.contains(e.target)) {
    panel.classList.remove('open');
    _notifOpen = false;
  }
});

// Refresh badge every 30 seconds while page is open
setInterval(() => {
  if (getCurrentUser()) updateNotifBadge();
}, 30000);

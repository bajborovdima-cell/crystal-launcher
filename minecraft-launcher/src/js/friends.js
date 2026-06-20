let friends = [];

function getFriendsPath() {
  return 'friends.json';
}

async function loadFriends() {
  try {
    friends = await crystalAPI.loadFriends();
  } catch { friends = []; }
  renderFriendList();
}

async function addFriend() {
  const input = document.getElementById('inviteUsername');
  const name = input.value.trim();
  if (!name) { showToast('Введите имя друга'); return; }
  if (friends.includes(name)) { showToast('Этот друг уже добавлен'); return; }
  friends.push(name);
  await crystalAPI.saveFriends(friends);
  input.value = '';
  renderFriendList();
  showToast(`Друг ${name} добавлен`);
}

async function removeFriend(name) {
  friends = friends.filter(f => f !== name);
  await crystalAPI.saveFriends(friends);
  renderFriendList();
  showToast(`Друг ${name} удалён`);
}

function renderFriendList() {
  const container = document.getElementById('friendList');
  document.getElementById('playerCount').textContent = friends.length;
  if (friends.length === 0) {
    container.innerHTML = `
      <div class="friend-empty">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.15)" stroke-width="1.5">
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
          <circle cx="9" cy="7" r="4"/>
          <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
          <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
        </svg>
        <p>У вас пока нет друзей.<br>Добавьте друга по нику</p>
      </div>`;
    return;
  }
  container.innerHTML = friends.map(f => `
    <div class="friend-item">
      <div class="friend-avatar">${f.charAt(0).toUpperCase()}</div>
      <div class="friend-info">
        <div class="friend-name">${f}</div>
        <div class="friend-status-text">В списке</div>
      </div>
      <button class="btn btn-sm" onclick="removeFriend('${f}')" style="margin-left:auto;color:var(--red);background:none;border:1px solid var(--border);border-radius:var(--radius-sm);padding:4px 10px;cursor:pointer">Удалить</button>
    </div>
  `).join('');
}

document.addEventListener('DOMContentLoaded', () => {
  loadFriends();
});

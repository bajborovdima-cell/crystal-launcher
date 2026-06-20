document.addEventListener('DOMContentLoaded', () => {
  initNavigation();
  initRamSelector();
  initUsernameSync();
});

function initNavigation() {
  const navItems = document.querySelectorAll('.nav-item');
  const tabContents = document.querySelectorAll('.tab-content');

  navItems.forEach(item => {
    item.addEventListener('click', () => {
      const tabId = item.dataset.tab;
      navItems.forEach(n => n.classList.remove('active'));
      item.classList.add('active');
      tabContents.forEach(t => t.classList.remove('active'));
      document.getElementById(`tab-${tabId}`).classList.add('active');
    });
  });
}

function initRamSelector() {
  const ramBtns = document.querySelectorAll('.ram-btn');
  ramBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      ramBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      localStorage.setItem('saved-ram', btn.dataset.ram);
    });
  });
}

function initUsernameSync() {
  const input = document.getElementById('usernameInput');
  const nameEl = document.getElementById('profileName');
  if (input && nameEl) {
    nameEl.textContent = input.value || 'Player';
    input.addEventListener('input', () => {
      nameEl.textContent = input.value || 'Player';
      localStorage.setItem('saved-username', input.value);
    });
  }
}

function showToast(message) {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(toast._timeout);
  toast._timeout = setTimeout(() => {
    toast.classList.remove('show');
  }, 3000);
}

const { WebSocketServer } = require('ws');
const { v4: uuidv4 } = require('uuid');

const PORT = process.env.PORT || 8080;
const wss = new WebSocketServer({ port: PORT });

const clients = new Map();
const friendships = new Map();
const pendingInvites = new Map();

console.log(`[Crystal] Friend Server запущен на ws://localhost:${PORT}`);
console.log('[Crystal] Ожидание подключений...');

wss.on('connection', (ws, req) => {
  const clientId = uuidv4();
  let username = null;

  console.log(`[+] Новое подключение: ${clientId}`);

  ws.on('message', (raw) => {
    try {
      const msg = JSON.parse(raw);
      handleMessage(clientId, ws, msg);
    } catch (err) {
      ws.send(JSON.stringify({ type: 'error', message: 'Invalid message' }));
    }
  });

  ws.on('close', () => {
    if (username) {
      clients.delete(username);
      broadcastFriendList();
      console.log(`[-] ${username} отключился`);
    }
  });

  ws.on('error', (err) => {
    console.error(`[!] Ошибка: ${err.message}`);
  });
});

function handleMessage(clientId, ws, msg) {
  switch (msg.type) {
    case 'auth':
      username = msg.username;
      clients.set(username, { ws, clientId, online: true });
      ws.send(JSON.stringify({ type: 'auth_ok', clientId }));
      broadcastFriendList();
      console.log(`[✓] ${username} авторизован`);
      break;

    case 'invite':
      handleInvite(ws, msg);
      break;

    case 'accept_invite':
      handleAcceptInvite(ws, msg);
      break;

    case 'friend_list':
      ws.send(JSON.stringify({
        type: 'friend_list',
        friends: getFriendList(msg.username)
      }));
      break;

    default:
      ws.send(JSON.stringify({ type: 'error', message: 'Unknown type' }));
  }
}

function handleInvite(ws, msg) {
  const from = msg.from || username;
  const to = msg.to;

  if (!clients.has(to)) {
    ws.send(JSON.stringify({ type: 'error', message: `Игрок ${to} не в сети` }));
    return;
  }

  const target = clients.get(to);
  if (!target.online) {
    ws.send(JSON.stringify({ type: 'error', message: `Игрок ${to} не в сети` }));
    return;
  }

  pendingInvites.set(`${from}_${to}`, { from, to });

  target.ws.send(JSON.stringify({
    type: 'invite',
    from: from,
    serverInfo: {
      host: 'localhost',
      port: 25565,
      version: '26.1.2'
    }
  }));

  console.log(`[→] Приглашение: ${from} → ${to}`);
}

function handleAcceptInvite(ws, msg) {
  const from = msg.from;
  const to = msg.to || username;

  const key = `${from}_${to}`;
  const invite = pendingInvites.get(key);

  if (!invite) {
    ws.send(JSON.stringify({ type: 'error', message: 'Приглашение не найдено' }));
    return;
  }

  pendingInvites.delete(key);

  const fromClient = clients.get(from);
  if (fromClient) {
    fromClient.ws.send(JSON.stringify({
      type: 'invite_accepted',
      from: to
    }));
  }

  ws.send(JSON.stringify({
    type: 'join_game',
    from: from,
    address: 'localhost:25565'
  }));

  if (!friendships.has(from)) friendships.set(from, new Set());
  if (!friendships.has(to)) friendships.set(to, new Set());
  friendships.get(from).add(to);
  friendships.get(to).add(from);

  console.log(`[✓] ${to} принял приглашение ${from}`);
}

function broadcastFriendList() {
  const onlineList = Array.from(clients.keys()).map(name => ({ name, online: true }));
  const payload = JSON.stringify({ type: 'friend_list', friends: onlineList });

  clients.forEach((client) => {
    if (client.ws.readyState === 1) {
      client.ws.send(payload);
    }
  });
}

function getFriendList(username) {
  const friends = friendships.get(username);
  if (!friends) return [];
  return Array.from(friends)
    .filter(f => clients.has(f) && clients.get(f).online)
    .map(f => ({ name: f, online: true }));
}

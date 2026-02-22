// 1. Инициализация с избыточными реле и WebRTC для прямого соединения
const gun = Gun({
  peers: [
    'https://gun-manhattan.herokuapp.com',
    'https://relay.peer.ooo',
    'https://peer.wall.org',
    'https://gun-us.herokuapp.com'
  ],
  localStorage: true,
  mesh: true
});

// Отладка сети в консоли
gun.on('hi', peer => console.log('%c✅ Подключено к узлу: ' + peer.url, 'color: green'));
gun.on('bye', peer => console.log('%c❌ Потеряна связь с: ' + peer.url, 'color: red'));

let currentUser = localStorage.getItem('ae_v6_active') || null;
let activeRoom = { id: null, key: null, node: null };
const seenIds = new Set();

// Используем уникальный ключ индекса v2 для чистого старта
const indexNode = gun.get('aether_v6_public_index_v2');

window.onload = () => {
  if (currentUser) selectProfile(currentUser);
  renderProfiles();
  listenPublic();
};

// --- МЕНЕДЖЕР ПРОФИЛЕЙ ---
function renderProfiles() {
  const accs = JSON.parse(localStorage.getItem('ae_v6_accs') || '[]');
  const list = document.getElementById('profiles-grid');
  if(!list) return;
  list.innerHTML = accs.map(a => `
    <div class="p-card" onclick="selectProfile('${a}')">
      <div class="p-avatar">${a[0].toUpperCase()}</div>
      <b>${a}</b>
    </div>
  `).join('');
}

function addProfile() {
  const input = document.getElementById('nick-input');
  const nick = input.value.trim();
  if (!nick) return;
  let accs = JSON.parse(localStorage.getItem('ae_v6_accs') || '[]');
  if (!accs.includes(nick)) accs.push(nick);
  localStorage.setItem('ae_v6_accs', JSON.stringify(accs));
  input.value = '';
  selectProfile(nick);
}

function selectProfile(nick) {
  currentUser = nick;
  localStorage.setItem('ae_v6_active', nick);
  document.getElementById('hdr-nick').innerText = nick;
  document.getElementById('hdr-av').innerText = nick[0].toUpperCase();
  document.getElementById('scr-auth').classList.remove('active');
  document.getElementById('scr-app').classList.add('active');
}

function toProfiles() {
  document.getElementById('scr-app').classList.remove('active');
  document.getElementById('scr-auth').classList.add('active');
  renderProfiles();
}

// --- НАВИГАЦИЯ ---
function switchView(id, btn) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById('view-' + id).classList.add('active');
  document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
  if(btn) {
    if(btn instanceof NodeList) btn[1].classList.add('active');
    else btn.classList.add('active');
  }
}

// --- ЧАТ И КОМНАТЫ ---
function listenPublic() {
  // map().once() вытягивает то, что уже в сети
  indexNode.map().once((data, id) => {
    if (data && data.name) updateFeedUI(data, id);
  });
  // map().on() слушает новые изменения
  indexNode.map().on((data, id) => {
    if (data && data.name) updateFeedUI(data, id);
  });
}

function updateFeedUI(data, id) {
  const feed = document.getElementById('public-feed');
  if (!feed || document.getElementById('rc-' + id)) return;
  
  const div = document.createElement('div');
  div.id = 'rc-' + id;
  div.className = 'p-card'; 
  div.style.marginBottom = '12px';
  div.innerHTML = `<b>#${data.name}</b><br><small style="color:var(--text-dim)">Публичное пространство</small>`;
  div.onclick = () => connectRoom(data.name, 'public_key');
  feed.appendChild(div);
}

function createRoom() {
  const id = document.getElementById('c-rid').value.trim().toLowerCase();
  const isPriv = document.querySelector('input[name="rt"]:checked').value === 'priv';
  const seed = document.getElementById('c-seed').value.trim();
  if (!id) return;
  
  if (!isPriv) indexNode.get(id).put({ name: id });
  
  const key = isPriv ? CryptoJS.SHA256(seed).toString() : 'public_key';
  connectRoom(id, key);
  closeModal('mod-create');
}

function joinRoom() {
  const id = document.getElementById('j-rid').value.trim().toLowerCase();
  const seed = document.getElementById('j-seed').value.trim();
  if (!id) return;
  connectRoom(id, seed ? CryptoJS.SHA256(seed).toString() : 'public_key');
  closeModal('mod-join');
}

function connectRoom(id, key) {
  if(activeRoom.node) activeRoom.node.off(); // Отключаем старую подписку

  activeRoom = { id, key, node: gun.get('ae_v6_room_' + id) };
  seenIds.clear();
  document.getElementById('msg-box').innerHTML = '';
  document.getElementById('chat-closed').style.display = 'none';
  document.getElementById('chat-active').style.display = 'flex';
  document.getElementById('active-room-name').innerText = '#' + id;
  
  switchView('chat', document.querySelectorAll('.nav-item')[1]);

  // Глубокое прослушивание сообщений
  activeRoom.node.map().on((enc, mid) => {
    if (!enc || seenIds.has(mid) || typeof enc !== 'string') return;
    try {
      const dec = CryptoJS.AES.decrypt(enc, activeRoom.key).toString(CryptoJS.enc.Utf8);
      if (!dec) return;
      const m = JSON.parse(dec);
      seenIds.add(mid);
      renderMsg(m);
    } catch(e) { console.warn("Ошибка дешифровки сообщения"); }
  });
}

function sendMsg() {
  const inp = document.getElementById('msg-inp');
  if (!inp.value.trim() || !activeRoom.node) return;
  
  const msgObj = { u: currentUser, t: inp.value, ts: Gun.state() };
  const encrypted = CryptoJS.AES.encrypt(JSON.stringify(msgObj), activeRoom.key).toString();
  
  // Публикация сообщения с уникальным ID на основе времени
  activeRoom.node.get('m_' + Gun.state() + '_' + Math.random().toString(36).substr(2, 5)).put(encrypted);
  
  inp.value = '';
}

function renderMsg(m) {
  const flow = document.getElementById('msg-box');
  const div = document.createElement('div');
  div.className = `bubble ${m.u === currentUser ? 'me' : 'ot'}`;
  div.innerHTML = `<small style="font-size:10px;opacity:0.6">${m.u}</small><br>${m.t}`;
  flow.appendChild(div);
  flow.scrollTop = flow.scrollHeight;
}

// --- ХЕЛПЕРЫ ---
function openModal(id) { document.getElementById(id).classList.add('active'); }
function closeModal(id) { document.getElementById(id).classList.remove('active'); }
function toggleSeed(s) { document.getElementById('c-seed').style.display = s ? 'block' : 'none'; }
function exitChat() { 
    document.getElementById('chat-active').style.display = 'none'; 
    document.getElementById('chat-closed').style.display = 'flex'; 
    if(activeRoom.node) activeRoom.node.off();
}

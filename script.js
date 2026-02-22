const gun = Gun([
 'https://gun-manhattan.herokuapp.com/gun',
 'https://relay.peer.ooo/gun'
]);

let currentUser = localStorage.getItem('ae_v6_active') || null;
let activeRoom = { id: null, key: null, node: null };
const seenIds = new Set();
const indexNode = gun.get('aether_v6_public_index');

window.onload = () => {
 if (currentUser) selectProfile(currentUser);
 renderProfiles();
 listenPublic();
};

// --- МЕНЕДЖЕР ПРОФИЛЕЙ ---
function renderProfiles() {
 const accs = JSON.parse(localStorage.getItem('ae_v6_accs') || '[]');
 const list = document.getElementById('profiles-grid'); // ID из твоего HTML
 if(!list) return;
 list.innerHTML = accs.map(a => `
  <div class="p-card" onclick="selectProfile('${a}')">
   <div class="p-avatar">${a[0].toUpperCase()}</div>
   <b>${a}</b>
  </div>
 `).join('');
}

function addProfile() { // Функция для кнопки .add-btn
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

function toProfiles() { // Возврат к списку
 document.getElementById('scr-app').classList.remove('active');
 document.getElementById('scr-auth').classList.add('active');
 renderProfiles();
}

// --- НАВИГАЦИЯ ---
function switchView(id, btn) { // Переименовано под HTML (switchView)
 document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
 document.getElementById('view-' + id).classList.add('active');
 document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
 if(btn) btn.classList.add('active');
}

// --- ЧАТ И КОМНАТЫ ---
function listenPublic() {
 indexNode.map().on((data, id) => {
  if (!data || !data.name) return;
  const feed = document.getElementById('public-feed');
  if (!document.getElementById('rc-' + id)) {
   const div = document.createElement('div');
   div.id = 'rc-' + id;
   div.className = 'p-card'; 
   div.style.marginBottom = '12px';
   div.innerHTML = `<b>#${data.name}</b><br><small style="color:var(--text-dim)">Публичное пространство</small>`;
   div.onclick = () => connectRoom(data.name, 'public_key');
   feed.appendChild(div);
  }
 });
}

function createRoom() { // Для модалки mod-create
 const id = document.getElementById('c-rid').value.trim().toLowerCase();
 const isPriv = document.querySelector('input[name="rt"]:checked').value === 'priv';
 const seed = document.getElementById('c-seed').value.trim();
 if (!id) return;
 if (!isPriv) indexNode.get(id).put({ name: id });
 connectRoom(id, isPriv ? CryptoJS.SHA256(seed).toString() : 'public_key');
 closeModal('mod-create');
}

function joinRoom() { // Для модалки mod-join
 const id = document.getElementById('j-rid').value.trim().toLowerCase();
 const seed = document.getElementById('j-seed').value.trim();
 if (!id) return;
 connectRoom(id, seed ? CryptoJS.SHA256(seed).toString() : 'public_key');
 closeModal('mod-join');
}

function connectRoom(id, key) {
 activeRoom = { id, key, node: gun.get('ae_v6_r_' + id) };
 seenIds.clear();
 document.getElementById('msg-box').innerHTML = '';
 document.getElementById('chat-closed').style.display = 'none';
 document.getElementById('chat-active').style.display = 'flex';
 document.getElementById('active-room-name').innerText = '#' + id;
 
 // Активируем вкладку чата
 switchView('chat', document.querySelectorAll('.nav-item')[1]);

 activeRoom.node.map().on((enc, mid) => {
  if (!enc || seenIds.has(mid)) return;
  try {
   const dec = CryptoJS.AES.decrypt(enc, activeRoom.key).toString(CryptoJS.enc.Utf8);
   if (!dec) return;
   const m = JSON.parse(dec);
   seenIds.add(mid);
   renderMsg(m);
  } catch(e) {}
 });
}

function sendMsg() { // Кнопка самолета
 const inp = document.getElementById('msg-inp');
 if (!inp.value.trim() || !activeRoom.node) return;
 const p = JSON.stringify({ u: currentUser, t: inp.value, ts: Date.now() });
 activeRoom.node.set(CryptoJS.AES.encrypt(p, activeRoom.key).toString());
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
}

function refreshChat(btn) {
 const icon = btn.querySelector('i');
 icon.style.animation = "spin 0.6s linear";
 setTimeout(() => icon.style.animation = "", 600);
 // Переподключение для обновления потока
 if(activeRoom.id) connectRoom(activeRoom.id, activeRoom.key);
}

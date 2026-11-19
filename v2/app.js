// نبضي CRM — النسخة 2 (تجريبية): شاشة المبيعات السريعة
// بتشتغل على نفس قاعدة البيانات ونفس شكل البيانات بتاع النسخة الحالية،
// بس كل موظف بيسحب عملاءه وإجراءاته هو بس، وبعدها التغييرات الجديدة بس.
import {
  initializeApp, getAuth, signInAnonymously, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, GoogleAuthProvider, signInWithPopup,
  initializeFirestore, persistentLocalCache, persistentMultipleTabManager,
  doc, collection, setDoc as rawSetDoc, getDoc, getDocs, onSnapshot,
  query, where, serverTimestamp, getDocsFromCache, Timestamp, CACHE_SIZE_UNLIMITED
} from '../firebase-11.6.1-b3.bundle.js';

const firebaseConfig = {
  apiKey: 'AIzaSyDI1SJ696IKaAk8567rXWeyDRz6Yjv94Nc',
  authDomain: 'nabdi-crm.firebaseapp.com',
  projectId: 'nabdi-crm',
  storageBucket: 'nabdi-crm.firebasestorage.app',
  messagingSenderId: '538603219867',
  appId: '1:538603219867:web:c4989edca28c37f3e24f3e'
};
const APP_ID = 'cs-shifts-app';
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
let db;
try {
  db = initializeFirestore(app, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager(), cacheSizeBytes: CACHE_SIZE_UNLIMITED }) });
} catch (e) {
  db = initializeFirestore(app, {});
}
const col = name => collection(db, 'artifacts', APP_ID, 'public', 'data', name);
const setDoc = (ref, data, opts) => opts ? rawSetDoc(ref, { ...data, _syncAt: serverTimestamp() }, opts) : rawSetDoc(ref, { ...data, _syncAt: serverTimestamp() });

// ---------------- ثوابت مطابقة للنسخة الحالية ----------------
const STAGES = ['مكالمة هاتفية', 'مكالمة لم يتم الرد عليها', 'إرسال واتساب', 'عميل مهتم', 'الاتفاق على الاجتماع', 'ما قبل عقد الاجتماع', 'عقد اجتماع', 'الاتفاق على التعاقد', 'ما قبل كتابة العقد', 'إرسال العقد', 'توقيع العقد', 'تفعيل الجهة', 'الحصول على البيانات', 'إرسال البيانات إلى الدعم الفني', 'إرفاق رابط Google Drive بالبيانات'];
const LEGACY = { 'تم اتصال مكتمل': 'مكالمة هاتفية', 'مكالمة (تم الرد)': 'مكالمة هاتفية', 'مكالمة (لم يرد)': 'مكالمة لم يتم الرد عليها', 'مهتم': 'عميل مهتم', 'اجتماع محدد': 'الاتفاق على الاجتماع', 'الاجتماع تم': 'عقد اجتماع', 'اجتماع': 'عقد اجتماع', 'العرض أُرسل': 'الاتفاق على التعاقد', 'تفاوض': 'الاتفاق على التعاقد', 'العقد أُرسل': 'إرسال العقد', 'عقد (طرف نبضي)': 'إرسال العقد', 'عقد موقع': 'توقيع العقد', 'عقد (الطرفين)': 'توقيع العقد' };
const CITIES = ['الرياض', 'جدة', 'مكة المكرمة', 'المدينة المنورة', 'الدمام', 'الخبر', 'الأحساء / الهفوف', 'الطائف', 'تبوك', 'حائل', 'بريدة (القصيم)', 'عنيزة', 'خميس مشيط', 'أبها', 'جازان', 'نجران', 'الباحة', 'حفر الباطن', 'ينبع', 'القطيف', 'مدينة أخرى'];
const ENTITIES = ['عيادة', 'مركز طبي', 'صيدلية', 'متجر', 'مستشفى', 'معامل تحاليل/أشعة', 'منشأة أخرى'];
const CHANNELS = ['مكالمة هاتفية', 'واتساب', 'اجتماع مباشر', 'بريد إلكتروني'];
const PRIORITIES = ['عادية', 'متوسطة', 'عالية جداً'];
const STATUSES = ['مكتمل', 'قيد المعالجة', 'تصعيد للمدير'];
const normStage = v => { const n = LEGACY[v] || v; return STAGES.includes(n) ? n : STAGES[0]; };
const stageFor = (cat, cur) => (!cat || cat === 'تسجيل جهة جديدة') ? normStage(cur) : normStage(cat);
const normName = v => String(v || '').normalize('NFKC').replace(/[ً-ٰٟـ]/g, '').replace(/[أإآٱ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه').replace(/\s+/g, ' ').trim().toLowerCase();
const plain = v => String(v || '').normalize('NFKC').replace(/\s+/g, ' ').trim().toLowerCase();
const digits = v => String(v || '').replace(/\D/g, '');
function canonicalClientId(name, phone, city) {
  const source = `${plain(name)}|${String(city || '').normalize('NFKC').trim().toLowerCase()}|${digits(phone)}`;
  let hash = 2166136261;
  for (let i = 0; i < source.length; i += 1) { hash ^= source.charCodeAt(i); hash = Math.imul(hash, 16777619); }
  return `lead_entity_${(hash >>> 0).toString(36)}`;
}
const TZ = 'Africa/Cairo';
function cairoDate(d = new Date()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(d).filter(x => x.type !== 'literal').map(x => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}`;
}
const cairoTime = (d = new Date()) => new Intl.DateTimeFormat('ar-EG', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: true }).format(d);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const $ = id => document.getElementById(id);
const fillSelect = (id, list, first) => { $(id).innerHTML = (first ? `<option value="">${first}</option>` : '') + list.map(v => `<option value="${esc(v)}">${esc(v)}</option>`).join(''); };
function toast(msg, kind = '') { const t = $('toast'); t.textContent = msg; t.className = 'toast ' + kind; clearTimeout(toast.h); toast.h = setTimeout(() => t.classList.add('hidden'), 4500); }
const withTimeout = (p, ms, msg) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error(msg)), ms))]);

// ---------------- الحالة ----------------
const state = { employees: [], me: null, tasks: new Map(), clients: new Map(), tab: 'today', actionClient: null, synced: { tasks: false, clients: false } };

// ---------------- الدخول ----------------
const STAFF_EMAIL_DOMAIN = 'staff.nabdicrm.app';
const staffEmailFor = emp => `${String(emp?.id || '').toLowerCase().replace(/[^a-z0-9_.-]/g, '_')}@${STAFF_EMAIL_DOMAIN}`;
async function staffSignIn(emp, pin) {
  const email = staffEmailFor(emp), password = `nb-${String(pin).trim()}`;
  if (auth.currentUser && auth.currentUser.email === email) return;
  let cred;
  try { cred = await signInWithEmailAndPassword(auth, email, password); }
  catch (e) {
    if (!['auth/user-not-found', 'auth/invalid-credential', 'auth/invalid-login-credentials'].includes(e?.code)) throw e;
    cred = await createUserWithEmailAndPassword(auth, email, password);
  }
  try { await setDoc(doc(col('authAccounts'), emp.id), { empId: emp.id, name: emp.name || '', uid: cred.user.uid, email, lastLoginAt: Date.now() }, { merge: true }); } catch (e) {}
}
function authReady() {
  return new Promise(resolve => {
    let done = false;
    const stop = onAuthStateChanged(auth, user => { if (user && !done) { done = true; stop(); resolve(user); } else if (!user) signInAnonymously(auth).catch(() => {}); });
    if (auth.currentUser) return;
    signInAnonymously(auth).catch(err => { $('loginMsg').textContent = 'تعذر الاتصال: ' + err.message; $('loginMsg').className = 'msg err'; });
  });
}

async function loadEmployees() {
  let snap = null;
  try { snap = await getDocs(col('employees')); } catch (e) { try { snap = await getDocsFromCache(col('employees')); } catch (e2) { snap = null; } }
  const list = [];
  if (snap) snap.forEach(d => { const e = { ...d.data(), id: d.data().id || d.id }; if (!e.deletedAt && e.name) list.push(e); });
  list.sort((a, b) => String(a.name).localeCompare(String(b.name), 'ar'));
  state.employees = list;
  $('loginEmp').innerHTML = '<option value="">— اختار اسمك —</option>' + list.map(e => `<option value="${esc(e.id)}">${esc(e.name)}</option>`).join('');
}

async function login() {
  const emp = state.employees.find(e => e.id === $('loginEmp').value);
  const pin = $('loginPin').value.trim();
  const msg = $('loginMsg');
  if (!emp) { msg.textContent = 'اختار اسمك الأول'; msg.className = 'msg err'; return; }
  if (!String(emp.pin || '').trim()) { msg.textContent = 'مفيش رمز متسجل لحسابك — كلّم المدير'; msg.className = 'msg err'; return; }
  if (pin !== String(emp.pin).trim()) { msg.textContent = 'الرمز غلط'; msg.className = 'msg err'; return; }
  $('loginBtn').disabled = true;
  try { await staffSignIn(emp, pin); } catch (e) { console.warn('staff auth skipped', e?.code || e); }
  $('loginBtn').disabled = false;
  $('loginPin').value = '';
  sessionStorage.setItem('v2_emp', emp.id);
  startApp(emp);
}

const MANAGER_EMAIL = 'yousri.shams@gmail.com';
const MANAGER_ME = { id: 'manager', name: 'المدير العام', accessLevel: 'manager', department: '' };
async function googleLogin() {
  const msg = $('loginMsg');
  try {
    const cred = await signInWithPopup(auth, new GoogleAuthProvider());
    if (String(cred.user.email || '').toLowerCase() !== MANAGER_EMAIL) { await signOut(auth); msg.textContent = 'الحساب ده مش مصرح له كمدير'; msg.className = 'msg err'; return; }
    sessionStorage.setItem('v2_emp', 'manager');
    startApp(MANAGER_ME);
  } catch (e) { msg.textContent = 'تعذر الدخول بجوجل: ' + (e.code || e.message); msg.className = 'msg err'; }
}
async function logout() { sessionStorage.removeItem('v2_emp'); try { await signOut(auth); } catch (e) {} location.reload(); }

// ---------------- المزامنة ----------------
const WEEK = 7 * 24 * 3600 * 1000;
function owns(name, d) {
  const me = state.me;
  if (name === 'tasks') return (d.agentId && d.agentId === me.id) || normName(d.agent) === normName(me.name);
  return (d.addedById && d.addedById === me.id) || normName(d.addedBy) === normName(me.name) || (d._ownerRefs || []).some(o => o.id === me.id || normName(o.name) === normName(me.name));
}
function ownerQueries(name) {
  const me = state.me, base = col(name);
  const pairs = name === 'tasks' ? [['agentId', me.id], ['agent', me.name]] : [['addedById', me.id], ['addedBy', me.name]];
  return pairs.filter(p => p[1]).map(([k, v]) => query(base, where(k, '==', v)));
}
function putDoc(map, d) { const data = d.data(); map.set(d.id, { ...data, id: data.id || d.id, _docId: d.id }); }
function syncMsg() {
  const bar = $('syncBar');
  if (bar.classList.contains('err')) return;
  bar.textContent = (state.synced.tasks && state.synced.clients) ? `متزامن — ${state.clients.size} عميل، ${state.tasks.size} إجراء` : 'جاري تحميل بياناتك…';
}
async function syncCollection(name) {
  const map = state[name];
  const qs = ownerQueries(name);
  for (const q of qs) { try { (await getDocsFromCache(q)).forEach(d => putDoc(map, d)); } catch (e) { /* مفيش نسخة على الجهاز */ } }
  render();
  const metaKey = `v2meta_${name}_${state.me.id}`;
  let meta = null; try { meta = JSON.parse(localStorage.getItem(metaKey) || 'null'); } catch (e) { meta = null; }
  let marker = meta?.marker || 0;
  if (!meta || !map.size || Date.now() - (meta.fullAt || 0) > WEEK) {
    for (const q of qs) {
      const snap = await getDocs(q);
      snap.forEach(d => { putDoc(map, d); const t = d.get('_syncAt'); if (t?.toMillis) marker = Math.max(marker, t.toMillis()); });
    }
    if (!marker) marker = Date.now() - 3600 * 1000;
    meta = { marker, fullAt: Date.now() };
    localStorage.setItem(metaKey, JSON.stringify(meta));
  }
  state.synced[name] = true; syncMsg(); render();
  // التغييرات الجديدة بس (من كل الموظفين) ونحتفظ باللي يخصني
  onSnapshot(query(col(name), where('_syncAt', '>', Timestamp.fromMillis(Math.max(0, marker - 15 * 60 * 1000)))), snap => {
    let changed = false;
    snap.docChanges().forEach(ch => {
      if (ch.type === 'removed') return;
      const data = ch.doc.data();
      if (owns(name, data)) { putDoc(map, ch.doc); changed = true; } else if (map.has(ch.doc.id)) { map.delete(ch.doc.id); changed = true; }
      const t = data._syncAt; if (t?.toMillis) marker = Math.max(marker, t.toMillis());
    });
    if (!snap.metadata.fromCache) localStorage.setItem(metaKey, JSON.stringify({ marker, fullAt: meta.fullAt }));
    $('syncBar').classList.remove('err'); syncMsg();
    if (changed) render();
  }, err => { $('syncBar').textContent = 'انقطع الاتصال بقاعدة البيانات — الحفظ ممكن يتأخر: ' + err.message; $('syncBar').classList.add('err'); });
}

// ---------------- المنطق ----------------
const liveTasks = () => [...state.tasks.values()].filter(t => !t.deletedAt && t.taskType !== 'internal' && t.category !== 'مهمة داخلية');
const liveClients = () => [...state.clients.values()].filter(c => !c.deletedAt);
function clientKeyOfTask(t) { return t.clientId ? 'id:' + t.clientId : 'n:' + plain(t.customer); }
function tasksOfClient(c) {
  const ids = new Set([c.id, c._docId, ...(c._duplicateIds || [])].filter(Boolean).map(String));
  return liveTasks().filter(t => t.clientId ? ids.has(String(t.clientId)) : (plain(t.customer) && plain(t.customer) === plain(c.name))).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
}
function latestByClient() {
  const m = new Map();
  for (const t of liveTasks()) {
    if (t.affectsFollowUp === false) continue;
    const k = clientKeyOfTask(t); const cur = m.get(k);
    if (!cur || (t.createdAt || 0) > (cur.createdAt || 0)) m.set(k, t);
  }
  return m;
}
function findClientForTask(t) {
  if (t.clientId) { for (const c of state.clients.values()) if (c.id === t.clientId || c._docId === t.clientId) return c; }
  const n = plain(t.customer); for (const c of state.clients.values()) if (plain(c.name) === n) return c;
  return null;
}

// ---------------- العرض ----------------
let renderQueued = false;
function render() { if (renderQueued) return; renderQueued = true; requestAnimationFrame(() => { renderQueued = false; if (!state.me) return; if (state.tab === 'today') renderToday(); else if (state.tab === 'clients') renderClients(); else renderLog(); }); }

function itemHtml(t, extra = '') {
  return `<div class="item" data-task="${esc(t.id)}"><div class="t">${esc(t.customer || 'بدون اسم')} <span class="tag">${esc(t.category || '')}</span></div><div class="s">${esc(t.phone || '')} · ${esc(t.city || '')} ${extra}</div>${t.notes ? `<div class="s">${esc(t.notes).slice(0, 120)}</div>` : ''}</div>`;
}
function renderToday() {
  const today = cairoDate();
  const todays = liveTasks().filter(t => t.date === today);
  const k = (label, v) => `<div class="kpi"><b>${v}</b><span>${label}</span></div>`;
  const newClients = liveClients().filter(c => c.createdAt && cairoDate(new Date(c.createdAt)) === today).length;
  $('kpis').innerHTML = k('إجراءات النهارده', todays.length) + k('مكالمات تم الرد', todays.filter(t => t.category === 'مكالمة هاتفية').length) + k('لم يرد', todays.filter(t => t.category === 'مكالمة لم يتم الرد عليها').length) + k('واتساب', todays.filter(t => t.category === 'إرسال واتساب').length) + k('اجتماعات', todays.filter(t => t.category === 'عقد اجتماع').length) + k('عملاء جدد', newClients);
  const late = [], due = [], next = [], noAns = [];
  const in14 = cairoDate(new Date(Date.now() + 14 * 864e5));
  for (const t of latestByClient().values()) {
    const d = t.nextFollowUpDate;
    if (d) { if (d < today) late.push(t); else if (d === today) due.push(t); else if (d <= in14) next.push(t); }
    else if (t.category === 'مكالمة لم يتم الرد عليها') noAns.push(t);
  }
  const by = f => (a, b) => String(f(a)).localeCompare(String(f(b)));
  late.sort(by(t => t.nextFollowUpDate)); due.sort(by(t => t.nextFollowUpTime || '99')); next.sort(by(t => t.nextFollowUpDate)); noAns.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  const fill = (id, cid, arr, f) => { $(cid).textContent = arr.length; $(id).innerHTML = arr.length ? arr.slice(0, 200).map(t => itemHtml(t, f(t))).join('') : '<div class="empty">مفيش</div>'; };
  fill('listLate', 'cLate', late, t => `· كان المفروض ${esc(t.nextFollowUpDate)}`);
  fill('listToday', 'cToday', due, t => t.nextFollowUpTime ? `· الساعة ${esc(t.nextFollowUpTime)}` : '');
  fill('listNoAnswer', 'cNoAnswer', noAns, t => `· آخر محاولة ${esc(t.date || '')}`);
  fill('listNext', 'cNext', next, t => `· ${esc(t.nextFollowUpDate)} ${esc(t.nextFollowUpTime || '')}`);
}
function lastActionAt(c) { const t = tasksOfClient(c)[0]; return t ? (t.createdAt || 0) : (c.updatedAt || c.createdAt || 0); }
function renderClients() {
  const q = plain($('clientSearch').value), qd = digits($('clientSearch').value);
  let list = liveClients();
  if (q) list = list.filter(c => plain(c.name).includes(q) || (qd.length >= 3 && digits(c.phone).includes(qd)));
  list.sort((a, b) => (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0));
  $('clientCount').textContent = `${list.length} عميل`;
  $('clientList').innerHTML = list.length ? list.slice(0, 300).map(c => `<div class="item" data-client="${esc(c._docId)}"><div class="t">${esc(c.name)} <span class="tag">${esc(normStage(c.stage))}</span></div><div class="s">${esc(c.phone || '')} · ${esc(c.city || '')} · ${esc(c.entityType || '')}</div>${c.statusNote ? `<div class="s">${esc(c.statusNote)}</div>` : ''}</div>`).join('') : '<div class="empty">مفيش عملاء</div>';
}
function renderLog() {
  if (!$('logDate').value) $('logDate').value = cairoDate();
  const d = $('logDate').value;
  const list = liveTasks().filter(t => t.date === d).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  $('logList').innerHTML = list.length ? list.map(t => itemHtml(t, `· ${esc(t.time || '')}`)).join('') : '<div class="empty">مفيش إجراءات في اليوم ده</div>';
}

function openClient(c) {
  if (!c) return;
  const ts = tasksOfClient(c);
  const ph = digits(c.phone);
  const wa = ph ? `https://wa.me/${ph.startsWith('0') ? '966' + ph.slice(1) : ph}` : '';
  $('clientBody').innerHTML = `<h2>${esc(c.name)}</h2>
    <div class="muted">${esc(c.entityType || '')} · ${esc(c.specialty || '')} · ${esc(c.city || '')}</div>
    <p><span class="tag">${esc(normStage(c.stage))}</span> ${c.statusNote ? esc(c.statusNote) : ''}</p>
    <p>${c.phone ? `<a href="tel:${esc(c.phone)}" class="btn line sm"><i class="fa-solid fa-phone"></i> ${esc(c.phone)}</a>` : ''} ${wa ? `<a href="${esc(wa)}" target="_blank" class="btn line sm"><i class="fa-brands fa-whatsapp"></i> واتساب</a>` : ''}
    <button class="btn primary sm" id="clientAction">تسجيل إجراء</button></p>
    <h3>سجل الإجراءات (${ts.length})</h3>
    <div class="list timeline">${ts.length ? ts.map(t => `<div class="item"><div class="t">${esc(t.category)} <span class="tag">${esc(t.date || '')} ${esc(t.time || '')}</span></div>${t.notes ? `<div class="s">${esc(t.notes)}</div>` : ''}${t.nextFollowUpDate ? `<div class="s">المتابعة الجاية: ${esc(t.nextFollowUpDate)} ${esc(t.nextFollowUpTime || '')}</div>` : ''}<div class="s">${esc(t.agent || '')}</div></div>`).join('') : '<div class="empty">مفيش إجراءات لسه</div>'}</div>`;
  $('clientModal').classList.remove('hidden');
  $('clientAction').onclick = () => { $('clientModal').classList.add('hidden'); openAction(c); };
}

// ---------------- تسجيل إجراء ----------------
function setChosen(c) {
  state.actionClient = c;
  $('chosenClient').classList.toggle('hidden', !c);
  $('newClientFields').classList.toggle('hidden', Boolean(c));
  $('clientPick').classList.toggle('hidden', Boolean(c));
  if (c) $('chosenClient').innerHTML = `<span>${esc(c.name)} — ${esc(c.phone || '')} <span class="tag">${esc(normStage(c.stage))}</span></span><button class="btn line sm" id="unchoose">تغيير</button>`;
  if (c) $('unchoose').onclick = () => setChosen(null);
}
function openAction(client = null) {
  ['aSearch', 'aName', 'aPhone', 'aSpecialty', 'aNotes', 'aStatusNote', 'aNextDate', 'aNextTime'].forEach(id => { $(id).value = ''; });
  $('aCity').value = CITIES[0]; $('aEntity').value = ENTITIES[0]; $('aCategory').value = STAGES[0]; $('aChannel').value = CHANNELS[0]; $('aStatus').value = STATUSES[0]; $('aPriority').value = PRIORITIES[0];
  $('aAlsoWa').checked = false; $('aMatches').innerHTML = ''; $('aMsg').textContent = '';
  setChosen(client);
  $('actionModal').classList.remove('hidden');
}
function searchMatches() {
  const q = plain($('aSearch').value), qd = digits($('aSearch').value);
  if (q.length < 2) { $('aMatches').innerHTML = ''; return; }
  const list = liveClients().filter(c => plain(c.name).includes(q) || (qd.length >= 3 && digits(c.phone).includes(qd))).slice(0, 8);
  $('aMatches').innerHTML = list.map(c => `<div class="item" data-pick="${esc(c._docId)}"><div class="t">${esc(c.name)}</div><div class="s">${esc(c.phone || '')} · ${esc(c.city || '')}</div></div>`).join('') || '<div class="empty">مش لاقي عميل بالاسم ده عندك — اكتب بياناته تحت كعميل جديد</div>';
}
function phoneVariants(p) {
  const d = digits(p); if (!d) return [];
  const last9 = d.slice(-9);
  return [...new Set([String(p).trim(), d, '0' + last9, '966' + last9, '+966' + last9, '00966' + last9].filter(Boolean))].slice(0, 10);
}
async function findExistingClient(name, phone) {
  const found = [];
  const vs = phoneVariants(phone);
  if (vs.length) { const s = await getDocs(query(col('clients'), where('phone', 'in', vs))); s.forEach(d => found.push({ ...d.data(), id: d.data().id || d.id, _docId: d.id })); }
  const s2 = await getDocs(query(col('clients'), where('name', '==', String(name).trim()))); s2.forEach(d => found.push({ ...d.data(), id: d.data().id || d.id, _docId: d.id }));
  return found.filter(c => !c.deletedAt);
}
async function saveAction() {
  const btn = $('aSave'), msg = $('aMsg');
  const me = state.me, now = Date.now(), today = cairoDate();
  const category = $('aCategory').value, notes = $('aNotes').value.trim(), statusNote = $('aStatusNote').value.trim();
  const nextDate = $('aNextDate').value, nextTime = $('aNextTime').value;
  msg.className = 'msg err';
  if (nextTime && !nextDate) { msg.textContent = 'اختار تاريخ المتابعة الأول'; return; }
  if (nextDate && nextDate < today) { msg.textContent = 'تاريخ المتابعة مينفعش يبقى قبل النهارده'; return; }
  btn.disabled = true; btn.textContent = 'جاري الحفظ…'; msg.textContent = '';
  try {
    let client = state.actionClient ? { ...state.actionClient } : null;
    let isNew = false;
    if (!client) {
      const name = $('aName').value.trim(), phone = $('aPhone').value.trim();
      if (!name || digits(phone).length < 8) throw new Error('اكتب اسم الجهة ورقم جوال صحيح، أو اختار عميل من عملائك');
      const existing = await withTimeout(findExistingClient(name, phone), 10000, 'الاتصال بطيء — جرّب تاني');
      const mine = existing.find(c => owns('clients', c));
      const other = existing.find(c => !owns('clients', c));
      if (mine) client = { ...mine };
      else if (other) throw new Error(`العميل ده متسجل قبل كده باسم ${other.addedBy || 'موظف تاني'} — مينفعش تسجله أو تعمل عليه إجراء.`);
      else {
        isNew = true;
        const city = $('aCity').value;
        client = { id: canonicalClientId(name, phone, city), name, phone, contactPerson: '', city, entityType: $('aEntity').value, specialty: $('aSpecialty').value.trim(), stage: stageFor(category, STAGES[0]), statusNote, statusUpdatedAt: statusNote ? now : null, statusUpdatedBy: statusNote ? me.name : '', addedBy: me.name, addedById: me.id, createdAt: now, registeredAt: now, docs: {} };
      }
    }
    const taskId = 'task_' + now;
    const task = { id: taskId, clientId: client.id, time: cairoTime(), date: today, shift: me.shift || '', agent: me.name, agentId: me.id, customer: client.name, phone: client.phone || '', entityType: client.entityType || '', specialty: client.specialty || '', city: client.city || '', category, channel: $('aChannel').value, priority: $('aPriority').value, status: $('aStatus').value, notes, clientStatusNote: statusNote, nextFollowUpDate: nextDate, nextFollowUpTime: nextTime, createdAt: now, updatedAt: now, source: 'v2' };
    // الإجراء الأول — ده الأهم
    await withTimeout(setDoc(doc(col('tasks'), taskId), task), 12000, 'الحفظ اتأخر — اتأكد من النت وجرّب تاني. الإجراء ما اتحفظش.');
    state.tasks.set(taskId, { ...task, _docId: taskId });
    // تحديث مرحلة العميل
    const newStage = stageFor(category, client.stage);
    const history = Array.isArray(client.stageHistory) ? client.stageHistory.slice() : [];
    if (!history.some(h => normStage(typeof h === 'string' ? h : h?.stage) === newStage)) history.push({ stage: newStage, at: new Date(now).toISOString(), taskId });
    const clientUpdate = isNew ? { ...client, stage: newStage, stageHistory: history, stageUpdatedAt: new Date(now).toISOString(), updatedAt: now }
      : { id: client.id, stage: newStage, stageHistory: history, stageUpdatedAt: new Date(now).toISOString(), updatedAt: now, ...(statusNote && statusNote !== String(client.statusNote || '').trim() ? { statusNote, statusUpdatedAt: now, statusUpdatedBy: me.name } : {}) };
    const clientDocId = client._docId || client.id;
    let clientOk = true;
    try { await withTimeout(setDoc(doc(col('clients'), clientDocId), clientUpdate, { merge: true }), 12000, 'timeout'); state.clients.set(clientDocId, { ...client, ...clientUpdate, _docId: clientDocId }); } catch (e) { clientOk = false; }
    if ($('aAlsoWa').checked && category === 'مكالمة هاتفية') {
      const wid = `task_${now + 1}_wa_${Math.random().toString(36).slice(2, 7)}`;
      const wa = { ...task, id: wid, createdAt: now + 1, updatedAt: now + 1, category: 'إرسال واتساب', channel: 'واتساب', status: 'مكتمل', notes: `واتساب إضافي بعد المكالمة — ${notes}`, clientStatusNote: '', affectsFunnel: false, affectsFollowUp: false, relatedTaskId: taskId, nextFollowUpDate: '', nextFollowUpTime: '' };
      try { await withTimeout(setDoc(doc(col('tasks'), wid), wa), 12000, 'timeout'); state.tasks.set(wid, { ...wa, _docId: wid }); } catch (e) { toast('المكالمة اتحفظت، بس الواتساب الإضافي ما اتحفظش — سجّله تاني', 'err'); }
    }
    $('actionModal').classList.add('hidden');
    toast(clientOk ? '✓ الإجراء اتحفظ' : '✓ الإجراء اتحفظ، بس مرحلة العميل ما اتحدثتش — هتتحدث مع الإجراء الجاي', 'ok');
    render();
  } catch (e) {
    msg.textContent = e.message || 'الحفظ فشل — البيانات لسه في الفورم، جرّب تاني';
  } finally { btn.disabled = false; btn.textContent = 'حفظ الإجراء'; }
}


// ---------------- الحضور والانصراف (نفس شكل سجلات النسخة الحالية) ----------------
const ATT_LABEL = { working: 'على رأس العمل', break: 'في استراحة', checked_out: 'تم الانصراف', not_started: 'لم يبدأ الدوام' };
let attRecord = null;
const attId = date => `attendance_${String(state.me.id || '').replace(/[^a-zA-Z0-9_-]/g, '_')}_${date}`;
async function loadAttendance() {
  try { const snap = await getDoc(doc(col('attendance'), attId(cairoDate()))); attRecord = snap.exists() ? snap.data() : null; } catch (e) { attRecord = attRecord || null; }
  renderAttendance();
}
function attMetrics(r, now = Date.now()) {
  if (!r) return { work: 0, brk: 0 };
  let sessions = Array.isArray(r.sessions) ? r.sessions : []; if (!sessions.length && r.checkInAt) sessions = [{ checkInAt: r.checkInAt, checkOutAt: r.checkOutAt || null }];
  const limit = 6 * 3600 * 1000;
  const s = sessions.reduce((t, x) => { const st = Number(x?.checkInAt || 0); const le = Number(x?.checkOutAt || (r.status === 'checked_out' ? r.checkOutAt : now)); const en = x?.checkOutAt ? le : Math.min(le, st + limit); return t + (st && en >= st ? en - st : 0); }, 0);
  const b = (r.breaks || []).reduce((t, x) => { const st = Number(x?.startAt || 0); const en = Number(x?.endAt || (r.status === 'break' ? now : st)); return t + (st && en >= st ? en - st : 0); }, 0);
  return { work: Math.min(limit, Math.max(0, s - b)), brk: Math.min(limit, b) };
}
const dur = ms => { const m = Math.floor(ms / 60000), h = Math.floor(m / 60); return h ? `${h} س ${m % 60} د` : `${m % 60} د`; };
function renderAttendance() {
  const st = attRecord?.status || 'not_started';
  const btn = $('attBtn'); btn.className = 'btn att sm ' + st; btn.textContent = st === 'not_started' ? 'تسجيل الحضور' : ATT_LABEL[st];
  const m = attMetrics(attRecord);
  $('attInfo').innerHTML = `الحالة: <b>${ATT_LABEL[st]}</b> · ساعات الشغل: <b>${dur(m.work)}</b> · الاستراحة: <b>${dur(m.brk)}</b>${attRecord?.checkInAt ? ` · الحضور: ${esc(cairoTime(new Date(attRecord.checkInAt)))}` : ''}`;
  $('attIn').disabled = st === 'working' || st === 'break';
  $('attBreak').disabled = st !== 'working';
  $('attBack').disabled = st !== 'break';
  $('attOut').disabled = !(st === 'working' || st === 'break');
}
async function attAction(kind) {
  const msg = $('attMsg'); msg.className = 'msg err'; msg.textContent = '';
  const buttons = ['attIn', 'attBreak', 'attBack', 'attOut'].map($); buttons.forEach(b => { b.disabled = true; });
  try {
    const today = cairoDate(), now = Date.now(), me = state.me;
    const ref = doc(col('attendance'), attId(today));
    const snap = await withTimeout(getDoc(ref), 10000, 'الاتصال بطيء — جرّب تاني');
    let r = snap.exists() ? snap.data() : null;
    if (kind === 'in') {
      if (r && (r.status === 'working' || r.status === 'break')) throw new Error('الحضور متسجل بالفعل');
      r = r || { id: attId(today), employeeId: me.id, employeeName: me.name, department: me.department || '', shift: me.shift || 'غير محدد', date: today, sessions: [], breaks: [], createdAt: now };
      r.sessions = Array.isArray(r.sessions) ? r.sessions : []; r.breaks = Array.isArray(r.breaks) ? r.breaks : [];
      r.sessions.push({ checkInAt: now, checkOutAt: null }); r.checkInAt = r.checkInAt || now; r.checkOutAt = null; r.status = 'working';
    } else if (kind === 'break') {
      if (!r || r.status !== 'working') throw new Error('سجّل الحضور الأول');
      r.breaks = Array.isArray(r.breaks) ? r.breaks : []; r.breaks.push({ startAt: now, endAt: null }); r.status = 'break';
    } else if (kind === 'back') {
      if (!r || r.status !== 'break') throw new Error('مفيش استراحة مفتوحة');
      const ob = [...(r.breaks || [])].reverse().find(x => x && !x.endAt); if (ob) ob.endAt = now; r.status = 'working';
    } else if (kind === 'out') {
      if (!r || !['working', 'break'].includes(r.status)) throw new Error('مفيش دوام مفتوح');
      const ob = [...(r.breaks || [])].reverse().find(x => x && !x.endAt); if (ob) ob.endAt = now;
      const os = [...(r.sessions || [])].reverse().find(x => x && !x.checkOutAt); if (os) os.checkOutAt = now;
      r.checkOutAt = now; r.status = 'checked_out';
    }
    r.lastActivityAt = now; r.updatedAt = now; r.employeeName = me.name; r.shift = me.shift || r.shift || 'غير محدد';
    await withTimeout(setDoc(ref, JSON.parse(JSON.stringify(r)), { merge: true }), 12000, 'الحفظ اتأخر — ما اتسجلش، جرّب تاني');
    attRecord = r; msg.className = 'msg ok'; msg.textContent = '✓ اتسجل';
    toast({ in: '✓ اتسجل الحضور', break: '✓ بداية الاستراحة', back: '✓ رجعت من الاستراحة', out: '✓ اتسجل الانصراف' }[kind], 'ok');
  } catch (e) { msg.textContent = e.message; }
  finally { renderAttendance(); }
}
setInterval(() => { if (state.me && attRecord) renderAttendance(); }, 60000);


// ---------------- لوحة الفريق (مدير / مشرف) ----------------
const accessOf = e => e?.accessLevel === 'manager' ? 'manager' : ((e?.accessLevel === 'supervisor' || e?.isSupervisor === true) ? 'supervisor' : 'employee');
let teamUnsubs = [];
function teamEmployees() {
  const me = state.me, lvl = accessOf(me);
  const dept = $('teamDept').value;
  return state.employees.filter(e => accessOf(e) !== 'manager' && (lvl === 'manager' ? (!dept || e.department === dept) : e.department === me.department));
}
function startTeam() {
  teamUnsubs.forEach(u => u()); teamUnsubs = [];
  const d = $('teamDate').value || cairoDate();
  const data = { tasks: new Map(), att: new Map() };
  const draw = () => renderTeam(data, d);
  teamUnsubs.push(onSnapshot(query(col('tasks'), where('date', '==', d)), snap => { data.tasks.clear(); snap.forEach(x => { const t = x.data(); if (!t.deletedAt) data.tasks.set(x.id, t); }); draw(); }, err => { $('teamNote').textContent = 'تعذر التحميل: ' + err.message; }));
  teamUnsubs.push(onSnapshot(query(col('attendance'), where('date', '==', d)), snap => { data.att.clear(); snap.forEach(x => data.att.set(x.id, x.data())); draw(); }, () => {}));
}
function renderTeam(data, d) {
  const emps = teamEmployees();
  const tasks = [...data.tasks.values()].filter(t => t.taskType !== 'internal' && t.category !== 'مهمة داخلية');
  const mine = e => tasks.filter(t => (t.agentId && t.agentId === e.id) || normName(t.agent) === normName(e.name));
  const attOf = e => [...data.att.values()].find(r => r.employeeId === e.id || normName(r.employeeName) === normName(e.name));
  const rows = emps.map(e => {
    const ts = mine(e), a = attOf(e), st = a?.status || 'not_started', m = attMetrics(a);
    const c = cat => ts.filter(t => t.category === cat).length;
    return { e, ts, st, m, calls: c('مكالمة هاتفية'), na: c('مكالمة لم يتم الرد عليها'), wa: c('إرسال واتساب'), meet: c('عقد اجتماع'), contract: c('إرسال العقد') + c('توقيع العقد') };
  }).sort((x, y) => y.ts.length - x.ts.length);
  const tot = k => rows.reduce((s, r) => s + (typeof r[k] === 'number' ? r[k] : r[k].length), 0);
  $('teamNote').textContent = `يوم ${d} — ${rows.length} موظف — ${tot('ts')} إجراء`;
  $('teamTable').innerHTML = '<tr><th>الموظف</th><th>الحضور</th><th>ساعات</th><th>إجراءات</th><th>مكالمات رد</th><th>لم يرد</th><th>واتساب</th><th>اجتماعات</th><th>عقود</th></tr>' +
    rows.map(r => `<tr><td><b>${esc(r.e.name)}</b><div class="small muted">${esc(r.e.department || '')} · ${esc(r.e.shift || '')}</div></td><td><span class="st ${r.st}">${ATT_LABEL[r.st]}</span></td><td>${dur(r.m.work)}</td><td><b>${r.ts.length}</b></td><td>${r.calls}</td><td>${r.na}</td><td>${r.wa}</td><td>${r.meet}</td><td>${r.contract}</td></tr>`).join('') +
    `<tr><th>الإجمالي</th><th></th><th></th><th>${tot('ts')}</th><th>${tot('calls')}</th><th>${tot('na')}</th><th>${tot('wa')}</th><th>${tot('meet')}</th><th>${tot('contract')}</th></tr>`;
}

// ---------------- التشغيل ----------------
function startApp(emp) {
  state.me = emp;
  $('loginView').classList.add('hidden'); $('appView').classList.remove('hidden');
  $('whoName').textContent = emp.name;
  const lvl = accessOf(emp);
  if (lvl !== 'employee') {
    $('teamTabBtn').classList.remove('hidden');
    const depts = [...new Set(state.employees.map(e => e.department).filter(Boolean))];
    $('teamDept').innerHTML = lvl === 'manager' ? '<option value="">كل الأقسام</option>' + depts.map(d => `<option>${esc(d)}</option>`).join('') : `<option>${esc(emp.department || '')}</option>`;
    $('teamDate').value = cairoDate();
  }
  if (emp.id === 'manager') {
    document.querySelectorAll('.tab').forEach(b => { if (b.dataset.tab !== 'team') b.classList.add('hidden'); });
    $('attBtn').classList.add('hidden'); $('syncBar').textContent = 'دخول المدير';
    setTab('team');
    return;
  }
  syncMsg();
  loadAttendance();
  syncCollection('clients').catch(e => { $('syncBar').textContent = 'تعذر تحميل العملاء: ' + e.message; $('syncBar').classList.add('err'); });
  syncCollection('tasks').catch(e => { $('syncBar').textContent = 'تعذر تحميل الإجراءات: ' + e.message; $('syncBar').classList.add('err'); });
}
function setTab(tab) {
  state.tab = tab;
  document.querySelectorAll('.tab').forEach(b => b.classList.toggle('on', b.dataset.tab === tab));
  ['today', 'clients', 'log', 'team'].forEach(t => $('tab-' + t).classList.toggle('hidden', t !== tab));
  if (tab === 'team') startTeam(); else { teamUnsubs.forEach(u => u()); teamUnsubs = []; }
  render();
}

fillSelect('aCity', CITIES); fillSelect('aEntity', ENTITIES); fillSelect('aCategory', STAGES); fillSelect('aChannel', CHANNELS); fillSelect('aStatus', STATUSES); fillSelect('aPriority', PRIORITIES);
$('loginBtn').onclick = login;
$('googleBtn').onclick = googleLogin;
$('loginPin').addEventListener('keydown', e => { if (e.key === 'Enter') login(); });
$('logoutBtn').onclick = logout;
document.querySelectorAll('.tab').forEach(b => { b.onclick = () => setTab(b.dataset.tab); });
document.querySelectorAll('[data-close]').forEach(b => { b.onclick = () => $(b.dataset.close).classList.add('hidden'); });
$('newActionBtn').onclick = () => openAction(null);
$('attBtn').onclick = () => { $('attMsg').textContent = ''; renderAttendance(); $('attModal').classList.remove('hidden'); loadAttendance(); };
$('attIn').onclick = () => attAction('in');
$('attBreak').onclick = () => attAction('break');
$('attBack').onclick = () => attAction('back');
$('attOut').onclick = () => { if (confirm('تأكيد تسجيل الانصراف وإنهاء الدوام؟')) attAction('out'); };
$('aSearch').addEventListener('input', searchMatches);
$('aSave').onclick = saveAction;
$('clientSearch').addEventListener('input', render);
$('logDate').addEventListener('change', render);
$('teamDate').addEventListener('change', startTeam);
$('teamDept').addEventListener('change', startTeam);
document.addEventListener('click', e => {
  const pick = e.target.closest('[data-pick]'); if (pick) { setChosen(state.clients.get(pick.dataset.pick)); return; }
  const ci = e.target.closest('[data-client]'); if (ci) { openClient(state.clients.get(ci.dataset.client)); return; }
  const ti = e.target.closest('[data-task]'); if (ti) { const t = state.tasks.get(ti.dataset.task) || [...state.tasks.values()].find(x => x.id === ti.dataset.task); const c = t && findClientForTask(t); if (c) openClient(c); else if (t) openAction(null); }
});

(async () => {
  await authReady();
  await loadEmployees();
  const saved = sessionStorage.getItem('v2_emp');
  if (saved === 'manager' && String(auth.currentUser?.email || '').toLowerCase() === MANAGER_EMAIL) { startApp(MANAGER_ME); return; }
  const emp = saved && state.employees.find(e => e.id === saved);
  if (emp) startApp(emp);
})();



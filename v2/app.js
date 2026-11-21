// نبضي CRM — النسخة 2 (تجريبية): شاشة المبيعات السريعة
// بتشتغل على نفس قاعدة البيانات ونفس شكل البيانات بتاع النسخة الحالية،
// بس كل موظف بيسحب عملاءه وإجراءاته هو بس، وبعدها التغييرات الجديدة بس.
import {
  initializeApp, getAuth, signInAnonymously, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, GoogleAuthProvider, signInWithPopup,
  initializeFirestore, persistentLocalCache, persistentMultipleTabManager,
  doc, collection, setDoc as rawSetDoc, getDoc, getDocs, onSnapshot,
  query, where, serverTimestamp, getDocsFromCache, Timestamp, CACHE_SIZE_UNLIMITED,
  updatePassword, getStorage, storageRef, uploadBytesResumable, getDownloadURL
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
    signInAnonymously(auth).catch(err => { $('loginMsg').textContent = 'تعذّر الاتصال: ' + err.message; $('loginMsg').className = 'msg err'; });
  });
}

async function loadEmployees() {
  let snap = null;
  try { snap = await getDocs(col('employees')); } catch (e) { try { snap = await getDocsFromCache(col('employees')); } catch (e2) { snap = null; } }
  const list = [];
  if (snap) snap.forEach(d => { const e = { ...d.data(), id: d.data().id || d.id, _docId: d.id }; if (!e.deletedAt && e.name) list.push(e); });
  list.sort((a, b) => String(a.name).localeCompare(String(b.name), 'ar'));
  state.employees = list;
  $('loginEmp').innerHTML = '<option value="">— اختر اسمك —</option>' + list.map(e => `<option value="${esc(e.id)}">${esc(e.name)}</option>`).join('');
}

async function login() {
  const emp = state.employees.find(e => e.id === $('loginEmp').value);
  const pin = $('loginPin').value.trim();
  const msg = $('loginMsg');
  if (!emp) { msg.textContent = 'يرجى اختيار اسمك أولًا'; msg.className = 'msg err'; return; }
  if (!String(emp.pin || '').trim()) { msg.textContent = 'لا يوجد رمز دخول مسجّل لحسابك، يرجى التواصل مع الإدارة'; msg.className = 'msg err'; return; }
  if (pin !== String(emp.pin).trim()) { msg.textContent = 'رمز الدخول غير صحيح'; msg.className = 'msg err'; return; }
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
    if (String(cred.user.email || '').toLowerCase() !== MANAGER_EMAIL) { await signOut(auth); msg.textContent = 'هذا الحساب غير مصرّح له بدخول الإدارة'; msg.className = 'msg err'; return; }
    sessionStorage.setItem('v2_emp', 'manager');
    startApp(MANAGER_ME);
  } catch (e) { msg.textContent = 'تعذّر الدخول بحساب Google: ' + (e.code || e.message); msg.className = 'msg err'; }
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
  bar.textContent = (state.synced.tasks && state.synced.clients) ? `تمت المزامنة — ${state.clients.size} عميل، ${state.tasks.size} إجراء` : 'جارٍ تحميل بياناتك…';
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
  }, err => { $('syncBar').textContent = 'انقطع الاتصال بقاعدة البيانات، وقد يتأخر الحفظ: ' + err.message; $('syncBar').classList.add('err'); });
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
  $('kpis').innerHTML = k('إجراءات اليوم', todays.length) + k('مكالمات تم الرد عليها', todays.filter(t => t.category === 'مكالمة هاتفية').length) + k('لم يتم الرد', todays.filter(t => t.category === 'مكالمة لم يتم الرد عليها').length) + k('واتساب', todays.filter(t => t.category === 'إرسال واتساب').length) + k('اجتماعات', todays.filter(t => t.category === 'عقد اجتماع').length) + k('عملاء جدد', newClients);
  const late = [], due = [], next = [], noAns = [];
  const in14 = cairoDate(new Date(Date.now() + 14 * 864e5));
  for (const t of latestByClient().values()) {
    const d = t.nextFollowUpDate;
    if (d) { if (d < today) late.push(t); else if (d === today) due.push(t); else if (d <= in14) next.push(t); }
    else if (t.category === 'مكالمة لم يتم الرد عليها') noAns.push(t);
  }
  const by = f => (a, b) => String(f(a)).localeCompare(String(f(b)));
  late.sort(by(t => t.nextFollowUpDate)); due.sort(by(t => t.nextFollowUpTime || '99')); next.sort(by(t => t.nextFollowUpDate)); noAns.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  const fill = (id, cid, arr, f) => { $(cid).textContent = arr.length; $(id).innerHTML = arr.length ? arr.slice(0, 200).map(t => itemHtml(t, f(t))).join('') : '<div class="empty">لا يوجد</div>'; };
  fill('listLate', 'cLate', late, t => `· كان موعدها ${esc(t.nextFollowUpDate)}`);
  fill('listToday', 'cToday', due, t => t.nextFollowUpTime ? `· الساعة ${esc(t.nextFollowUpTime)}` : '');
  fill('listNoAnswer', 'cNoAnswer', noAns, t => `· آخر محاولة ${esc(t.date || '')}`);
  renderMyItasks(); updateBell();
  fill('listNext', 'cNext', next, t => `· ${esc(t.nextFollowUpDate)} ${esc(t.nextFollowUpTime || '')}`);
}
function lastActionAt(c) { const t = tasksOfClient(c)[0]; return t ? (t.createdAt || 0) : (c.updatedAt || c.createdAt || 0); }
function renderClients() {
  const q = plain($('clientSearch').value), qd = digits($('clientSearch').value);
  let list = liveClients();
  const per = $('cPeriod').value;
  if (per !== 'all') {
    const t = cairoDate(); let from = t, to = t;
    if (per === '7') from = addDays(t, -6);
    else if (per === 'month') from = t.slice(0, 8) + '01';
    else if (per === 'last') { to = addDays(t.slice(0, 8) + '01', -1); from = to.slice(0, 8) + '01'; }
    else if (per === 'custom') { from = $('cFrom').value || t; to = $('cTo').value || from; if (from > to) [from, to] = [to, from]; }
    if ($('cBasis').value === 'touched') {
      const last = new Map(); for (const tk of liveTasks()) { const c = findClientForTask(tk); if (c && (!last.has(c._docId) || tk.date > last.get(c._docId))) last.set(c._docId, tk.date); }
      list = list.filter(c => { const d = last.get(c._docId); return d && d >= from && d <= to; });
    } else list = list.filter(c => { const ts = c.createdAt || c.registeredAt; if (!ts) return false; const d = cairoDate(new Date(ts)); return d >= from && d <= to; });
  }
  const cnt = new Map(); list.forEach(c => { const s = normStage(c.stage); cnt.set(s, (cnt.get(s) || 0) + 1); });
  const sel = window._cStage || '';
  $('clientStageSeg').innerHTML = `<button data-cst="" class="${sel ? '' : 'on'}">الكل (${list.length})</button>` + STAGES.filter(s => cnt.get(s)).map(s => `<button data-cst="${esc(s)}" class="${sel === s ? 'on' : ''}">${esc(s)} (${cnt.get(s)})</button>`).join('');
  if (sel) list = list.filter(c => normStage(c.stage) === sel);
  if (q) list = list.filter(c => plain(c.name).includes(q) || (qd.length >= 3 && digits(c.phone).includes(qd)));
  list.sort((a, b) => (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0));
  $('clientCount').textContent = `${list.length} عميل`;
  $('clientList').innerHTML = list.length ? list.slice(0, 300).map(c => `<div class="item" data-client="${esc(c._docId)}"><div class="t">${esc(c.name)} <span class="tag">${esc(normStage(c.stage))}</span></div><div class="s">${esc(c.phone || '')} · ${esc(c.city || '')} · ${esc(c.entityType || '')}</div>${c.statusNote ? `<div class="s">${esc(c.statusNote)}</div>` : ''}</div>`).join('') : '<div class="empty">لا يوجد عملاء</div>';
}
function renderLog() {
  if (!$('logDate').value) $('logDate').value = cairoDate();
  const d = $('logDate').value;
  const list = liveTasks().filter(t => t.date === d).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  $('logList').innerHTML = list.length ? list.map(t => itemHtml(t, `· ${esc(t.time || '')}`)).join('') : '<div class="empty">لا توجد إجراءات في هذا اليوم</div>';
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
    <button class="btn primary sm" id="clientAction">تسجيل إجراء</button> <button class="btn line sm" id="clientEdit"><i class="fa-solid fa-pen-to-square"></i> البيانات الكاملة والمرفقات</button> <button class="btn line sm" id="clientHandoff"><i class="fa-solid fa-headset"></i> ${c.supportPackage ? 'تحديث بيانات الدعم' : 'إحالة إلى الدعم الفني'}</button></p>
    ${Object.entries(c.docs || {}).filter(([, d]) => d?.url).length ? `<div class="pact">${Object.entries(c.docs || {}).filter(([, d]) => d?.url).map(([k, d]) => `<a class="btn line sm" target="_blank" rel="noopener" href="${esc(d.url)}"><i class="fa-solid fa-paperclip"></i> ${esc((DOC_KEYS.find(x => x[0] === k) || [k, k])[1])}</a>`).join('')}</div>` : ''}
    <h3>سجل الإجراءات (${ts.length})</h3>
    <div class="list timeline">${ts.length ? ts.map(t => `<div class="item"><div class="t">${esc(t.category)} <span class="tag">${esc(t.date || '')} ${esc(t.time || '')}</span></div>${t.notes ? `<div class="s">${esc(t.notes)}</div>` : ''}${t.nextFollowUpDate ? `<div class="s">موعد المتابعة التالية: ${esc(t.nextFollowUpDate)} ${esc(t.nextFollowUpTime || '')}</div>` : ''}<div class="s">${esc(t.agent || '')}</div>${t.isClientRegistration ? '' : `<div class="tl-act"><button class="btn line sm" data-tedit="${esc(t._docId || t.id)}"><i class="fa-solid fa-pen"></i> تعديل</button><button class="btn danger sm" data-tdel="${esc(t._docId || t.id)}"><i class="fa-solid fa-trash"></i> حذف</button></div>`}</div>`).join('') : '<div class="empty">لا توجد إجراءات بعد</div>'}</div>
    <p style="margin-top:14px"><button class="btn danger sm" id="clientDelete"><i class="fa-solid fa-trash"></i> حذف العميل</button></p>`;
  $('clientModal').classList.remove('hidden');
  $('clientAction').onclick = () => { $('clientModal').classList.add('hidden'); openAction(c); };
  $('clientHandoff').onclick = () => openHandoff(c);
  $('clientEdit').onclick = () => openClientForm(c);
  $('clientDelete').onclick = () => deleteClient(c);
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
  $('aAlsoWa').checked = false; $('aMatches').innerHTML = ''; $('aMsg').textContent = ''; $('aPhoneChk').textContent = '';
  state.editTask = null; $('actionTitle').textContent = 'تسجيل إجراء';
  setChosen(client);
  $('actionModal').classList.remove('hidden');
}
function searchMatches() {
  const q = plain($('aSearch').value), qd = digits($('aSearch').value);
  if (q.length < 2) { $('aMatches').innerHTML = ''; return; }
  const list = liveClients().filter(c => plain(c.name).includes(q) || (qd.length >= 3 && digits(c.phone).includes(qd))).slice(0, 8);
  $('aMatches').innerHTML = list.map(c => `<div class="item" data-pick="${esc(c._docId)}"><div class="t">${esc(c.name)}</div><div class="s">${esc(c.phone || '')} · ${esc(c.city || '')}</div></div>`).join('') || '<div class="empty">لا يوجد عميل بهذا الاسم لديك — أدخل بياناته أدناه كعميل جديد</div>';
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
  if (state.editTask) return saveEditedTask();
  const btn = $('aSave'), msg = $('aMsg');
  const me = state.me, now = Date.now(), today = cairoDate();
  const category = $('aCategory').value, notes = $('aNotes').value.trim(), statusNote = $('aStatusNote').value.trim();
  const nextDate = $('aNextDate').value, nextTime = $('aNextTime').value;
  msg.className = 'msg err';
  if (nextTime && !nextDate) { msg.textContent = 'يرجى تحديد تاريخ المتابعة أولًا'; return; }
  if (nextDate && nextDate < today) { msg.textContent = 'لا يمكن أن يكون تاريخ المتابعة قبل اليوم'; return; }
  btn.disabled = true; btn.textContent = 'جارٍ الحفظ…'; msg.textContent = '';
  try {
    let client = state.actionClient ? { ...state.actionClient } : null;
    let isNew = false;
    if (!client) {
      const name = $('aName').value.trim(), phone = $('aPhone').value.trim();
      if (!name || digits(phone).length < 8) throw new Error('يرجى إدخال اسم الجهة ورقم جوال صحيح، أو اختيار عميل من قائمتك');
      const existing = await withTimeout(findExistingClient(name, phone), 10000, 'الاتصال بطيء، يرجى المحاولة مرة أخرى');
      const mine = existing.find(c => owns('clients', c));
      const other = existing.find(c => !owns('clients', c));
      if (mine) client = { ...mine };
      else if (other) throw new Error(`هذا العميل مسجّل مسبقًا باسم ${other.addedBy || 'موظف آخر'}، ولا يمكن تسجيله أو إضافة إجراء عليه.`);
      else {
        isNew = true;
        const city = $('aCity').value;
        client = { id: canonicalClientId(name, phone, city), name, phone, contactPerson: '', city, entityType: $('aEntity').value, specialty: $('aSpecialty').value.trim(), stage: stageFor(category, STAGES[0]), statusNote, statusUpdatedAt: statusNote ? now : null, statusUpdatedBy: statusNote ? me.name : '', addedBy: me.name, addedById: me.id, createdAt: now, registeredAt: now, docs: {} };
      }
    }
    const taskId = 'task_' + now;
    const task = { id: taskId, clientId: client.id, time: cairoTime(), date: today, shift: me.shift || '', agent: me.name, agentId: me.id, customer: client.name, phone: client.phone || '', entityType: client.entityType || '', specialty: client.specialty || '', city: client.city || '', category, channel: $('aChannel').value, priority: $('aPriority').value, status: $('aStatus').value, notes, clientStatusNote: statusNote, nextFollowUpDate: nextDate, nextFollowUpTime: nextTime, createdAt: now, updatedAt: now, source: 'v2' };
    // الإجراء الأول — ده الأهم
    await withTimeout(setDoc(doc(col('tasks'), taskId), task), 12000, 'تأخر الحفظ ولم يُحفظ الإجراء، يرجى التأكد من الاتصال بالإنترنت والمحاولة مرة أخرى.');
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
      try { await withTimeout(setDoc(doc(col('tasks'), wid), wa), 12000, 'timeout'); state.tasks.set(wid, { ...wa, _docId: wid }); } catch (e) { toast('تم حفظ المكالمة، لكن لم يُحفظ إجراء الواتساب الإضافي، يرجى تسجيله مرة أخرى', 'err'); }
    }
    $('actionModal').classList.add('hidden');
    toast(clientOk ? '✓ تم حفظ الإجراء' : '✓ تم حفظ الإجراء، ولم تُحدَّث مرحلة العميل وستُحدَّث مع الإجراء التالي', 'ok');
    render();
  } catch (e) {
    msg.textContent = e.message || 'تعذّر الحفظ، والبيانات ما زالت في النموذج، يرجى المحاولة مرة أخرى';
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
  $('attInfo').innerHTML = `الحالة: <b>${ATT_LABEL[st]}</b> · ساعات العمل: <b>${dur(m.work)}</b> · الاستراحة: <b>${dur(m.brk)}</b>${attRecord?.checkInAt ? ` · الحضور: ${esc(cairoTime(new Date(attRecord.checkInAt)))}` : ''}`;
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
    const snap = await withTimeout(getDoc(ref), 10000, 'الاتصال بطيء، يرجى المحاولة مرة أخرى');
    let r = snap.exists() ? snap.data() : null;
    if (kind === 'in') {
      if (r && (r.status === 'working' || r.status === 'break')) throw new Error('تم تسجيل الحضور مسبقًا');
      r = r || { id: attId(today), employeeId: me.id, employeeName: me.name, department: me.department || '', shift: me.shift || 'غير محدد', date: today, sessions: [], breaks: [], createdAt: now };
      r.sessions = Array.isArray(r.sessions) ? r.sessions : []; r.breaks = Array.isArray(r.breaks) ? r.breaks : [];
      r.sessions.push({ checkInAt: now, checkOutAt: null }); r.checkInAt = r.checkInAt || now; r.checkOutAt = null; r.status = 'working';
    } else if (kind === 'break') {
      if (!r || r.status !== 'working') throw new Error('يرجى تسجيل الحضور أولًا');
      r.breaks = Array.isArray(r.breaks) ? r.breaks : []; r.breaks.push({ startAt: now, endAt: null }); r.status = 'break';
    } else if (kind === 'back') {
      if (!r || r.status !== 'break') throw new Error('لا توجد استراحة مفتوحة');
      const ob = [...(r.breaks || [])].reverse().find(x => x && !x.endAt); if (ob) ob.endAt = now; r.status = 'working';
    } else if (kind === 'out') {
      if (!r || !['working', 'break'].includes(r.status)) throw new Error('لا يوجد دوام مفتوح');
      const ob = [...(r.breaks || [])].reverse().find(x => x && !x.endAt); if (ob) ob.endAt = now;
      const os = [...(r.sessions || [])].reverse().find(x => x && !x.checkOutAt); if (os) os.checkOutAt = now;
      r.checkOutAt = now; r.status = 'checked_out';
    }
    r.lastActivityAt = now; r.updatedAt = now; r.employeeName = me.name; r.shift = me.shift || r.shift || 'غير محدد';
    await withTimeout(setDoc(ref, JSON.parse(JSON.stringify(r)), { merge: true }), 12000, 'تأخر الحفظ ولم يُسجَّل، يرجى المحاولة مرة أخرى');
    attRecord = r; msg.className = 'msg ok'; msg.textContent = '✓ تم التسجيل';
    toast({ in: '✓ تم تسجيل الحضور', break: '✓ بداية الاستراحة', back: '✓ تم إنهاء الاستراحة', out: '✓ تم تسجيل الانصراف' }[kind], 'ok');
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
  teamUnsubs.push(onSnapshot(query(col('tasks'), where('date', '==', d)), snap => { data.tasks.clear(); snap.forEach(x => { const t = x.data(); if (!t.deletedAt) data.tasks.set(x.id, t); }); draw(); }, err => { $('teamNote').textContent = 'تعذّر التحميل: ' + err.message; }));
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
  $('teamNote').textContent = `تاريخ ${d} — ${rows.length} موظف — ${tot('ts')} إجراء`;
  $('teamTable').innerHTML = '<tr><th>الموظف</th><th>الحضور</th><th>ساعات العمل</th><th>الإجراءات</th><th>تم الرد</th><th>لم يتم الرد</th><th>واتساب</th><th>اجتماعات</th><th>عقود</th></tr>' +
    rows.map(r => `<tr data-emp="${esc(r.e.id)}" style="cursor:pointer"><td><b>${esc(r.e.name)}</b><div class="small muted">${esc(r.e.department || '')} · ${esc(r.e.shift || '')}</div></td><td><span class="st ${r.st}">${ATT_LABEL[r.st]}</span></td><td>${dur(r.m.work)}</td><td><b>${r.ts.length}</b></td><td>${r.calls}</td><td>${r.na}</td><td>${r.wa}</td><td>${r.meet}</td><td>${r.contract}</td></tr>`).join('') +
    `<tr><th>الإجمالي</th><th></th><th></th><th>${tot('ts')}</th><th>${tot('calls')}</th><th>${tot('na')}</th><th>${tot('wa')}</th><th>${tot('meet')}</th><th>${tot('contract')}</th></tr>`;
}


// ---------------- شاشات المدير: كل العملاء وسجل الإجراءات ----------------
const all = { clients: new Map(), loaded: false, dayTasks: new Map(), dayUnsub: null };
async function loadAllClients() {
  if (all.loaded) return renderAllClients();
  $('allCount').textContent = 'جارٍ التحميل…';
  try { (await getDocsFromCache(col('clients'))).forEach(d => putDoc(all.clients, d)); } catch (e) {}
  renderAllClients();
  try { (await getDocs(col('clients'))).forEach(d => putDoc(all.clients, d)); all.loaded = true; } catch (e) { $('allCount').textContent = 'تعذّر التحميل: ' + e.message; }
  renderAllClients();
}
function renderAllClients() {
  const q = plain($('allSearch').value), qd = digits($('allSearch').value);
  let list = [...all.clients.values()].filter(c => !c.deletedAt);
  if (q) list = list.filter(c => plain(c.name).includes(q) || (qd.length >= 3 && digits(c.phone).includes(qd)));
  list.sort((a, b) => (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0));
  $('allCount').textContent = `${list.length} عميل`;
  $('allList').innerHTML = list.slice(0, 200).map(c => `<div class="item" data-allclient="${esc(c._docId)}"><div class="t">${esc(c.name)} <span class="tag">${esc(normStage(c.stage))}</span></div><div class="s">${esc(c.phone || '')} · ${esc(c.city || '')} · المسؤول: <b>${esc(c.addedBy || '—')}</b></div>${c.statusNote ? `<div class="s">${esc(c.statusNote)}</div>` : ''}</div>`).join('') || '<div class="empty">لا توجد نتائج</div>';
}
async function openAnyClient(c) {
  if (!c) return;
  const ids = [...new Set([c.id, c._docId].filter(Boolean))];
  const found = new Map();
  for (const id of ids) { try { (await getDocs(query(col('tasks'), where('clientId', '==', id)))).forEach(d => putDoc(found, d)); } catch (e) {} }
  const ts = [...found.values()].filter(t => !t.deletedAt).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  const ph = digits(c.phone); const wa = ph ? `https://wa.me/${ph.startsWith('0') ? '966' + ph.slice(1) : ph}` : '';
  $('clientBody').innerHTML = `<h2>${esc(c.name)}</h2><div class="muted">${esc(c.entityType || '')} · ${esc(c.specialty || '')} · ${esc(c.city || '')} · المسؤول: <b>${esc(c.addedBy || '—')}</b></div>
    <p><span class="tag">${esc(normStage(c.stage))}</span> ${c.statusNote ? esc(c.statusNote) : ''}</p>
    <p>${c.phone ? `<a href="tel:${esc(c.phone)}" class="btn line sm">${esc(c.phone)}</a>` : ''} ${wa ? `<a href="${esc(wa)}" target="_blank" class="btn line sm">واتساب</a>` : ''} ${isMgr() ? `<button class="btn line sm" id="anyEdit"><i class="fa-solid fa-pen-to-square"></i> البيانات الكاملة والمرفقات</button> <button class="btn danger sm" id="anyDel"><i class="fa-solid fa-trash"></i> حذف</button>` : ''}</p>
    ${c.accountNumber || c.iban || c.commission || c.contractCrNumber ? `<div class="pkg">${c.contactPerson ? `<div><b>المسؤول</b>${esc(c.contactPerson)}</div>` : ''}${c.iban ? `<div><b>الآيبان</b>${esc(c.iban)}</div>` : ''}${c.commission ? `<div><b>العمولة</b>${esc(c.commission)}</div>` : ''}${c.contractCrNumber ? `<div><b>السجل التجاري</b>${esc(c.contractCrNumber)}</div>` : ''}${c.contractVatNumber ? `<div><b>الرقم الضريبي</b>${esc(c.contractVatNumber)}</div>` : ''}</div>` : ''}
    ${Object.entries(c.docs || {}).filter(([, d]) => d?.url).length ? `<div class="pact">${Object.entries(c.docs || {}).filter(([, d]) => d?.url).map(([k, d]) => `<a class="btn line sm" target="_blank" rel="noopener" href="${esc(d.url)}"><i class="fa-solid fa-paperclip"></i> ${esc((DOC_KEYS.find(x => x[0] === k) || [k, k])[1])}</a>`).join('')}</div>` : ''}
    <h3>سجل الإجراءات (${ts.length})</h3><div class="list timeline">${ts.map(t => `<div class="item"><div class="t">${esc(t.category)} <span class="tag">${esc(t.date || '')} ${esc(t.time || '')}</span></div>${t.notes ? `<div class="s">${esc(t.notes)}</div>` : ''}${t.nextFollowUpDate ? `<div class="s">المتابعة: ${esc(t.nextFollowUpDate)} ${esc(t.nextFollowUpTime || '')}</div>` : ''}<div class="s">${esc(t.agent || '')}</div></div>`).join('') || '<div class="empty">لا توجد إجراءات</div>'}</div>`;
  $('clientModal').classList.remove('hidden');
  if ($('anyEdit')) { $('anyEdit').onclick = () => openClientForm(c); $('anyDel').onclick = () => deleteClient(c); }
}
function startAllLog() {
  if (all.dayUnsub) all.dayUnsub();
  const d = $('allLogDate').value || cairoDate();
  $('allLogNote').textContent = 'جارٍ التحميل…';
  all.dayUnsub = onSnapshot(query(col('tasks'), where('date', '==', d)), snap => { all.dayTasks.clear(); snap.forEach(x => putDoc(all.dayTasks, x)); renderAllLog(); }, e => { $('allLogNote').textContent = 'تعذّر التحميل: ' + e.message; });
}
function renderAllLog() {
  const empId = $('allLogEmp').value; const e = state.employees.find(x => x.id === empId);
  let list = [...all.dayTasks.values()].filter(t => !t.deletedAt && t.taskType !== 'internal' && t.category !== 'مهمة داخلية');
  if (e) list = list.filter(t => (t.agentId && t.agentId === e.id) || normName(t.agent) === normName(e.name));
  list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  $('allLogNote').textContent = `${list.length} إجراء`;
  $('allLogList').innerHTML = list.map(t => `<div class="item" data-logtask="${esc(t._docId)}"><div class="t">${esc(t.customer || '')} <span class="tag">${esc(t.category || '')}</span></div><div class="s">${esc(t.agent || '')} · ${esc(t.time || '')} · ${esc(t.phone || '')}</div>${t.notes ? `<div class="s">${esc(t.notes)}</div>` : ''}${t.nextFollowUpDate ? `<div class="s">المتابعة: ${esc(t.nextFollowUpDate)} ${esc(t.nextFollowUpTime || '')}</div>` : ''}</div>`).join('') || '<div class="empty">لا توجد إجراءات</div>';
}
function showEmployeeDay(empId) {
  if (accessOf(state.me) === 'employee') { $('logDate').value = D.last?.to || cairoDate(); setTab('log'); return; }
  $('allLogDate').value = (state.tab === 'dash' && D.last ? D.last.to : $('teamDate').value) || cairoDate();
  $('allLogEmp').value = empId;
  setTab('alllog');
}


// ---------------- لوحة التحكم (مدير / مشرف) ----------------
const D = { range: 'today', cache: new Map(), data: null, busy: 0 };
const addDays = (ds, n) => { const d = new Date(ds + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const daysBetween = (a, b) => { const out = []; for (let d = a; d <= b && out.length < 400; d = addDays(d, 1)) out.push(d); return out; };
const fmt = n => Number(n || 0).toLocaleString('en-US');
const hrsTxt = ms => { const h = Math.floor(ms / 36e5), m = Math.round((ms % 36e5) / 6e4); return h ? (m ? `${h} س ${m} د` : `${h} ساعة`) : `${m} د`; };
const pct = (a, b) => b ? Math.round(a * 100 / b) : 0;
function dashPeriod() {
  const t = cairoDate();
  switch (D.range) {
    case 'yest': return [addDays(t, -1), addDays(t, -1)];
    case '7': return [addDays(t, -6), t];
    case 'month': return [t.slice(0, 8) + '01', t];
    case 'last': { const f = addDays(t.slice(0, 8) + '01', -1); return [f.slice(0, 8) + '01', f]; }
    case 'custom': { let f = $('dashFrom').value || t, to = $('dashTo').value || f; if (f > to) [f, to] = [to, f]; return [f, to]; }
    default: return [t, t];
  }
}
const ccat = t => LEGACY[t.category] || t.category;
const CAT = { call: 'مكالمة هاتفية', na: 'مكالمة لم يتم الرد عليها', wa: 'إرسال واتساب', meet: 'عقد اجتماع', meetSet: 'الاتفاق على الاجتماع', sent: 'إرسال العقد', signed: 'توقيع العقد', interested: 'عميل مهتم' };
function dashEmployees(dept = $('dashDept').value) {
  const lvl = accessOf(state.me);
  if (lvl === 'employee') return [state.me];
  return state.employees.filter(e => accessOf(e) !== 'manager' && (lvl === 'manager' ? (!dept || e.department === dept) : e.department === state.me.department));
}
async function loadPack(from, to) {
  const key = from + '_' + to;
  let pack = D.cache.get(key);
  const live = to >= cairoDate();
  if (pack && accessOf(state.me) !== 'employee' && !(live && Date.now() - pack.at > 120000)) return pack;
  pack = { at: Date.now(), tasks: [], att: [], clients: [] };
  if (accessOf(state.me) === 'employee') {
    pack.tasks = liveTasks().filter(t => t.date >= from && t.date <= to);
    pack.clients = liveClients().filter(c => c.createdAt && cairoDate(new Date(c.createdAt)) >= from && cairoDate(new Date(c.createdAt)) <= to);
    const at = await getDocs(query(col('attendance'), where('employeeId', '==', state.me.id))).catch(() => null);
    at?.forEach(d => { const r = d.data(); if (r.date >= from && r.date <= to) pack.att.push(r); });
  } else {
    const [ts, at, cs] = await Promise.all([
      getDocs(query(col('tasks'), where('date', '>=', from), where('date', '<=', to))),
      getDocs(query(col('attendance'), where('date', '>=', from), where('date', '<=', to))).catch(() => null),
      getDocs(query(col('clients'), where('createdAt', '>=', new Date(from + 'T00:00:00+02:00').getTime()), where('createdAt', '<=', new Date(to + 'T23:59:59+02:00').getTime()))).catch(() => null)
    ]);
    ts.forEach(d => { const t = d.data(); if (!t.deletedAt && t.taskType !== 'internal' && t.category !== 'مهمة داخلية') pack.tasks.push(t); });
    at?.forEach(d => pack.att.push(d.data()));
    cs?.forEach(d => { const c = d.data(); if (!c.deletedAt) pack.clients.push(c); });
  }
  D.cache.set(key, pack);
  return pack;
}
async function loadDash() {
  const [from, to] = dashPeriod();
  const n = daysBetween(from, to).length, pTo = addDays(from, -1), pFrom = addDays(from, -n);
  const myRun = ++D.busy;
  $('dashNote').textContent = 'جارٍ تحميل البيانات…';
  try {
    const [pack, prev] = await Promise.all([loadPack(from, to), loadPack(pFrom, pTo).catch(() => null)]);
    if (myRun !== D.busy) return;
    D.data = { from, to, ...pack };
    D.prev = prev ? { from: pFrom, to: pTo, ...prev } : null;
    renderDash();
  } catch (e) { $('dashNote').textContent = 'تعذّر تحميل البيانات: ' + e.message; }
}
function empMatcher() {
  const byId = new Map(), byName = new Map();
  for (const e of state.employees) { byId.set(e.id, e); byName.set(normName(e.name), e); }
  return (id, name) => (id && byId.get(id)) || byName.get(normName(name)) || null;
}
function computeDash(data = D.data, dept = $('dashDept').value, empSel = $('dashEmp').value) {
  const { from, to, tasks, att, clients } = data;
  const emps = dashEmployees(dept), allowed = new Set(emps.map(e => e.id));
  const match = empMatcher();
  const keep = e => e && allowed.has(e.id) && (!empSel || e.id === empSel);
  const T = tasks.filter(t => keep(match(t.agentId, t.agent)));
  const A = att.filter(r => keep(match(r.employeeId, r.employeeName)));
  const C = clients.filter(c => keep(match(c.addedById, c.addedBy)));
  const count = (arr, cat) => arr.filter(t => ccat(t) === cat).length;
  const uniq = (arr, cat) => new Set(arr.filter(t => ccat(t) === cat).map(t => (t.clientId || plain(t.customer)) + '|' + t.date)).size;
  const days = daysBetween(from, to);
  const rows = emps.filter(e => !empSel || e.id === empSel).map(e => {
    const ts = T.filter(t => match(t.agentId, t.agent)?.id === e.id);
    const as = A.filter(r => match(r.employeeId, r.employeeName)?.id === e.id);
    const work = as.reduce((s, r) => s + attMetrics(r).work, 0);
    const calls = count(ts, CAT.call), na = count(ts, CAT.na);
    return { e, n: ts.length, calls, na, rate: pct(calls, calls + na), wa: count(ts, CAT.wa), meet: uniq(ts, CAT.meet), meetSet: uniq(ts, CAT.meetSet), sent: uniq(ts, CAT.sent), signed: uniq(ts, CAT.signed), newC: C.filter(c => match(c.addedById, c.addedBy)?.id === e.id).length, daysP: as.filter(r => r.checkInAt).length, work, clientsTouched: new Set(ts.map(t => t.clientId || plain(t.customer))).size };
  }).sort((x, y) => y.n - x.n || y.signed - x.signed);
  const byDay = days.map(d => { const ts = T.filter(t => t.date === d); return { d, n: ts.length, calls: count(ts, CAT.call), na: count(ts, CAT.na), wa: count(ts, CAT.wa) }; });
  const funnel = STAGES.map(s => ({ s, n: T.filter(t => normStage(t.category) === s && (LEGACY[t.category] || t.category) === s).length })).filter(x => x.n);
  const cityMap = new Map(); T.forEach(t => { const c = t.city || 'غير محدد'; cityMap.set(c, (cityMap.get(c) || 0) + 1); });
  const cities = [...cityMap].sort((a, b) => b[1] - a[1]).slice(0, 8);
  const calls = count(T, CAT.call), na = count(T, CAT.na);
  const activeEmps = rows.filter(r => r.n).length;
  return { from, to, days, T, A, C, match, rows, byDay, funnel, cities, k: { n: T.length, calls, na, rate: pct(calls, calls + na), wa: count(T, CAT.wa), meet: uniq(T, CAT.meet), meetSet: uniq(T, CAT.meetSet), sent: uniq(T, CAT.sent), signed: uniq(T, CAT.signed), newC: C.length, touched: new Set(T.map(t => t.clientId || plain(t.customer))).size, avg: activeEmps ? Math.round(T.length / activeEmps / Math.max(1, days.length) * 10) / 10 : 0, activeEmps } };
}
function trendSvg(byDay) {
  const W = 640, H = 220, pl = 34, pb = 26, pt = 10, n = byDay.length;
  const max = Math.max(5, ...byDay.map(x => x.n));
  const step = Math.ceil(max / 4); const top = step * 4;
  const bw = (W - pl - 8) / n, y = v => pt + (H - pt - pb) * (1 - v / top);
  let g = '';
  for (let i = 0; i <= 4; i++) { const v = step * i; g += `<line x1="${pl}" x2="${W - 4}" y1="${y(v)}" y2="${y(v)}" stroke="#eee9f5"/><text x="${pl - 6}" y="${y(v) + 4}" font-size="10" fill="#8a85a0" text-anchor="end">${v}</text>`; }
  const lblEvery = Math.ceil(n / 10);
  byDay.forEach((x, i) => {
    const x0 = pl + i * bw + bw * 0.15, w = Math.max(2, bw * 0.7);
    const seg = [[x.calls, '#16a34a'], [x.na, '#f59e0b'], [x.wa, '#2563eb'], [x.n - x.calls - x.na - x.wa, '#7c5cc4']];
    let acc = 0;
    seg.forEach(([v, c]) => { if (v > 0) { g += `<rect x="${x0}" y="${y(acc + v)}" width="${w}" height="${y(acc) - y(acc + v)}" fill="${c}" rx="1.5"><title>${x.d}: ${v}</title></rect>`; acc += v; } });
    if (n <= 14 && x.n) g += `<text x="${x0 + w / 2}" y="${y(x.n) - 4}" font-size="10" text-anchor="middle" fill="#4b4863" font-weight="700">${x.n}</text>`;
    if (i % lblEvery === 0) g += `<text x="${x0 + w / 2}" y="${H - 8}" font-size="10" text-anchor="middle" fill="#8a85a0">${x.d.slice(8)}/${x.d.slice(5, 7)}</text>`;
  });
  return `<svg viewBox="0 0 ${W} ${H}" direction="ltr">${g}</svg><div class="legend"><span style="--c:#16a34a">مكالمات رد</span><span style="--c:#f59e0b">لم يرد</span><span style="--c:#2563eb">واتساب</span><span style="--c:#7c5cc4">باقي الإجراءات</span></div>`;
}
const barsHtml = (items, color = 'var(--p2)') => { const max = Math.max(1, ...items.map(x => x.v)); return `<div class="bars">${items.map(x => `<div class="bar"><span class="n" title="${esc(x.l)}">${esc(x.l)}</span><span class="tr"><i style="width:${x.v * 100 / max}%;background:${x.c || color}"></i></span><span class="v">${fmt(x.v)}</span></div>`).join('') || '<div class="empty">لا توجد بيانات</div>'}</div>`; };
const rateCls = r => r >= 60 ? 'good' : r >= 40 ? 'mid' : 'low';
function renderDash() {
  if (!D.data) return;
  const r = computeDash(); D.last = r;
  const k = r.k, pk = D.prev ? computeDash(D.prev).k : null;
  const dl = f => { if (!pk) return ''; const a = k[f], b = pk[f]; if (!b && !a) return ''; if (!b) return '<span class="delta up">جديد</span>'; const d = Math.round((a - b) * 100 / b); return d ? `<span class="delta ${d > 0 ? 'up' : 'down'}">${d > 0 ? '▲' : '▼'} ${Math.abs(d)}%</span>` : '<span class="delta">=</span>'; };
  const kp = (label, v, c, sub = '', f = '') => `<div class="kpi" style="--c:${c}"><span>${label}</span><b>${v}${f ? dl(f) : ''}</b>${sub ? `<em>${sub}</em>` : ''}</div>`;
  $('dashNote').textContent = r.from === r.to ? `تاريخ ${r.from}` : `من ${r.from} إلى ${r.to} (${r.days.length} يوم)`;
  if (pk) $('dashNote').textContent += ` · المقارنة بالفترة السابقة (${D.prev.from === D.prev.to ? D.prev.from : D.prev.from + ' إلى ' + D.prev.to})`;
  $('dashKpis').innerHTML = KPI_LIST.map(x => kp(x.l, x.k === 'rate' ? k.rate + '%' : fmt(k[x.k]), x.c, x.k === 'n' ? (accessOf(state.me) === 'employee' ? `بمتوسط ${Math.round(k.n / Math.max(1, r.days.length) * 10) / 10} يوميًا` : `${k.activeEmps} موظف نشط · بمتوسط ${k.avg} لكل موظف يوميًا`) : '', x.k).replace('<div class="kpi"', `<div class="kpi click" data-kpi="${x.k}" data-src="dash" title="اضغط لعرض التفاصيل"`)).join('');
  $('dashTrend').innerHTML = r.byDay.some(x => x.n) ? trendSvg(r.byDay) : '<div class="empty">لا توجد إجراءات في الفترة دي</div>';
  $('dashFunnel').innerHTML = barsHtml(r.funnel.map((x, i) => ({ l: x.s, v: x.n, c: `hsl(${265 - i * 14} 55% ${48 + i * 2}%)` })));
  $('dashEmpBars').innerHTML = barsHtml(r.rows.filter(x => x.n).map(x => ({ l: x.e.name, v: x.n })));
  $('dashCities').innerHTML = barsHtml(r.cities.map(([l, v]) => ({ l, v })), '#0d9488');
  const tot = f => r.rows.reduce((s, x) => s + x[f], 0);
  const tCalls = tot('calls'), tNa = tot('na');
  $('dashTable').innerHTML = '<tr><th>الموظف</th><th>أيام الحضور</th><th>ساعات العمل</th><th>الإجراءات</th><th>عملاء تم التواصل معهم</th><th>تم الرد</th><th>لم يتم الرد</th><th>نسبة الرد</th><th>واتساب</th><th>اجتماعات تمت</th><th>عقود مُرسلة</th><th>عقود موقّعة</th><th>عملاء جدد</th></tr>' +
    r.rows.map((x, i) => `<tr data-emp="${esc(x.e.id)}" style="cursor:pointer"><td><span class="medal ${x.n && i < 3 ? 'm' + (i + 1) : ''}">${i + 1}</span><b>${esc(x.e.name)}</b><div class="small muted">${esc(x.e.department || '')}</div></td><td>${x.daysP}</td><td>${hrsTxt(x.work)}</td><td><b>${fmt(x.n)}</b></td><td>${x.clientsTouched}</td><td>${x.calls}</td><td>${x.na}</td><td><span class="rate ${rateCls(x.rate)}">${x.calls + x.na ? x.rate + '%' : '—'}</span></td><td>${x.wa}</td><td>${x.meet}</td><td>${x.sent}</td><td><b>${x.signed}</b></td><td>${x.newC}</td></tr>`).join('') +
    `<tr class="tot"><th>الإجمالي</th><th>${tot('daysP')}</th><th>${hrsTxt(tot('work'))}</th><th>${fmt(tot('n'))}</th><th>${k.touched}</th><th>${tCalls}</th><th>${tNa}</th><th>${pct(tCalls, tCalls + tNa)}%</th><th>${tot('wa')}</th><th>${tot('meet')}</th><th>${tot('sent')}</th><th>${tot('signed')}</th><th>${tot('newC')}</th></tr>`;
}
function dashExcel() {
  const r = D.last; if (!r) return;
  const cell = v => `<td>${esc(v)}</td>`, head = v => `<th style="background:#5A3B8B;color:#fff">${esc(v)}</th>`;
  const hrs = ms => Math.round(ms / 36e5 * 10) / 10;
  const sum = `<table border="1"><tr><th colspan="13" style="font-size:16px">تقرير أداء الفريق — ${esc(r.from)} إلى ${esc(r.to)}</th></tr><tr>${['الموظف', 'القسم', 'أيام الحضور', 'ساعات العمل', 'الإجراءات', 'عملاء تم التواصل معهم', 'تم الرد', 'لم يتم الرد', 'نسبة الرد %', 'واتساب', 'اجتماعات', 'عقود مُرسلة', 'عقود موقّعة'].map(head).join('')}</tr>` +
    r.rows.map(x => `<tr>${[x.e.name, x.e.department || '', x.daysP, hrs(x.work), x.n, x.clientsTouched, x.calls, x.na, x.rate, x.wa, x.meet, x.sent, x.signed].map(cell).join('')}</tr>`).join('') + '</table>';
  const det = `<br><table border="1"><tr><th colspan="11" style="font-size:16px">تفاصيل الإجراءات</th></tr><tr>${['التاريخ', 'الوقت', 'الموظف', 'العميل', 'الجوال', 'المدينة', 'الإجراء', 'القناة', 'الملاحظات', 'موعد المتابعة التالية', 'ساعة المتابعة'].map(head).join('')}</tr>` +
    [...r.T].sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0)).map(t => `<tr>${[t.date, t.time, t.agent, t.customer, t.phone, t.city, t.category, t.channel, t.notes, t.nextFollowUpDate, t.nextFollowUpTime].map(v => `<td style="mso-number-format:'\\@'">${esc(v || '')}</td>`).join('')}</tr>`).join('') + '</table>';
  const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel"><head><meta charset="UTF-8"><!--[if gte mso 9]><xml><x:ExcelWorkbook><x:ExcelWorksheets><x:ExcelWorksheet><x:Name>التقرير</x:Name><x:WorksheetOptions><x:DisplayRightToLeft/></x:WorksheetOptions></x:ExcelWorksheet></x:ExcelWorksheets></x:ExcelWorkbook></xml><![endif]--></head><body dir="rtl" style="font-family:Arial">${sum}${det}</body></html>`;
  const blob = new Blob(['﻿' + html], { type: 'application/vnd.ms-excel' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `تقرير-نبضي-${r.from}_${r.to}.xls`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
function setupDash() {
  const lvl = accessOf(state.me);
  if (lvl === 'employee') { $('dashDept').closest('.frow').querySelectorAll('#dashDept,#dashEmp').forEach(x => x.classList.add('hidden')); $('dashDept').previousElementSibling.classList.add('hidden'); $('dashEmp').previousElementSibling.classList.add('hidden'); document.querySelector('#tab-dash h1').textContent = 'تقرير أدائي'; $('dashEmpBars').closest('.card').classList.add('hidden'); $('dashTable').closest('.card').querySelector('h3').lastChild.textContent = ' تفاصيل أدائي'; }
  const depts = [...new Set(state.employees.map(e => e.department).filter(Boolean))];
  $('dashDept').innerHTML = lvl === 'manager' ? '<option value="">جميع الأقسام</option>' + depts.map(d => `<option>${esc(d)}</option>`).join('') : `<option>${esc(state.me.department || '')}</option>`;
  const fillEmp = () => { $('dashEmp').innerHTML = '<option value="">جميع الموظفين</option>' + dashEmployees().map(e => `<option value="${esc(e.id)}">${esc(e.name)}</option>`).join(''); };
  fillEmp();
  $('dashFrom').value = $('dashTo').value = cairoDate();
  $('dashRange').onclick = e => { const b = e.target.closest('button[data-r]'); if (!b) return; D.range = b.dataset.r; $('dashRange').querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b)); $('dashCustom').classList.toggle('hidden', D.range !== 'custom'); loadDash(); };
  $('dashFrom').onchange = $('dashTo').onchange = loadDash;
  $('dashDept').onchange = () => { fillEmp(); renderDash(); };
  $('dashEmp').onchange = renderDash;
  $('dashXls').onclick = dashExcel;
  $('dashPrint').onclick = () => window.print();
}


// ---------------- الدعم الفني (نفس بيانات supportProjects بتاعة النسخة الحالية) ----------------
const deptOf = e => { const s = String(e?.department || e?.roleDepartment || ''); if (s.includes('الدعم') || String(e?.name || '').includes('دعم فني')) return 'الدعم الفني'; return s; };
const isSupport = e => deptOf(e) === 'الدعم الفني';
const SUP_STEPS = ['مراجعة البيانات', 'طلب واستكمال البيانات الناقصة', 'تجهيز ورفع المنتجات والخدمات', 'رفع بيانات الدكاترة والصور', 'إدخال مواعيد الدكاترة', 'مراجعة الجودة', 'إرسال النسخة للعميل للمراجعة', 'تنفيذ تعديلات العميل', 'النشر والتسليم النهائي'];
const ST_STATUSES = ['جديدة', 'جاري التنفيذ', 'انتظار العميل', 'مكتملة'];
const ST_PRIORITY = ['عادية', 'عالية', 'عاجلة'];
const HS = { 'بانتظار رابط البيانات': 'wait', 'بانتظار الاستلام': 'wait', 'تم إرسال رابط البيانات': 'sent', 'تم الاستلام': 'recv', 'تم الرفع بنجاح': 'done', 'مرتجع لخدمات العملاء': 'ret' };
const isDoneSt = s => ['مكتمل', 'مكتملة', 'مكتمله', 'تم', 'تم الانجاز', 'تم الرفع بنجاح', 'منتهي'].includes(String(s || '').trim());
const S = { projects: new Map(), unsub: null, scope: 'active', open: new Set() };
const canManageSupport = () => { const lvl = accessOf(state.me); return lvl === 'manager' || (lvl === 'supervisor' && isSupport(state.me)); };
const actor = () => state.me?.id === 'manager' ? 'المدير العام' : state.me?.name || '';
function startSupport() {
  if (S.unsub) return;
  S.unsub = onSnapshot(col('supportProjects'), snap => {
    snap.docChanges().forEach(ch => { if (ch.type === 'removed') S.projects.delete(ch.doc.id); else { const d = ch.doc.data(); S.projects.set(ch.doc.id, { ...d, id: d.id || ch.doc.id, _docId: ch.doc.id }); } });
    supBadge();
    if (state.tab === 'support') renderSupport();
  }, e => { $('supList').innerHTML = `<div class="card empty">تعذّر تحميل ملفات الدعم: ${esc(e.message)}</div>`; });
}
const HS_RANK = { 'تم الرفع بنجاح': 4, 'تم الاستلام': 3, 'تم إرسال رابط البيانات': 2, 'بانتظار الاستلام': 1, 'بانتظار رابط البيانات': 0 };
// ملف واحد لكل عميل: لو فيه نسخ مكررة نعرض الأحسن حالة بس
const liveProjects = () => {
  const best = new Map();
  for (const p of S.projects.values()) {
    if (p.deletedAt) continue;
    const k = p.clientId || plain(p.clientName);
    const cur = best.get(k);
    if (!cur || (HS_RANK[p.handoffStatus] ?? -1) > (HS_RANK[cur.handoffStatus] ?? -1) || ((HS_RANK[p.handoffStatus] ?? -1) === (HS_RANK[cur.handoffStatus] ?? -1) && liveSTasks(p).length > liveSTasks(cur).length)) best.set(k, p);
  }
  return [...best.values()];
};
const liveSTasks = p => (p.tasks || []).filter(t => !t.deletedAt);
const taskLate = t => t.due && !isDoneSt(t.status) && t.due < cairoDate();
function supBadge() {
  const n = liveProjects().filter(p => p.handoffStatus === 'تم إرسال رابط البيانات').length;
  $('supBadge').textContent = n; $('supBadge').classList.toggle('hidden', !n);
}
function renderSupport() {
  const all = liveProjects(), me = actor(), today = cairoDate();
  const mineP = p => normName(p.receivedBy) === normName(me) || liveSTasks(p).some(t => normName(t.agent) === normName(me) && !isDoneSt(t.status));
  const k = { wait: all.filter(p => p.handoffStatus === 'تم إرسال رابط البيانات').length, recv: all.filter(p => p.handoffStatus === 'تم الاستلام').length, done: all.filter(p => p.handoffStatus === 'تم الرفع بنجاح').length, ret: all.filter(p => p.handoffStatus === 'مرتجع لخدمات العملاء').length, late: all.reduce((s, p) => s + (p.handoffStatus === 'تم الاستلام' ? liveSTasks(p).filter(taskLate).length : 0), 0) };
  const kp = (l, v, c) => `<div class="kpi" style="--c:${c}"><span>${l}</span><b>${v}</b></div>`;
  $('supKpis').innerHTML = kp('بانتظار الاستلام', k.wait, '#2563eb') + kp('تحت التنفيذ', k.recv, '#7c3aed') + kp('مهام متأخرة', k.late, '#dc2626') + kp('مُعادة للمبيعات', k.ret, '#f59e0b') + kp('تم التسليم للعميل', k.done, '#16a34a');
  const q = plain($('supSearch').value), qd = digits($('supSearch').value);
  let list = all.filter(p => {
    switch (S.scope) {
      case 'waiting': return ['تم إرسال رابط البيانات', 'بانتظار رابط البيانات', 'بانتظار الاستلام'].includes(p.handoffStatus);
      case 'mine': return mineP(p) && p.handoffStatus !== 'تم الرفع بنجاح';
      case 'late': return p.handoffStatus === 'تم الاستلام' && liveSTasks(p).some(taskLate);
      case 'done': return p.handoffStatus === 'تم الرفع بنجاح';
      case 'returned': return p.handoffStatus === 'مرتجع لخدمات العملاء';
      default: return !['تم الرفع بنجاح', 'مرتجع لخدمات العملاء'].includes(p.handoffStatus);
    }
  });
  if (q) list = list.filter(p => plain(p.clientName).includes(q) || (qd.length >= 3 && digits(p.phone).includes(qd)) || liveSTasks(p).some(t => plain(t.title).includes(q)));
  const order = { 'تم إرسال رابط البيانات': 0, 'تم الاستلام': 1, 'بانتظار رابط البيانات': 2, 'مرتجع لخدمات العملاء': 3, 'تم الرفع بنجاح': 4 };
  list.sort((x, y) => (order[x.handoffStatus] ?? 5) - (order[y.handoffStatus] ?? 5) || String(y.sentAt || '').localeCompare(String(x.sentAt || '')));
  $('supAddTask').classList.toggle('hidden', !canManageSupport());
  $('supList').innerHTML = list.length ? list.slice(0, 150).map(projHtml).join('') : '<div class="card empty">لا توجد ملفات</div>';
  // لوحة الإنجاز
  const board = new Map();
  for (const p of all) for (const t of liveSTasks(p)) {
    const n = t.agent || 'غير مُسندة'; const r = board.get(n) || { n, done: 0, open: 0, late: 0 };
    if (isDoneSt(t.status)) r.done++; else { r.open++; if (taskLate(t)) r.late++; } board.set(n, r);
  }
  const rows = [...board.values()].sort((a, b) => b.done - a.done);
  $('supBoard').innerHTML = rows.length ? rows.map(r => `<div class="item" style="cursor:default"><div class="t">${esc(r.n)}</div><div class="s">منجزة <b class="rate good">${r.done}</b> · مفتوحة <b>${r.open}</b> · متأخرة <b class="rate low">${r.late}</b> · الإنجاز <b>${pct(r.done, r.done + r.open)}%</b></div></div>`).join('') : '<div class="empty">لا توجد مهام بعد</div>';
}
function projHtml(p) {
  const ts = liveSTasks(p), done = ts.filter(t => isDoneSt(t.status)).length, cls = HS[p.handoffStatus] || 'wait';
  const open = S.open.has(p._docId), me = actor(), mgr = canManageSupport();
  const pk = p.supportPackage || {};
  const canEditTask = t => mgr || normName(t.agent) === normName(me);
  const late = ts.filter(taskLate).length;
  let body = '';
  if (open) {
    body = `<div class="pb">
      <div class="pkg">${pk.driveLink ? `<div><b>ملفات العميل</b><a href="${esc(pk.driveLink)}" target="_blank" rel="noopener" class="btn line sm"><i class="fa-brands fa-google-drive"></i> فتح الملفات</a></div>` : ''}${pk.products ? `<div><b>المنتجات والخدمات</b>${esc(pk.products)}</div>` : ''}${pk.doctors ? `<div><b>الدكاترة والصور</b>${esc(pk.doctors)}</div>` : ''}${pk.schedules ? `<div><b>المواعيد</b>${esc(pk.schedules)}</div>` : ''}${pk.notes ? `<div><b>ملاحظات التسليم</b>${esc(pk.notes)}</div>` : ''}${p.returnedReason ? `<div><b>سبب الإرجاع</b>${esc(p.returnedReason)}</div>` : ''}</div>
      ${ts.length ? ts.map(t => `<div class="stask"><div><div class="tt ${isDoneSt(t.status) ? 'done' : ''}">${esc(t.title)}</div><div class="small muted">${esc(t.agent || 'غير مُسندة')}${t.due ? ` · التسليم ${esc(t.due)}` : ''}${taskLate(t) ? ' · <b class="red">متأخرة</b>' : ''}${t.priority && t.priority !== 'عادية' ? ` · <b class="amber">${esc(t.priority)}</b>` : ''}${t.notes ? ` · ${esc(t.notes)}` : ''}</div></div>
        <select data-stst="${esc(p._docId)}|${esc(t.id)}" ${canEditTask(t) && p.handoffStatus === 'تم الاستلام' ? '' : 'disabled'}>${[...new Set([...ST_STATUSES, t.status || 'جديدة'])].map(s => `<option ${s === (t.status || 'جديدة') ? 'selected' : ''}>${esc(s)}</option>`).join('')}</select>
        ${mgr ? `<button class="iconbtn" data-stedit="${esc(p._docId)}|${esc(t.id)}" title="تعديل"><i class="fa-solid fa-pen"></i></button>` : '<span></span>'}</div>`).join('') : '<div class="empty">ستظهر المهام بعد استلام الملف</div>'}
      <div class="pact">
        ${p.handoffStatus === 'تم إرسال رابط البيانات' ? `<button class="btn primary sm" data-pact="accept|${esc(p._docId)}"><i class="fa-solid fa-hand"></i> استلام الملف</button><button class="btn danger sm" data-pact="return|${esc(p._docId)}"><i class="fa-solid fa-rotate-left"></i> إعادة للمبيعات (بيانات ناقصة)</button>` : ''}
        ${p.handoffStatus === 'تم الاستلام' && mgr ? `<button class="btn line sm" data-pact="addtask|${esc(p._docId)}"><i class="fa-solid fa-plus"></i> مهمة</button>` : ''}
        ${p.handoffStatus === 'تم الاستلام' && (mgr || normName(p.receivedBy) === normName(me)) ? `<button class="btn ok sm" data-pact="complete|${esc(p._docId)}"><i class="fa-solid fa-circle-check"></i> تم التسليم للعميل</button><button class="btn danger sm" data-pact="return|${esc(p._docId)}"><i class="fa-solid fa-rotate-left"></i> إعادة للمبيعات</button>` : ''}
        ${p.handoffStatus === 'تم الرفع بنجاح' && mgr ? `<button class="btn line sm" data-pact="reopen|${esc(p._docId)}"><i class="fa-solid fa-lock-open"></i> إعادة فتح</button>` : ''}
      </div></div>`;
  }
  return `<div class="proj"><div class="ph" data-ptoggle="${esc(p._docId)}"><div><h4>${esc(p.clientName || 'عميل')} <span class="hs ${cls}">${esc(p.handoffStatus || '—')}</span>${late ? ` <span class="hs ret">${late} متأخرة</span>` : ''}</h4>
    <div class="small muted">${esc(p.phone || '')} · المُرسِل: ${esc(p.sender || '—')}${p.sentAt ? ` · ${esc(String(p.sentAt).slice(0, 10))}` : ''}${p.receivedBy ? ` · المستلم: <b>${esc(p.receivedBy)}</b>` : ''}${p.completedAt ? ` · سُلّم للعميل في ${esc(String(p.completedAt).slice(0, 10))}` : ''}</div>
    ${ts.length ? `<div class="prog"><i style="width:${pct(done, ts.length)}%"></i></div><div class="small muted">${done} من ${ts.length} مهام</div>` : ''}</div>
    <i class="fa-solid fa-chevron-${open ? 'up' : 'down'} grey"></i></div>${body}</div>`;
}
async function mutateProject(docId, fn) {
  const ref = doc(col('supportProjects'), docId);
  const snap = await withTimeout(getDoc(ref), 10000, 'الاتصال بطيء، يرجى المحاولة مرة أخرى');
  const cur = snap.exists() ? snap.data() : S.projects.get(docId);
  if (!cur) throw new Error('الملف غير موجود');
  const p = JSON.parse(JSON.stringify(cur)); p.tasks = Array.isArray(p.tasks) ? p.tasks : [];
  if (fn(p) === false) return;
  delete p._docId; delete p._syncAt;
  await withTimeout(setDoc(ref, p), 12000, 'تأخر الحفظ، يرجى المحاولة مرة أخرى');
  S.projects.set(docId, { ...p, _docId: docId });
  renderSupport();
}
function recordStatus(t, status) {
  const now = new Date().toISOString(), prev = t.status;
  t.createdAt = t.createdAt || now; t.updatedAt = now; t.status = status;
  if (isDoneSt(status)) { t.completedAt = t.completedAt || now; t.completedBy = t.completedBy || actor(); } else { t.completedAt = ''; t.completedBy = ''; }
  if (prev !== status) t.activityLog = [...(t.activityLog || []), { at: now, by: actor(), type: 'تغيير الحالة', comment: (prev || 'جديدة') + ' ← ' + status }];
}
async function projAction(kind, id) {
  try {
    const now = new Date().toISOString(), me = actor();
    if (kind === 'accept') {
      if (!isSupport(state.me) && accessOf(state.me) !== 'manager') throw new Error('الاستلام متاح لموظفي الدعم الفني فقط');
      await mutateProject(id, p => { if (p.handoffStatus !== 'تم إرسال رابط البيانات') throw new Error('تم استلام الملف أو تغيرت حالته، يرجى تحديث الصفحة'); p.handoffStatus = 'تم الاستلام'; p.receivedBy = me; p.receivedAt = now; if (!(p.tasks || []).filter(t => !t.deletedAt).length) p.tasks = SUP_STEPS.map((title, i) => ({ id: 'st_' + Date.now() + '_' + i, title, agent: me, due: '', status: 'جديدة', priority: 'عادية', notes: '', createdAt: now })); });
      S.open.add(id); toast('✓ تم استلام الملف وفتح مهامه', 'ok');
    } else if (kind === 'return') {
      const reason = prompt('يرجى كتابة البيانات الناقصة المطلوبة من فريق المبيعات:'); if (!reason || !reason.trim()) return;
      await mutateProject(id, p => { p.handoffStatus = 'مرتجع لخدمات العملاء'; p.returnedReason = reason.trim(); p.returnedBy = me; p.returnedAt = now; });
      toast('✓ تمت إعادة الملف إلى المبيعات', 'ok');
    } else if (kind === 'complete') {
      if (!confirm('هل تؤكد رفع جميع بيانات العميل وتسليمها؟')) return;
      await mutateProject(id, p => { p.handoffStatus = 'تم الرفع بنجاح'; p.completedBy = me; p.completedAt = now; (p.tasks || []).filter(t => !t.deletedAt).forEach(t => recordStatus(t, 'مكتملة')); });
      toast('✓ تم إغلاق الملف ونقله إلى المكتملة', 'ok');
    } else if (kind === 'reopen') {
      await mutateProject(id, p => { p.handoffStatus = 'تم الاستلام'; p.completedAt = ''; p.completedBy = ''; });
    } else if (kind === 'addtask') openSupTask(id, '');
  } catch (e) { toast(e.message, 'err'); }
}
function supAgents() { return ['غير مُسندة', ...state.employees.filter(isSupport).map(e => e.name)]; }
function openSupTask(projectId, taskId) {
  const ps = liveProjects().filter(p => p.handoffStatus !== 'تم الرفع بنجاح').sort((a, b) => String(a.clientName).localeCompare(String(b.clientName), 'ar'));
  $('stProject').innerHTML = ps.map(p => `<option value="${esc(p._docId)}">${esc(p.clientName)}</option>`).join('');
  $('stClientWrap').classList.toggle('hidden', !!projectId);
  const p = projectId && S.projects.get(projectId), t = p && liveSTasks(p).find(x => x.id === taskId);
  if (projectId) $('stProject').innerHTML = `<option value="${esc(projectId)}">${esc(p?.clientName || '')}</option>`;
  fillSelect('stAgent', supAgents()); fillSelect('stStatus', ST_STATUSES); fillSelect('stPriority', ST_PRIORITY);
  $('stTitleH').textContent = t ? 'تعديل مهمة' : 'مهمة دعم جديدة';
  $('stTitle').value = t?.title || ''; $('stAgent').value = t?.agent || 'غير مُسندة'; $('stDue').value = t?.due || ''; $('stStatus').value = ST_STATUSES.includes(t?.status) ? t.status : 'جديدة'; $('stPriority').value = t?.priority || 'عادية'; $('stNotes').value = t?.notes || '';
  $('stSave').dataset.task = taskId || ''; $('stMsg').textContent = '';
  $('supTaskModal').classList.remove('hidden');
}
async function saveSupTask() {
  const pid = $('stProject').value, tid = $('stSave').dataset.task, title = $('stTitle').value.trim();
  const msg = $('stMsg'); msg.className = 'msg err';
  if (!pid) { msg.textContent = 'يرجى اختيار العميل'; return; }
  if (!title) { msg.textContent = 'يرجى كتابة عنوان المهمة'; return; }
  $('stSave').disabled = true;
  try {
    await mutateProject(pid, p => {
      const data = { title, agent: $('stAgent').value, due: $('stDue').value, priority: $('stPriority').value, notes: $('stNotes').value.trim() };
      let t = tid && p.tasks.find(x => x.id === tid);
      if (!t) { t = { id: 'st_' + Date.now(), status: 'جديدة', createdAt: new Date().toISOString() }; p.tasks.push(t); }
      Object.assign(t, data); recordStatus(t, $('stStatus').value);
      if (p.handoffStatus !== 'تم الاستلام') { p.handoffStatus = 'تم الاستلام'; p.receivedBy = p.receivedBy || (data.agent !== 'غير مُسندة' ? data.agent : actor()); p.receivedAt = p.receivedAt || new Date().toISOString(); }
    });
    S.open.add(pid); $('supTaskModal').classList.add('hidden'); toast('✓ تم حفظ المهمة', 'ok');
  } catch (e) { msg.textContent = e.message; } finally { $('stSave').disabled = false; }
}
async function setSupTaskStatus(pid, tid, status) {
  try { await mutateProject(pid, p => { const t = p.tasks.find(x => x.id === tid); if (!t) return false; recordStatus(t, status); }); toast('✓ تم التحديث', 'ok'); }
  catch (e) { toast(e.message, 'err'); renderSupport(); }
}
// إرسال العميل للدعم من شاشة المبيعات
let hoClient = null;
function openHandoff(c) {
  hoClient = c; const pk = c.supportPackage || {};
  $('hoClient').textContent = `${c.name} — ${c.phone || ''}`;
  $('hoLink').value = pk.driveLink || ''; $('hoProducts').value = pk.products || ''; $('hoDoctors').value = pk.doctors || ''; $('hoSchedules').value = pk.schedules || ''; $('hoNotes').value = pk.notes || ''; $('hoMsg').textContent = '';
  $('clientModal').classList.add('hidden'); $('handoffModal').classList.remove('hidden');
}
async function saveHandoff() {
  const c = hoClient, msg = $('hoMsg'); msg.className = 'msg err'; if (!c) return;
  const link = $('hoLink').value.trim();
  try { const u = new URL(link); if (!['http:', 'https:'].includes(u.protocol)) throw 0; } catch (e) { msg.textContent = 'يرجى إدخال رابط صحيح يبدأ بـ https://'; return; }
  const btn = $('hoSave'); btn.disabled = true;
  try {
    const now = new Date().toISOString(), me = actor();
    const pack = { driveLink: link, products: $('hoProducts').value.trim(), doctors: $('hoDoctors').value.trim(), schedules: $('hoSchedules').value.trim(), notes: $('hoNotes').value.trim(), sentBy: me, sentAt: now };
    await withTimeout(setDoc(doc(col('clients'), c._docId || c.id), { supportPackage: pack, updatedAt: Date.now() }, { merge: true }), 12000, 'تأخر الحفظ، يرجى المحاولة مرة أخرى');
    let snap = null; try { snap = await getDocs(query(col('supportProjects'), where('clientId', '==', c.id))); } catch (e) {}
    let existing = null; snap?.forEach(d => { const x = d.data(); if (x.deletedAt) return; if (!existing || (HS_RANK[x.handoffStatus] ?? -1) > (HS_RANK[existing.handoffStatus] ?? -1)) existing = { ...x, _docId: d.id }; });
    if (existing?.handoffStatus === 'تم الرفع بنجاح' && !confirm('ملف هذا العميل مكتمل لدى الدعم الفني. هل تريد إعادة إرساله لتحديث بياناته؟')) { btn.disabled = false; return; }
    const pid = existing?._docId || ('sp_' + Date.now());
    const base = existing ? (({ _docId, _syncAt, ...r }) => r)(existing) : { id: pid, clientId: c.id, clientName: c.name, phone: c.phone || '', createdAt: now, tasks: [] };
    Object.assign(base, { clientName: c.name, phone: c.phone || '', sender: me, sentAt: now, handoffStatus: 'تم إرسال رابط البيانات', receivedBy: '', receivedAt: '', returnedReason: '', supportPackage: pack, tasks: existing?.handoffStatus === 'تم الاستلام' ? base.tasks : [] });
    await withTimeout(setDoc(doc(col('supportProjects'), pid), base), 12000, 'تأخر الحفظ، يرجى المحاولة مرة أخرى');
    const local = state.clients.get(c._docId); if (local) local.supportPackage = pack;
    $('handoffModal').classList.add('hidden'); toast('✓ تمت إحالة الملف إلى فريق الدعم الفني', 'ok');
  } catch (e) { msg.textContent = e.message; } finally { btn.disabled = false; }
}


// ---------------- حسابات الموظفين (للمدير) ----------------
const ACC = { map: new Map(), loaded: false };
async function loadAccounts() {
  $('accTable').innerHTML = '<tr><td class="empty">جاري التحميل…</td></tr>';
  try { const s = await getDocs(col('authAccounts')); ACC.map.clear(); s.forEach(d => ACC.map.set(d.id, d.data())); ACC.loaded = true; }
  catch (e) { $('accTable').innerHTML = `<tr><td class="empty">تعذر التحميل: ${esc(e.message)}</td></tr>`; return; }
  renderAccounts();
}
function accEmployees() { return state.employees; }
function renderAccounts() {
  const emps = accEmployees();
  const has = e => ACC.map.has(e.id);
  const missing = emps.filter(e => !has(e));
  $('accBadge').textContent = missing.length; $('accBadge').classList.toggle('hidden', !missing.length);
  $('accKpis').innerHTML = `<div class="kpi" style="--c:#5A3B8B"><span>جميع الموظفين</span><b>${emps.length}</b></div><div class="kpi" style="--c:#16a34a"><span>لديهم حساب</span><b>${emps.length - missing.length}</b></div><div class="kpi" style="--c:#dc2626"><span>لم يسجلوا الدخول بعد</span><b>${missing.length}</b></div>`;
  const rows = [...emps].sort((a, b) => has(a) - has(b) || String(a.name).localeCompare(String(b.name), 'ar'));
  $('accTable').innerHTML = '<tr><th>الموظف</th><th>القسم</th><th>الصلاحية</th><th>الشفت</th><th>حالة الحساب</th><th>آخر دخول</th><th></th></tr>' + rows.map(e => {
    const a = ACC.map.get(e.id);
    return `<tr><td><b>${esc(e.name)}</b></td><td>${esc(e.department || '')}</td><td>${{ manager: 'مدير متابعة', supervisor: 'مشرف', employee: 'موظف' }[accessOf(e)]}</td><td>${esc(e.shift || '')}</td><td>${a ? '<span class="st working">لديه حساب ✓</span>' : '<span class="st not_started">لم يسجل الدخول بعد</span>'}</td><td>${a?.lastLoginAt ? esc(new Date(a.lastLoginAt).toLocaleString('ar-EG', { timeZone: TZ, dateStyle: 'medium', timeStyle: 'short' })) : '—'}</td><td style="white-space:nowrap">${a ? '' : `<button class="btn primary sm" data-mkacc="${esc(e.id)}"><i class="fa-solid fa-user-plus"></i> إنشاء حساب</button> `}<button class="iconbtn" data-emedit="${esc(e.id)}" title="تعديل"><i class="fa-solid fa-pen"></i></button><button class="iconbtn" data-emdel="${esc(e.id)}" title="حذف"><i class="fa-solid fa-trash"></i></button></td></tr>`;
  }).join('');
}
let adminAuth = null;
async function makeAccount(empId) {
  const emp = state.employees.find(e => e.id === empId); if (!emp) return;
  const pin = (prompt(`أدخل رمز دخول جديدًا للموظف ${emp.name} (من 4 إلى 8 أرقام):`) || '').trim();
  if (!pin) return;
  if (!/^\d{4,8}$/.test(pin)) { toast('يجب أن يتكون الرمز من 4 إلى 8 أرقام', 'err'); return; }
  const btn = document.querySelector(`[data-mkacc="${CSS.escape(empId)}"]`); if (btn) { btn.disabled = true; btn.textContent = 'جارٍ…'; }
  try {
    if (!adminAuth) adminAuth = getAuth(initializeApp(firebaseConfig, 'nabdi-admin'));
    const email = staffEmailFor(emp), password = `nb-${pin}`;
    let uid = '';
    try { uid = (await createUserWithEmailAndPassword(adminAuth, email, password)).user.uid; }
    catch (e) {
      if (e?.code !== 'auth/email-already-in-use') throw e;
      try { uid = (await signInWithEmailAndPassword(adminAuth, email, password)).user.uid; }
      catch (e2) { throw new Error('لدى هذا الموظف حساب سابق برمز مختلف، يرجى أن يسجّل الدخول برمزه القديم مرة واحدة على النظام الجديد'); }
    }
    try { await signOut(adminAuth); } catch (e) {}
    await setDoc(doc(col('employees'), emp._docId || emp.id), { pin, updatedAt: Date.now() }, { merge: true });
    emp.pin = pin;
    await setDoc(doc(col('authAccounts'), emp.id), { empId: emp.id, name: emp.name || '', uid, email, createdByManagerAt: Date.now() }, { merge: true });
    ACC.map.set(emp.id, { empId: emp.id, uid, email });
    renderAccounts();
    toast(`✓ تم إنشاء حساب ${emp.name} — رمز الدخول الجديد: ${pin}`, 'ok');
  } catch (e) { toast(e.message || 'تعذّر إنشاء الحساب', 'err'); if (btn) { btn.disabled = false; btn.textContent = 'إنشاء حساب'; } }
}


// ---------------- التقارير الاحترافية ----------------
const REP_TYPES = [
  { id: 'team', icon: 'fa-people-group', t: 'تقرير أداء الفريق', d: 'المؤشرات والمقارنة وأداء كل موظف' },
  { id: 'emp', icon: 'fa-id-badge', t: 'تقرير موظف تفصيلي', d: 'أداء موظف واحد وحضوره وإجراءاته', needEmp: true },
  { id: 'actions', icon: 'fa-list-ol', t: 'سجل الإجراءات التفصيلي', d: 'جميع الإجراءات مع إمكانية التصفية', cat: true },
  { id: 'att', icon: 'fa-user-clock', t: 'تقرير الحضور والانصراف', d: 'أيام وساعات العمل لكل موظف' },
  { id: 'clients', icon: 'fa-user-plus', t: 'تقرير العملاء الجدد', d: 'العملاء المسجلون خلال الفترة' },
  { id: 'support', icon: 'fa-headset', t: 'تقرير الدعم الفني', d: 'الملفات المستلمة والمنجزة والمتأخرة' }
];
const RP = { type: 'team', range: 'month', last: null };
function repPeriod() {
  const saved = D.range; D.range = RP.range;
  const fromEl = $('dashFrom'), toEl = $('dashTo'), sf = fromEl.value, st = toEl.value;
  fromEl.value = $('repFrom').value; toEl.value = $('repTo').value;
  const p = dashPeriod(); D.range = saved; fromEl.value = sf; toEl.value = st; return p;
}
const fmtDate = ds => { if (!ds) return '—'; const [y, m, d] = ds.split('-'); return `${d}/${m}/${y}`; };
const fmtTime = ms => ms ? new Intl.DateTimeFormat('ar-EG', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: true }).format(new Date(ms)) : '—';
const dayName = ds => new Intl.DateTimeFormat('ar-EG', { weekday: 'long', timeZone: 'UTC' }).format(new Date(ds + 'T12:00:00Z'));
function setupReports() {
  $('repTypes').innerHTML = REP_TYPES.map(x => `<button class="rtype ${x.id === RP.type ? 'on' : ''}" data-rtype="${x.id}"><i class="fa-solid ${x.icon}"></i><b>${x.t}</b><span>${x.d}</span></button>`).join('');
  const lvl = accessOf(state.me);
  const depts = [...new Set(state.employees.map(e => e.department).filter(Boolean))];
  $('repDept').innerHTML = lvl === 'manager' ? '<option value="">جميع الأقسام</option>' + depts.map(d => `<option>${esc(d)}</option>`).join('') : `<option>${esc(state.me.department || '')}</option>`;
  const fillEmp = () => { $('repEmp').innerHTML = '<option value="">جميع الموظفين</option>' + dashEmployees($('repDept').value).map(e => `<option value="${esc(e.id)}">${esc(e.name)}</option>`).join(''); };
  fillEmp();
  $('repCat').innerHTML = '<option value="">جميع الإجراءات</option>' + STAGES.map(s => `<option>${esc(s)}</option>`).join('');
  $('repFrom').value = $('repTo').value = cairoDate();
  $('repTypes').onclick = e => { const b = e.target.closest('[data-rtype]'); if (!b) return; RP.type = b.dataset.rtype; $('repTypes').querySelectorAll('.rtype').forEach(x => x.classList.toggle('on', x === b)); $('repCatWrap').classList.toggle('hidden', RP.type !== 'actions'); $('repMsg').textContent = ''; };
  $('repRange').onclick = e => { const b = e.target.closest('button[data-r]'); if (!b) return; RP.range = b.dataset.r; $('repRange').querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b)); $('repCustom').classList.toggle('hidden', RP.range !== 'custom'); };
  $('repDept').onchange = fillEmp;
  $('repRun').onclick = runReport;
  $('repPrint').onclick = () => { document.body.classList.add('printrep'); setTimeout(() => { window.print(); }, 50); };
  window.addEventListener('afterprint', () => document.body.classList.remove('printrep'));
  $('repXls').onclick = repExcel;
  $('repClose').onclick = () => { $('repOut').classList.add('hidden'); document.querySelector('.repbuilder').classList.remove('hidden'); };
}
async function runReport() {
  const type = REP_TYPES.find(x => x.id === RP.type);
  const empId = $('repEmp').value, dept = $('repDept').value;
  if (type.needEmp && !empId) { $('repMsg').innerHTML = '<b class="red">يرجى اختيار الموظف لهذا التقرير</b>'; return; }
  const [from, to] = repPeriod();
  const btn = $('repRun'); btn.disabled = true; $('repMsg').textContent = 'جارٍ إعداد التقرير…';
  try {
    let html = '';
    if (type.id === 'support') { startSupport(); await new Promise(r => setTimeout(r, S.projects.size ? 0 : 1500)); html = repSupport(from, to, empId); }
    else {
      const n = daysBetween(from, to).length;
      const [pack, prev] = await Promise.all([loadPack(from, to), loadPack(addDays(from, -n), addDays(from, -1)).catch(() => null)]);
      const r = computeDash({ from, to, ...pack }, dept, empId); RP.cur = r;
      const pr = prev ? computeDash({ from: addDays(from, -n), to: addDays(from, -1), ...prev }, dept, empId) : null;
      RP.prev = pr;
      html = { team: repTeam, emp: repEmp, actions: repActions, att: repAtt, clients: repClients }[type.id](r, pr, empId);
    }
    const emp = state.employees.find(e => e.id === empId);
    const scope = emp ? emp.name : (dept || 'جميع الأقسام');
    RP.last = { type, from, to, scope };
    $('repDoc').innerHTML = repWrap(type.t, from, to, scope, html);
    document.querySelector('.repbuilder').classList.add('hidden');
    $('repOut').classList.remove('hidden'); $('repMsg').textContent = '';
    window.scrollTo({ top: 0, behavior: 'smooth' });
  } catch (e) { $('repMsg').innerHTML = `<b class="red">تعذّر إعداد التقرير: ${esc(e.message)}</b>`; }
  finally { btn.disabled = false; }
}
function repWrap(title, from, to, scope, body) {
  const now = new Intl.DateTimeFormat('ar-EG', { timeZone: TZ, dateStyle: 'long', timeStyle: 'short' }).format(new Date());
  const no = 'RPT-' + cairoDate().replace(/-/g, '') + '-' + String(Date.now()).slice(-4);
  return `<div class="rhead"><div class="org"><span class="logo"><i class="fa-solid fa-heart-pulse"></i></span><div><h2>${esc(title)}</h2><div class="sub">منصة نبضي — نظام إدارة علاقات العملاء</div></div></div>
    <div class="rmeta">رقم التقرير: <b>${no}</b><br>تاريخ الإصدار: ${esc(now)}<br>أعدّه: ${esc(actor())}</div></div>
    <div class="rinfo"><div>الفترة: <b>${from === to ? fmtDate(from) : `من ${fmtDate(from)} إلى ${fmtDate(to)}`}</b></div><div>عدد الأيام: <b>${daysBetween(from, to).length}</b></div><div>النطاق: <b>${esc(scope)}</b></div></div>
    ${body}
    <div class="rsign"><div>إعداد</div><div>مراجعة</div><div>اعتماد الإدارة</div></div>
    <div class="rfoot"><span>منصة نبضي — تقرير سري للاستخدام الداخلي</span><span>${no}</span></div>`;
}
const rk = (l, v, d = '') => `<div class="rkpi"><span>${l}</span><b>${v}</b>${d}</div>`;
function rdelta(a, b) { if (b == null) return ''; if (!b && !a) return '<em>—</em>'; if (!b) return '<em style="color:#16a34a">جديد</em>'; const d = Math.round((a - b) * 100 / b); return `<em style="color:${d >= 0 ? '#16a34a' : '#dc2626'}">${d > 0 ? '▲' : d < 0 ? '▼' : ''} ${Math.abs(d)}% عن الفترة السابقة</em>`; }
function kpiBlock(r, pr) {
  const k = r.k, p = pr?.k;
  return `<div class="rsec"><h3>المؤشرات الرئيسية <span class="muted small noprint" style="font-weight:600">(اضغط على أي مؤشر لعرض تقريره التفصيلي)</span></h3><div class="rkpis">${KPI_LIST.map(x => `<div class="rkpi click" data-kpi="${x.k}" data-src="rep"><span>${x.l}</span><b>${x.k === 'rate' ? k.rate + '%' : fmt(k[x.k])}</b>${rdelta(k[x.k], p?.[x.k])}</div>`).join('')}</div></div>`;
}
function summaryNote(r, pr) {
  const k = r.k, best = r.rows.find(x => x.n), parts = [];
  parts.push(`سُجِّل خلال الفترة <b>${fmt(k.n)}</b> إجراءً، بنسبة رد على المكالمات بلغت <b>${k.rate}%</b>`);
  if (pr) { const d = pr.k.n ? Math.round((k.n - pr.k.n) * 100 / pr.k.n) : null; if (d != null) parts.push(`${d >= 0 ? 'بزيادة' : 'بانخفاض'} قدرها <b>${Math.abs(d)}%</b> مقارنة بالفترة السابقة`); }
  if (best && r.rows.length > 1) parts.push(`وجاء <b>${esc(best.e.name)}</b> في المركز الأول بعدد <b>${fmt(best.n)}</b> إجراءً`);
  if (k.signed) parts.push(`وتم توقيع <b>${k.signed}</b> عقدًا`);
  return `<div class="rsec"><h3>الملخص التنفيذي</h3><div class="rnote">${parts.join('، ')}.</div></div>`;
}
function empTable(r) {
  const tot = f => r.rows.reduce((s, x) => s + x[f], 0), tc = tot('calls'), tn = tot('na');
  return `<div class="rsec"><h3>أداء الموظفين</h3><table class="rtbl"><thead><tr><th>#</th><th class="l">الموظف</th><th>القسم</th><th>أيام الحضور</th><th>ساعات العمل</th><th>الإجراءات</th><th>تم الرد</th><th>لم يُرد</th><th>نسبة الرد</th><th>واتساب</th><th>اجتماعات تمت</th><th>عقود مُرسلة</th><th>عقود موقّعة</th><th>عملاء جدد</th></tr></thead><tbody>
    ${r.rows.map((x, i) => `<tr><td>${i + 1}</td><td class="l"><b>${esc(x.e.name)}</b></td><td>${esc(x.e.department || '')}</td><td>${x.daysP}</td><td>${hrsTxt(x.work)}</td><td><b>${x.n}</b></td><td>${x.calls}</td><td>${x.na}</td><td>${x.calls + x.na ? x.rate + '%' : '—'}</td><td>${x.wa}</td><td>${x.meet}</td><td>${x.sent}</td><td>${x.signed}</td><td>${x.newC}</td></tr>`).join('')}
    <tr class="tot"><td></td><td class="l">الإجمالي</td><td></td><td>${tot('daysP')}</td><td>${hrsTxt(tot('work'))}</td><td>${tot('n')}</td><td>${tc}</td><td>${tn}</td><td>${pct(tc, tc + tn)}%</td><td>${tot('wa')}</td><td>${tot('meet')}</td><td>${tot('sent')}</td><td>${tot('signed')}</td><td>${tot('newC')}</td></tr></tbody></table></div>`;
}
function dailyTable(r) {
  const rows = r.byDay.filter(x => x.n || r.days.length <= 31);
  const T = r.T, c = (d, cat) => new Set(T.filter(t => t.date === d && ccat(t) === cat).map(t => t.clientId || plain(t.customer))).size;
  return `<div class="rsec"><h3>التوزيع اليومي</h3>${r.byDay.some(x => x.n) ? trendSvg(r.byDay) : ''}<table class="rtbl" style="margin-top:10px"><thead><tr><th class="l">اليوم</th><th>التاريخ</th><th>الإجراءات</th><th>تم الرد</th><th>لم يُرد</th><th>واتساب</th><th>اجتماعات تمت</th><th>عقود مُرسلة</th><th>عقود موقّعة</th></tr></thead><tbody>
    ${rows.map(x => `<tr><td class="l">${dayName(x.d)}</td><td>${fmtDate(x.d)}</td><td><b>${x.n}</b></td><td>${x.calls}</td><td>${x.na}</td><td>${x.wa}</td><td>${c(x.d, CAT.meet)}</td><td>${c(x.d, CAT.sent)}</td><td>${c(x.d, CAT.signed)}</td></tr>`).join('')}</tbody></table></div>`;
}
function funnelTable(r) {
  const tot = r.funnel.reduce((s, x) => s + x.n, 0);
  return `<div class="rsec"><h3>الإجراءات حسب مرحلة البيع</h3>${r.funnel.length ? `<table class="rtbl"><thead><tr><th class="l">المرحلة</th><th>العدد</th><th>النسبة</th></tr></thead><tbody>${r.funnel.map(x => `<tr><td class="l">${esc(x.s)}</td><td>${x.n}</td><td>${pct(x.n, tot)}%</td></tr>`).join('')}</tbody></table>` : '<div class="rempty">لا توجد بيانات</div>'}</div>`;
}
function cityTable(r) {
  return `<div class="rsec"><h3>أكثر المدن نشاطًا</h3>${r.cities.length ? `<table class="rtbl"><thead><tr><th class="l">المدينة</th><th>عدد الإجراءات</th><th>النسبة</th></tr></thead><tbody>${r.cities.map(([l, v]) => `<tr><td class="l">${esc(l)}</td><td>${v}</td><td>${pct(v, r.k.n)}%</td></tr>`).join('')}</tbody></table>` : '<div class="rempty">لا توجد بيانات</div>'}</div>`;
}
function actionsTable(T, title = 'تفاصيل الإجراءات') {
  const list = [...T].sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
  RP.rows = list;
  return `<div class="rsec"><h3>${title} (${list.length})</h3>${list.length ? `<table class="rtbl"><thead><tr><th>#</th><th>التاريخ</th><th>الوقت</th><th class="l">الموظف</th><th class="l">العميل</th><th>الجوال</th><th>المدينة</th><th>الإجراء</th><th class="l">الملاحظات</th><th>المتابعة التالية</th></tr></thead><tbody>${list.map((t, i) => `<tr><td>${i + 1}</td><td>${fmtDate(t.date)}</td><td>${esc(t.time || '')}</td><td class="l">${esc(t.agent || '')}</td><td class="l">${esc(t.customer || '')}</td><td dir="ltr">${esc(t.phone || '')}</td><td>${esc(t.city || '')}</td><td>${esc(t.category || '')}</td><td class="note">${esc(t.notes || '')}</td><td>${t.nextFollowUpDate ? fmtDate(t.nextFollowUpDate) + ' ' + esc(t.nextFollowUpTime || '') : '—'}</td></tr>`).join('')}</tbody></table>` : '<div class="rempty">لا توجد إجراءات خلال الفترة</div>'}</div>`;
}
function repTeam(r, pr) { RP.rows = null; RP.sheet = r; return summaryNote(r, pr) + kpiBlock(r, pr) + empTable(r) + dailyTable(r) + funnelTable(r) + cityTable(r); }
function repEmp(r, pr, empId) {
  const x = r.rows[0]; RP.sheet = r;
  const att = r.A.filter(a => r.match(a.employeeId, a.employeeName)?.id === empId).sort((a, b) => String(a.date).localeCompare(String(b.date)));
  const attHtml = `<div class="rsec"><h3>سجل الحضور</h3>${att.length ? `<table class="rtbl"><thead><tr><th class="l">اليوم</th><th>التاريخ</th><th>الحضور</th><th>الانصراف</th><th>الاستراحة</th><th>ساعات العمل</th></tr></thead><tbody>${att.map(a => { const m = attMetrics(a); return `<tr><td class="l">${dayName(a.date)}</td><td>${fmtDate(a.date)}</td><td>${fmtTime(a.checkInAt)}</td><td>${fmtTime(a.checkOutAt)}</td><td>${hrsTxt(m.brk)}</td><td><b>${hrsTxt(m.work)}</b></td></tr>`; }).join('')}<tr class="tot"><td class="l" colspan="5">الإجمالي (${att.length} يوم)</td><td>${hrsTxt(att.reduce((s, a) => s + attMetrics(a).work, 0))}</td></tr></tbody></table>` : '<div class="rempty">لا توجد سجلات حضور</div>'}</div>`;
  return summaryNote(r, pr) + kpiBlock(r, pr) + (x ? `<div class="rinfo"><div>القسم: <b>${esc(x.e.department || '—')}</b></div><div>أيام الحضور: <b>${x.daysP}</b></div><div>إجمالي ساعات العمل: <b>${hrsTxt(x.work)}</b></div><div>متوسط الإجراءات يوميًا: <b>${Math.round(x.n / Math.max(1, x.daysP || r.days.length) * 10) / 10}</b></div></div>` : '') + dailyTable(r) + attHtml + funnelTable(r) + actionsTable(r.T);
}
function repActions(r) { RP.sheet = null; const cat = $('repCat').value; const T = cat ? r.T.filter(t => (LEGACY[t.category] || t.category) === cat) : r.T; return actionsTable(T, cat ? `إجراءات «${cat}»` : 'تفاصيل الإجراءات'); }
function repAtt(r) {
  RP.sheet = null; RP.rows = null;
  const wd = r.days.filter(d => d <= cairoDate() && new Date(d + 'T12:00:00Z').getUTCDay() !== 5).length;
  const sum = `<div class="rsec"><h3>ملخص الحضور</h3><div class="rnote" style="margin-bottom:8px">أيام العمل المحتسبة خلال الفترة: <b>${wd}</b> يوم (باستثناء أيام الجمعة)</div><table class="rtbl"><thead><tr><th class="l">الموظف</th><th>القسم</th><th>أيام الحضور</th><th>أيام الغياب</th><th>إجمالي ساعات العمل</th><th>متوسط الساعات يوميًا</th></tr></thead><tbody>${r.rows.map(x => `<tr><td class="l"><b>${esc(x.e.name)}</b></td><td>${esc(x.e.department || '')}</td><td>${x.daysP}</td><td><b style="color:${wd - x.daysP > 0 ? '#dc2626' : 'inherit'}">${Math.max(0, wd - x.daysP)}</b></td><td>${hrsTxt(x.work)}</td><td>${x.daysP ? hrsTxt(x.work / x.daysP) : '—'}</td></tr>`).join('')}</tbody></table></div>`;
  const recs = [...r.A].sort((a, b) => String(a.date).localeCompare(String(b.date)) || String(a.employeeName).localeCompare(String(b.employeeName), 'ar'));
  RP.att = recs;
  const det = `<div class="rsec"><h3>السجل اليومي</h3>${recs.length ? `<table class="rtbl"><thead><tr><th>التاريخ</th><th class="l">الموظف</th><th>الحضور</th><th>الانصراف</th><th>الاستراحة</th><th>ساعات العمل</th></tr></thead><tbody>${recs.map(a => { const m = attMetrics(a); return `<tr><td>${fmtDate(a.date)}</td><td class="l">${esc(a.employeeName || '')}</td><td>${fmtTime(a.checkInAt)}</td><td>${fmtTime(a.checkOutAt)}</td><td>${hrsTxt(m.brk)}</td><td><b>${hrsTxt(m.work)}</b></td></tr>`; }).join('')}</tbody></table>` : '<div class="rempty">لا توجد سجلات</div>'}</div>`;
  return sum + det;
}
function repClients(r) {
  RP.sheet = null; RP.rows = null;
  const list = [...r.C].sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0)); RP.clients = list;
  const by = new Map(); list.forEach(c => by.set(c.addedBy || '—', (by.get(c.addedBy || '—') || 0) + 1));
  return `<div class="rsec"><h3>العملاء الجدد حسب الموظف</h3><table class="rtbl"><thead><tr><th class="l">الموظف</th><th>العدد</th></tr></thead><tbody>${[...by].sort((a, b) => b[1] - a[1]).map(([n, v]) => `<tr><td class="l">${esc(n)}</td><td>${v}</td></tr>`).join('') || '<tr><td colspan="2">لا يوجد</td></tr>'}<tr class="tot"><td class="l">الإجمالي</td><td>${list.length}</td></tr></tbody></table></div>
  <div class="rsec"><h3>قائمة العملاء (${list.length})</h3>${list.length ? `<table class="rtbl"><thead><tr><th>#</th><th>تاريخ التسجيل</th><th class="l">اسم الجهة</th><th>الجوال</th><th>المدينة</th><th>نوع الجهة</th><th>المرحلة الحالية</th><th class="l">سجّله</th></tr></thead><tbody>${list.map((c, i) => `<tr><td>${i + 1}</td><td>${fmtDate(cairoDate(new Date(c.createdAt)))}</td><td class="l">${esc(c.name)}</td><td dir="ltr">${esc(c.phone || '')}</td><td>${esc(c.city || '')}</td><td>${esc(c.entityType || '')}</td><td>${esc(normStage(c.stage))}</td><td class="l">${esc(c.addedBy || '')}</td></tr>`).join('')}</tbody></table>` : '<div class="rempty">لا يوجد عملاء جدد خلال الفترة</div>'}</div>`;
}
function repSupport(from, to, empId) {
  RP.sheet = null; RP.rows = null;
  const emp = state.employees.find(e => e.id === empId);
  const inR = iso => { if (!iso) return false; const d = cairoDate(new Date(iso)); return d >= from && d <= to; };
  const ps = liveProjects();
  const recv = ps.filter(p => inR(p.receivedAt) && (!emp || normName(p.receivedBy) === normName(emp.name)));
  const sent = ps.filter(p => inR(p.sentAt));
  const done = ps.filter(p => inR(p.completedAt) && (!emp || normName(p.completedBy) === normName(emp.name) || normName(p.receivedBy) === normName(emp.name)));
  const tasks = ps.flatMap(p => liveSTasks(p).map(t => ({ ...t, client: p.clientName })));
  const tDone = tasks.filter(t => isDoneSt(t.status) && inR(t.completedAt) && (!emp || normName(t.agent) === normName(emp.name)));
  const late = tasks.filter(t => taskLate(t) && (!emp || normName(t.agent) === normName(emp.name)));
  const board = new Map(); tDone.forEach(t => board.set(t.agent || '—', (board.get(t.agent || '—') || 0) + 1));
  RP.sup = { recv, done, late };
  const pRows = list => list.map((p, i) => `<tr><td>${i + 1}</td><td class="l">${esc(p.clientName || '')}</td><td>${esc(p.sender || '')}</td><td>${p.sentAt ? fmtDate(cairoDate(new Date(p.sentAt))) : '—'}</td><td>${esc(p.receivedBy || '—')}</td><td>${p.completedAt ? fmtDate(cairoDate(new Date(p.completedAt))) : '—'}</td><td>${esc(p.handoffStatus || '')}</td></tr>`).join('');
  const head = '<thead><tr><th>#</th><th class="l">العميل</th><th>أرسله</th><th>تاريخ الإرسال</th><th>المستلم</th><th>تاريخ التسليم</th><th>الحالة</th></tr></thead>';
  return `<div class="rsec"><h3>المؤشرات الرئيسية</h3><div class="rkpis">${rk('ملفات وردت للدعم', sent.length)}${rk('ملفات تم استلامها', recv.length)}${rk('ملفات تم تسليمها', done.length)}${rk('مهام منجزة', tDone.length)}${rk('مهام متأخرة حاليًا', late.length)}</div></div>
    <div class="rsec"><h3>إنجاز فريق الدعم (المهام المنجزة)</h3><table class="rtbl"><thead><tr><th class="l">الموظف</th><th>المهام المنجزة</th></tr></thead><tbody>${[...board].sort((a, b) => b[1] - a[1]).map(([n, v]) => `<tr><td class="l">${esc(n)}</td><td>${v}</td></tr>`).join('') || '<tr><td colspan="2">لا يوجد</td></tr>'}</tbody></table></div>
    <div class="rsec"><h3>الملفات المسلّمة للعملاء (${done.length})</h3>${done.length ? `<table class="rtbl">${head}<tbody>${pRows(done)}</tbody></table>` : '<div class="rempty">لا يوجد</div>'}</div>
    <div class="rsec"><h3>الملفات المستلمة (${recv.length})</h3>${recv.length ? `<table class="rtbl">${head}<tbody>${pRows(recv)}</tbody></table>` : '<div class="rempty">لا يوجد</div>'}</div>
    <div class="rsec"><h3>المهام المتأخرة (${late.length})</h3>${late.length ? `<table class="rtbl"><thead><tr><th>#</th><th class="l">العميل</th><th class="l">المهمة</th><th>المسؤول</th><th>تاريخ التسليم</th><th>الحالة</th></tr></thead><tbody>${late.map((t, i) => `<tr><td>${i + 1}</td><td class="l">${esc(t.client)}</td><td class="l">${esc(t.title)}</td><td>${esc(t.agent || '')}</td><td>${fmtDate(t.due)}</td><td>${esc(t.status || '')}</td></tr>`).join('')}</tbody></table>` : '<div class="rempty">لا توجد مهام متأخرة</div>'}</div>`;
}
function repExcel() {
  const L = RP.last; if (!L) return;
  // Excel = نفس جداول التقرير المعروض
  const doc = $('repDoc').cloneNode(true);
  doc.querySelectorAll('svg,.legend,.rsign').forEach(x => x.remove());
  doc.querySelectorAll('.rkpis').forEach(box => { const t = document.createElement('table'); t.className = 'rtbl'; t.innerHTML = '<tr>' + [...box.children].map(k => `<th>${k.querySelector('span')?.textContent || ''}</th>`).join('') + '</tr><tr>' + [...box.children].map(k => `<td>${k.querySelector('b')?.textContent || ''}</td>`).join('') + '</tr>'; box.replaceWith(t); });
  let out = `<table><tr><td colspan="8" style="font-size:18px;font-weight:bold;color:#5A3B8B">${esc(L.type.t)}</td></tr><tr><td colspan="8">الفترة: ${fmtDate(L.from)} - ${fmtDate(L.to)} · النطاق: ${esc(L.scope)}</td></tr></table>`;
  doc.querySelectorAll('.rsec').forEach(sec => { const h = sec.querySelector('h3')?.textContent || ''; out += `<br><table><tr><td colspan="8" style="font-size:14px;font-weight:bold;color:#5A3B8B">${esc(h)}</td></tr></table>`; const n = sec.querySelector('.rnote'); if (n) out += `<table><tr><td colspan="10">${esc(n.textContent)}</td></tr></table>`; sec.querySelectorAll('table.rtbl').forEach(t => { t.setAttribute('border', '1'); t.querySelectorAll('th').forEach(th => th.setAttribute('style', 'background:#5A3B8B;color:#fff')); t.querySelectorAll('td').forEach(td => td.setAttribute('style', "mso-number-format:'\\@'")); out += t.outerHTML; }); });
  const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel"><head><meta charset="UTF-8"><!--[if gte mso 9]><xml><x:ExcelWorkbook><x:ExcelWorksheets><x:ExcelWorksheet><x:Name>التقرير</x:Name><x:WorksheetOptions><x:DisplayRightToLeft/></x:WorksheetOptions></x:ExcelWorksheet></x:ExcelWorksheets></x:ExcelWorkbook></xml><![endif]--></head><body dir="rtl" style="font-family:Arial">${out}</body></html>`;
  const blob = new Blob(['﻿' + html], { type: 'application/vnd.ms-excel' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `${L.type.t}-${L.from}_${L.to}.xls`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}


// ================= مميزات منقولة من النسخة السابقة =================
const isMgr = () => accessOf(state.me) === 'manager';
const isSup = () => accessOf(state.me) === 'supervisor';
const sameEmp = (aName, aId, e) => (aId && e?.id && aId === e.id) || normName(aName) === normName(e?.name);
let storage = null; const getSt = () => storage || (storage = getStorage(app));

// ---------- 1) بيانات العميل الكاملة + المرفقات ----------
const DOC_KEYS = [['docMainName', 'مستند المنشأة / الاسم'], ['docContactPerson', 'مستند الشخص المسؤول'], ['docPhone', 'مستند رقم الجوال'], ['docAccountNum', 'مستند الحساب البنكي'], ['docIban', 'شهادة الآيبان'], ['docCommission', 'مستند العمولة'], ['docTradeName', 'العقد / الاسم التجاري'], ['docCr', 'السجل التجاري'], ['docVat', 'الشهادة الضريبية'], ['docSigner', 'تفويض التوقيع']];
const CF = { client: null, docs: {}, files: {} };
const canEditClient = c => !c || isMgr() || owns('clients', c);
function openClientForm(c = null) {
  if (c && !canEditClient(c)) { toast('هذا العميل تابع لموظف آخر ولا يمكن تعديله من حسابك', 'err'); return; }
  CF.client = c; CF.docs = JSON.parse(JSON.stringify(c?.docs || {})); CF.files = {};
  fillSelect('cfEntity', ENTITIES); fillSelect('cfCity', CITIES); fillSelect('cfStage', STAGES);
  const v = (id, val) => { $(id).value = val || ''; };
  $('cfTitle').textContent = c ? `تعديل بيانات: ${c.name}` : 'تسجيل عميل جديد';
  v('cfName', c?.name); v('cfContact', c?.contactPerson); v('cfPhone', c?.phone); v('cfNid', c?.nationalId); v('cfSpecialty', c?.specialty); v('cfStatusNote', c?.statusNote); v('cfAddress', c?.address); v('cfNotes', c?.notes);
  v('cfAccount', c?.accountNumber); v('cfIban', c?.iban); v('cfCommission', c?.commission); v('cfTrade', c?.contractTradeName); v('cfCr', c?.contractCrNumber); v('cfVat', c?.contractVatNumber); v('cfSigner', c?.contractSignerName);
  $('cfEntity').value = c?.entityType && ENTITIES.includes(c.entityType) ? c.entityType : ENTITIES[0];
  $('cfCity').value = c?.city && CITIES.includes(c.city) ? c.city : CITIES[0];
  $('cfStage').value = normStage(c?.stage);
  $('cfMsg').textContent = '';
  renderDocSlots();
  $('clientModal').classList.add('hidden');
  $('cfModal').classList.remove('hidden');
}
function renderDocSlots() {
  $('cfDocs').innerHTML = DOC_KEYS.map(([k, label]) => {
    const d = CF.docs[k], f = CF.files[k];
    const st = f ? `<span class="amber">سيُرفع عند الحفظ: ${esc(f.name)}</span>` : d?.url ? `<a href="${esc(d.url)}" target="_blank" rel="noopener" class="btn line sm"><i class="fa-solid fa-eye"></i> عرض ${esc(d.name || '')}</a>` : d?.localId ? `<span class="muted">${esc(d.name || 'ملف')} — محفوظ على جهاز آخر ولم يُرفع بعد</span>` : '<span class="muted">لا يوجد ملف</span>';
    return `<div class="docitem"><b>${label}</b><div class="row">${st}</div><div class="row"><label class="btn line sm" style="margin:0"><i class="fa-solid fa-paperclip"></i> ${d || f ? 'استبدال' : 'إرفاق'}<input type="file" data-docf="${k}" accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx"></label>${d || f ? `<button class="btn danger sm" data-docdel="${k}">إزالة</button>` : ''}</div></div>`;
  }).join('');
}
async function uploadDoc(file, clientId, key) {
  const seg = s => String(s || '').replace(/[^a-zA-Z0-9_.-]/g, '_').slice(0, 80);
  const path = `artifacts/${APP_ID}/clients/${seg(clientId)}/${key}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}_${seg(file.name)}`;
  const ref = storageRef(getSt(), path);
  const task = uploadBytesResumable(ref, file, { contentType: file.type || 'application/octet-stream', customMetadata: { clientId: String(clientId), fieldKey: key, uploadedBy: auth.currentUser?.uid || '' } });
  await new Promise((res, rej) => { const to = setTimeout(() => { try { task.cancel(); } catch (e) {} rej(new Error('استغرق رفع الملف وقتًا أطول من المسموح')); }, 60000); task.on('state_changed', null, e => { clearTimeout(to); rej(e); }, () => { clearTimeout(to); res(); }); });
  const url = await getDownloadURL(task.snapshot.ref);
  const kb = file.size / 1024;
  return { name: file.name, size: kb > 1024 ? (kb / 1024).toFixed(1) + ' MB' : Math.round(kb) + ' KB', sizeBytes: file.size, type: file.type || 'application/octet-stream', url, storagePath: path, uploadedAt: Date.now() };
}
async function saveClientForm() {
  const msg = $('cfMsg'); msg.className = 'msg err';
  const c = CF.client, me = state.me, now = Date.now();
  const name = $('cfName').value.trim(), phone = $('cfPhone').value.trim(), nid = digits($('cfNid').value);
  if (!name || digits(phone).length < 8) { msg.textContent = 'يرجى إدخال اسم المنشأة ورقم جوال صحيح'; return; }
  if (nid && !/^[12]\d{9}$/.test(nid)) { msg.textContent = 'رقم الهوية / الإقامة يجب أن يتكون من 10 أرقام ويبدأ بـ 1 أو 2'; return; }
  const btn = $('cfSave'); btn.disabled = true; btn.textContent = 'جارٍ الحفظ…';
  try {
    const city = $('cfCity').value;
    if (!c) {
      const existing = await withTimeout(findExistingClient(name, phone), 10000, 'الاتصال بطيء، يرجى المحاولة مرة أخرى');
      if (existing.length) throw new Error(`هذا العميل مسجّل مسبقًا باسم ${existing[0].addedBy || 'موظف آخر'}`);
    }
    const id = c?.id || canonicalClientId(name, phone, city), docId = c?._docId || id;
    const docs = { ...CF.docs };
    for (const [k, f] of Object.entries(CF.files)) { btn.textContent = `جارٍ رفع ${f.name}…`; docs[k] = await uploadDoc(f, id, k); }
    const stage = $('cfStage').value;
    const data = { id, name, contactPerson: $('cfContact').value.trim(), phone, nationalId: nid, entityType: $('cfEntity').value, specialty: $('cfSpecialty').value.trim(), city, stage, address: $('cfAddress').value.trim(), notes: $('cfNotes').value.trim(), statusNote: $('cfStatusNote').value.trim(), accountNumber: $('cfAccount').value.trim(), iban: $('cfIban').value.trim().replace(/\s+/g, '').toUpperCase(), commission: $('cfCommission').value.trim(), contractTradeName: $('cfTrade').value.trim(), contractCrNumber: $('cfCr').value.trim(), contractVatNumber: $('cfVat').value.trim(), contractSignerName: $('cfSigner').value.trim(), docs, updatedAt: now };
    if (c && data.statusNote !== String(c.statusNote || '').trim()) { data.statusUpdatedAt = now; data.statusUpdatedBy = actor(); }
    if (c && normStage(c.stage) !== stage) { const h = Array.isArray(c.stageHistory) ? c.stageHistory.slice() : []; h.push({ stage, at: new Date(now).toISOString(), by: actor() }); data.stageHistory = h; data.stageUpdatedAt = new Date(now).toISOString(); }
    if (!c) Object.assign(data, { addedBy: me.name, addedById: me.id, createdAt: now, registeredAt: now, stageHistory: [{ stage, at: new Date(now).toISOString() }] });
    await withTimeout(setDoc(doc(col('clients'), docId), data, { merge: true }), 15000, 'تأخر الحفظ، يرجى المحاولة مرة أخرى');
    const merged = { ...(c || {}), ...data, _docId: docId };
    if (state.clients.has(docId) || !c) state.clients.set(docId, merged);
    if (all.clients.has(docId)) all.clients.set(docId, merged);
    if (!c) {
      const tid = `task_${now}_${Math.random().toString(36).slice(2, 7)}`;
      const t = { id: tid, clientId: id, time: cairoTime(), date: cairoDate(), shift: me.shift || '', agent: me.name, agentId: me.id, customer: name, phone, entityType: data.entityType, specialty: data.specialty, city, category: 'تسجيل جهة جديدة', channel: 'نظام نبضي', priority: 'عادية', status: 'مكتمل', activityType: 'client_registration', isClientRegistration: true, createdAt: now, updatedAt: now, affectsFunnel: false, affectsFollowUp: false, clientStatusNote: data.statusNote, notes: 'تم تسجيل بيانات الجهة في النظام.' + (data.notes ? ' ملاحظات: ' + data.notes : ''), source: 'v2' };
      setDoc(doc(col('tasks'), tid), t).then(() => { state.tasks.set(tid, { ...t, _docId: tid }); render(); }).catch(() => {});
    }
    $('cfModal').classList.add('hidden');
    toast(c ? '✓ تم حفظ بيانات العميل' : '✓ تم تسجيل العميل بنجاح', 'ok');
    render(); if (state.tab === 'allclients') renderAllClients();
    if (stage === 'إرفاق رابط Google Drive بالبيانات' || stage === 'إرسال البيانات إلى الدعم الفني') setTimeout(() => openHandoff(merged), 200);
  } catch (e) { msg.textContent = e.message || 'تعذّر الحفظ'; }
  finally { btn.disabled = false; btn.textContent = 'حفظ بيانات العميل'; }
}
async function deleteClient(c) {
  if (!c) return;
  if (!canEditClient(c)) { toast('لا يمكنك حذف عميل تابع لموظف آخر', 'err'); return; }
  if (!confirm(`هل تريد حذف العميل «${c.name}» وجميع إجراءاته نهائيًا؟`)) return;
  const deletedAt = new Date().toISOString(), upd = Date.now(), by = actor();
  try {
    const ids = [...new Set([c.id, c._docId].filter(Boolean))];
    const ts = new Map();
    for (const id of ids) { try { (await getDocs(query(col('tasks'), where('clientId', '==', id)))).forEach(d => ts.set(d.id, 1)); } catch (e) {} }
    for (const tid of ts.keys()) { await setDoc(doc(col('tasks'), tid), { id: tid, deletedAt, updatedAt: upd, deletedBy: by }, { merge: true }); const t = state.tasks.get(tid); if (t) t.deletedAt = deletedAt; }
    try { (await getDocs(query(col('supportProjects'), where('clientId', '==', c.id)))).forEach(d => setDoc(doc(col('supportProjects'), d.id), { id: d.id, deletedAt, updatedAt: upd, deletedBy: by }, { merge: true })); } catch (e) {}
    await setDoc(doc(col('clients'), c._docId || c.id), { id: c.id, deletedAt, updatedAt: upd, deletedBy: by }, { merge: true });
    state.clients.delete(c._docId); all.clients.delete(c._docId);
    $('clientModal').classList.add('hidden'); toast('✓ تم حذف العميل', 'ok'); render(); if (state.tab === 'allclients') renderAllClients();
  } catch (e) { toast('تعذّر الحذف: ' + e.message, 'err'); }
}
async function deleteTask(t) {
  if (!t) return;
  if (!isMgr() && !sameEmp(t.agent, t.agentId, state.me)) { toast('يمكنك حذف الإجراءات المسجلة باسمك فقط', 'err'); return; }
  if (!confirm('هل تريد حذف هذا الإجراء نهائيًا؟')) return;
  try {
    const id = t._docId || t.id;
    await setDoc(doc(col('tasks'), id), { id: t.id, deletedAt: new Date().toISOString(), updatedAt: Date.now(), deletedBy: actor() }, { merge: true });
    const lt = state.tasks.get(id); if (lt) lt.deletedAt = new Date().toISOString();
    toast('✓ تم حذف الإجراء', 'ok'); $('clientModal').classList.add('hidden'); render();
  } catch (e) { toast('تعذّر الحذف: ' + e.message, 'err'); }
}
function editTask(t) {
  if (!t) return;
  if (!isMgr() && !sameEmp(t.agent, t.agentId, state.me)) { toast('يمكنك تعديل الإجراءات المسجلة باسمك فقط', 'err'); return; }
  const c = findClientForTask(t) || { id: t.clientId, _docId: t.clientId, name: t.customer, phone: t.phone, stage: t.category };
  openAction(c);
  state.editTask = t;
  $('actionTitle').textContent = 'تعديل إجراء';
  $('aCategory').value = STAGES.includes(normStage(t.category)) ? normStage(t.category) : STAGES[0];
  $('aChannel').value = CHANNELS.includes(t.channel) ? t.channel : CHANNELS[0];
  $('aStatus').value = STATUSES.includes(t.status) ? t.status : STATUSES[0];
  $('aPriority').value = PRIORITIES.includes(t.priority) ? t.priority : PRIORITIES[0];
  $('aNotes').value = t.notes || ''; $('aStatusNote').value = t.clientStatusNote || ''; $('aNextDate').value = t.nextFollowUpDate || ''; $('aNextTime').value = t.nextFollowUpTime || '';
  $('clientModal').classList.add('hidden');
}
async function saveEditedTask() {
  const t = state.editTask, msg = $('aMsg'); msg.className = 'msg err';
  const nextDate = $('aNextDate').value, nextTime = $('aNextTime').value;
  if (nextTime && !nextDate) { msg.textContent = 'يرجى تحديد تاريخ المتابعة أولًا'; return; }
  const btn = $('aSave'); btn.disabled = true;
  try {
    const id = t._docId || t.id;
    const upd = { category: $('aCategory').value, channel: $('aChannel').value, status: $('aStatus').value, priority: $('aPriority').value, notes: $('aNotes').value.trim(), clientStatusNote: $('aStatusNote').value.trim(), nextFollowUpDate: nextDate, nextFollowUpTime: nextTime, updatedAt: Date.now(), editedBy: actor(), editedAt: new Date().toISOString() };
    await withTimeout(setDoc(doc(col('tasks'), id), upd, { merge: true }), 12000, 'تأخر الحفظ، يرجى المحاولة مرة أخرى');
    state.tasks.set(id, { ...t, ...upd });
    $('actionModal').classList.add('hidden'); toast('✓ تم تعديل الإجراء', 'ok'); render();
  } catch (e) { msg.textContent = e.message; } finally { btn.disabled = false; state.editTask = null; }
}

// ---------- 2) إدارة الموظفين ----------
let EM = null;
function openEmp(e = null) {
  EM = e;
  $('emTitle').textContent = e ? `تعديل: ${e.name}` : 'إضافة موظف';
  $('emName').value = e?.name || ''; $('emDept').value = deptOf(e) === 'الدعم الفني' ? 'الدعم الفني' : (String(e?.department || '').includes('إدارة') ? 'الإدارة' : 'خدمات العملاء');
  $('emLevel').value = e ? accessOf(e) : 'employee'; $('emShift').value = e?.shift === 'شفت مسائي' ? 'شفت مسائي' : 'شفت صباحي';
  $('emPin').value = ''; $('emPinWrap').classList.toggle('hidden', !!e); $('emMsg').textContent = '';
  $('empModal').classList.remove('hidden');
}
async function saveEmp() {
  const msg = $('emMsg'); msg.className = 'msg err';
  const name = $('emName').value.trim(), pin = $('emPin').value.trim();
  if (!name) { msg.textContent = 'يرجى كتابة اسم الموظف'; return; }
  if (!EM && !/^\d{6,12}$/.test(pin)) { msg.textContent = 'رمز الدخول يجب أن يتكون من 6 أرقام على الأقل'; return; }
  if (!EM && state.employees.some(x => normName(x.name) === normName(name))) { msg.textContent = 'يوجد موظف مسجّل بنفس الاسم'; return; }
  const level = $('emLevel').value;
  const data = EM ? { ...EM, name, shift: $('emShift').value, department: level === 'manager' ? 'الإدارة' : $('emDept').value, accessLevel: level, updatedAt: Date.now() } : { id: 'emp_' + Date.now(), name, shift: $('emShift').value, department: level === 'manager' ? 'الإدارة' : $('emDept').value, accessLevel: level, pin, createdAt: Date.now(), updatedAt: Date.now() };
  delete data._docId; delete data._syncAt;
  $('emSave').disabled = true;
  try {
    const docId = EM?._docId || data.id;
    await withTimeout(setDoc(doc(col('employees'), docId), data, { merge: true }), 12000, 'تأخر الحفظ، يرجى المحاولة مرة أخرى');
    const i = state.employees.findIndex(x => x.id === data.id);
    if (i >= 0) state.employees[i] = { ...data, _docId: docId }; else state.employees.push({ ...data, _docId: docId });
    $('empModal').classList.add('hidden'); toast(EM ? '✓ تم حفظ بيانات الموظف' : `✓ تمت إضافة ${name}`, 'ok'); renderAccounts();
  } catch (e) { msg.textContent = e.message; } finally { $('emSave').disabled = false; }
}
async function deleteEmp(e) {
  if (!e || !confirm(`هل تريد حذف الموظف «${e.name}»؟ لن تُحذف إجراءاته السابقة.`)) return;
  try {
    await setDoc(doc(col('employees'), e._docId || e.id), { id: e.id, deletedAt: new Date().toISOString(), updatedAt: Date.now(), deletedBy: actor() }, { merge: true });
    state.employees = state.employees.filter(x => x.id !== e.id); toast('✓ تم حذف الموظف', 'ok'); renderAccounts();
  } catch (er) { toast('تعذّر الحذف: ' + er.message, 'err'); }
}

// ---------- 3) تغيير رمز الدخول ----------
async function savePin() {
  const msg = $('pnMsg'); msg.className = 'msg err';
  const me = state.employees.find(e => e.id === state.me.id) || state.me;
  const cur = $('pnCur').value.trim(), nw = $('pnNew').value.trim(), cf = $('pnConf').value.trim();
  if (cur !== String(me.pin || '').trim()) { msg.textContent = 'الرمز الحالي غير صحيح'; return; }
  if (!/^\d{6,12}$/.test(nw)) { msg.textContent = 'الرمز الجديد يجب أن يتكون من 6 أرقام على الأقل'; return; }
  if (nw !== cf) { msg.textContent = 'تأكيد الرمز غير مطابق'; return; }
  $('pnSave').disabled = true;
  try {
    if (auth.currentUser && auth.currentUser.email === staffEmailFor(me)) await updatePassword(auth.currentUser, `nb-${nw}`);
    await setDoc(doc(col('employees'), me._docId || me.id), { pin: nw, updatedAt: Date.now() }, { merge: true });
    me.pin = nw; state.me.pin = nw;
    $('pinModal').classList.add('hidden'); toast('✓ تم تغيير رمز الدخول', 'ok');
  } catch (e) { msg.textContent = e?.code === 'auth/requires-recent-login' ? 'لأسباب أمنية، يرجى تسجيل الخروج ثم الدخول مرة أخرى قبل تغيير الرمز' : ('تعذّر تغيير الرمز: ' + (e.message || e)); }
  finally { $('pnSave').disabled = false; }
}

// ---------- 4) المهام المسندة ----------
const IT = { map: new Map(), unsub: null, scope: 'open', editing: null, actOn: null };
const isInternal = t => t && t.taskType === 'internal' && !t.deletedAt;
const curLog = t => (t.activityLog || []).filter(l => !t.assignmentStartedAt || Date.parse(l.at) >= Date.parse(t.assignmentStartedAt));
const itAccepted = t => Boolean(t.acceptedAt || curLog(t).some(l => !['تعديل الإسناد', 'إعادة إسناد المهمة'].includes(l.type)));
function itState(t) {
  if (t.status === 'مكتمل' || t.status === 'مكتملة' || t.completedAt) return 'مكتملة';
  if (t.date && t.date < cairoDate()) return 'متأخرة';
  return itAccepted(t) ? 'جاري التنفيذ' : 'جديدة';
}
const IT_CLS = { 'مكتملة': 'done', 'متأخرة': 'ret', 'جاري التنفيذ': 'recv', 'جديدة': 'wait' };
function myInternalTasks() { return [...state.tasks.values()].filter(t => isInternal(t) && sameEmp(t.agent, t.agentId, state.me)); }
function startItasks() {
  if (IT.unsub) return;
  IT.unsub = onSnapshot(query(col('tasks'), where('taskType', '==', 'internal')), snap => {
    snap.docChanges().forEach(ch => { if (ch.type === 'removed') IT.map.delete(ch.doc.id); else { const d = ch.doc.data(); IT.map.set(ch.doc.id, { ...d, id: d.id || ch.doc.id, _docId: ch.doc.id }); } });
    if (state.tab === 'itasks') renderItasks(); updateBell();
  }, () => {});
}
function itScopeEmployees() {
  if (isMgr()) return state.employees.filter(e => !e.deletedAt);
  return state.employees.filter(e => deptOf(e) === deptOf(state.me) && accessOf(e) === 'employee');
}
function itCard(t, mine) {
  const st = itState(t), log = curLog(t);
  const btns = [];
  if (mine && st !== 'مكتملة') {
    if (!itAccepted(t)) btns.push(`<button class="btn primary sm" data-itact="accept|${esc(t._docId)}"><i class="fa-solid fa-hand"></i> استلام المهمة</button>`);
    else { btns.push(`<button class="btn line sm" data-itact="act|${esc(t._docId)}"><i class="fa-solid fa-comment-dots"></i> إضافة إجراء</button>`); btns.push(`<button class="btn ok sm" data-itact="done|${esc(t._docId)}"><i class="fa-solid fa-circle-check"></i> إنهاء المهمة</button>`); }
  }
  if (!mine && (isMgr() || isSup())) { btns.push(`<button class="btn line sm" data-itact="edit|${esc(t._docId)}"><i class="fa-solid fa-pen"></i> تعديل</button>`); btns.push(`<button class="btn danger sm" data-itact="del|${esc(t._docId)}"><i class="fa-solid fa-trash"></i> حذف</button>`); }
  return `<div class="it"><div class="ih"><div><h4>${esc(t.title || t.notes || 'مهمة')}</h4><div class="small muted">${mine ? `من: ${esc(t.assignedBy || 'الإدارة')}` : `المستلم: <b>${esc(t.agent || '')}</b> · ${esc(t.department || '')}`} · التسليم: ${fmtDate(t.date)}${t.priority && t.priority !== 'عادية' ? ` · <b class="amber">${esc(t.priority)}</b>` : ''}</div></div><span class="hs ${IT_CLS[st]}">${st}</span></div>
    ${t.description ? `<div class="small" style="margin-top:6px;white-space:pre-wrap">${esc(t.description)}</div>` : ''}
    ${log.length ? `<div class="log">${log.slice(-4).map(l => `<div><b>${esc(l.type)}</b> — ${esc(l.comment || '')} <span class="muted">(${esc(l.by || '')} · ${l.at ? esc(new Date(l.at).toLocaleString('ar-EG', { timeZone: TZ, dateStyle: 'short', timeStyle: 'short' })) : ''})</span></div>`).join('')}</div>` : ''}
    ${t.finalResult ? `<div class="rnote" style="margin-top:6px"><b>النتيجة النهائية:</b> ${esc(t.finalResult)}</div>` : ''}
    ${btns.length ? `<div class="pact">${btns.join('')}</div>` : ''}</div>`;
}
function renderMyItasks() {
  const list = myInternalTasks().sort((a, b) => (itState(a) === 'مكتملة') - (itState(b) === 'مكتملة') || String(a.date).localeCompare(String(b.date)));
  const open = list.filter(t => itState(t) !== 'مكتملة');
  $('cMyIt').textContent = open.length;
  $('myItList').innerHTML = list.length ? list.slice(0, 30).map(t => itCard(t, true)).join('') : '<div class="empty">لا توجد مهام مسندة إليك</div>';
}
function renderItasks() {
  const emps = itScopeEmployees(), allowed = new Set(emps.map(e => e.id));
  const empSel = $('itEmp').value, q = plain($('itSearch').value);
  let list = [...IT.map.values()].filter(t => isInternal(t) && (isMgr() || emps.some(e => sameEmp(t.agent, t.agentId, e))));
  const k = { all: list.length, nw: list.filter(t => itState(t) === 'جديدة').length, run: list.filter(t => itState(t) === 'جاري التنفيذ').length, late: list.filter(t => itState(t) === 'متأخرة').length, done: list.filter(t => itState(t) === 'مكتملة').length };
  const kp = (l, v, c) => `<div class="kpi" style="--c:${c}"><span>${l}</span><b>${v}</b></div>`;
  $('itKpis').innerHTML = kp('إجمالي المهام', k.all, '#5A3B8B') + kp('لم تُستلم', k.nw, '#f59e0b') + kp('جاري التنفيذ', k.run, '#7c3aed') + kp('متأخرة', k.late, '#dc2626') + kp('مكتملة', k.done, '#16a34a') + kp('نسبة الإنجاز', pct(k.done, k.all) + '%', '#0d9488');
  if (empSel) { const e = state.employees.find(x => x.id === empSel); list = list.filter(t => sameEmp(t.agent, t.agentId, e)); }
  if (q) list = list.filter(t => plain(t.title).includes(q) || plain(t.description).includes(q) || plain(t.agent).includes(q));
  list = list.filter(t => { const st = itState(t); return IT.scope === 'all' || (IT.scope === 'open' && st !== 'مكتملة') || (IT.scope === 'new' && st === 'جديدة') || (IT.scope === 'late' && st === 'متأخرة') || (IT.scope === 'done' && st === 'مكتملة'); });
  list.sort((a, b) => String(a.date).localeCompare(String(b.date)));
  $('itList').innerHTML = list.length ? list.slice(0, 200).map(t => itCard(t, false)).join('') : '<div class="card empty">لا توجد مهام</div>';
}
function openItask(t = null) {
  IT.editing = t;
  const emps = itScopeEmployees();
  $('itAssignee').innerHTML = emps.map(e => `<option value="${esc(e.id)}">${esc(e.name)} — ${esc(deptOf(e) || e.department || '')}</option>`).join('');
  $('itTitleH').textContent = t ? 'تعديل المهمة المسندة' : 'إسناد مهمة';
  const ae = t && state.employees.find(e => sameEmp(t.agent, t.agentId, e)); if (ae) $('itAssignee').value = ae.id;
  $('itTitle').value = t?.title || ''; $('itDesc').value = t?.description || ''; $('itDue').value = t?.date || cairoDate(); $('itPriority').value = t?.priority || 'عادية'; $('itMsg').textContent = '';
  $('itModal').classList.remove('hidden');
}
async function saveItask() {
  const msg = $('itMsg'); msg.className = 'msg err';
  const emp = state.employees.find(e => e.id === $('itAssignee').value), title = $('itTitle').value.trim(), date = $('itDue').value, desc = $('itDesc').value.trim();
  if (!emp || !title || !date) { msg.textContent = 'يرجى إكمال المستلم وعنوان المهمة وتاريخ التسليم'; return; }
  const old = IT.editing, now = new Date().toISOString();
  const same = old && sameEmp(old.agent, old.agentId, emp);
  if (old && !same && itState(old) === 'مكتملة') { msg.textContent = 'المهمة مكتملة؛ لإسناد عمل جديد أنشئ مهمة جديدة'; return; }
  const dept = deptOf(emp) || emp.department || 'خدمات العملاء';
  const t = { ...(old || {}), id: old?.id || 'task_' + (crypto.randomUUID ? crypto.randomUUID() : Date.now()), taskType: 'internal', department: dept, agent: emp.name, agentId: emp.id, date, time: old?.time || cairoTime(), shift: emp.shift || 'شفت صباحي', customer: 'مهمة داخلية — ' + dept, phone: '-', entityType: 'مهمة داخلية', specialty: dept, city: '-', category: 'مهمة داخلية', channel: 'نظام نبضي', priority: $('itPriority').value, title, description: desc, notes: title + (desc ? ' — ' + desc : ''), status: old?.status || 'جديدة', activityLog: [...(old?.activityLog || [])], updatedAt: Date.now() };
  if (!old) { t.assignedBy = actor(); t.assignedById = state.me.id; t.createdAt = Date.now(); }
  else { t.activityLog.push({ type: same ? 'تعديل الإسناد' : 'إعادة إسناد المهمة', comment: same ? 'تم تعديل تفاصيل المهمة' : `تم تغيير المستلم من ${old.agent} إلى ${emp.name}`, by: actor(), at: now }); if (!same) { t.status = 'جديدة'; t.assignmentStartedAt = now; ['acceptedAt', 'acceptedBy', 'startedAt', 'completedAt', 'completedBy', 'finalResult'].forEach(k => delete t[k]); } }
  delete t._docId; delete t._syncAt;
  $('itSave').disabled = true;
  try {
    const id = old?._docId || t.id;
    await withTimeout(setDoc(doc(col('tasks'), id), t), 12000, 'تأخر الحفظ، يرجى المحاولة مرة أخرى');
    IT.map.set(id, { ...t, _docId: id }); $('itModal').classList.add('hidden'); toast(old ? '✓ تم حفظ التعديل' : `✓ تم إسناد المهمة إلى ${emp.name}`, 'ok'); renderItasks();
  } catch (e) { msg.textContent = e.message; } finally { $('itSave').disabled = false; }
}
async function mutateTask(id, fn) {
  const ref = doc(col('tasks'), id);
  const snap = await withTimeout(getDoc(ref), 10000, 'الاتصال بطيء، يرجى المحاولة مرة أخرى');
  if (!snap.exists()) throw new Error('المهمة غير موجودة');
  const t = JSON.parse(JSON.stringify(snap.data())); if (fn(t) === false) return;
  delete t._syncAt; t.updatedAt = Date.now();
  await withTimeout(setDoc(ref, t), 12000, 'تأخر الحفظ، يرجى المحاولة مرة أخرى');
  const v = { ...t, id: t.id || id, _docId: id };
  if (state.tasks.has(id)) state.tasks.set(id, v); if (IT.map.has(id)) IT.map.set(id, v);
  renderMyItasks(); if (state.tab === 'itasks') renderItasks(); updateBell();
}
async function itAction(kind, id) {
  const t = state.tasks.get(id) || IT.map.get(id); if (!t) return;
  try {
    const now = new Date().toISOString(), by = actor();
    if (kind === 'accept') { await mutateTask(id, x => { x.activityLog = [...(x.activityLog || []), { type: 'استلام المهمة', comment: 'تم استلام المهمة', by, at: now }]; x.acceptedAt = now; x.acceptedBy = by; x.status = 'تم الاستلام'; }); markRead('it:' + id); toast('✓ تم استلام المهمة', 'ok'); }
    else if (kind === 'act') { IT.actOn = id; $('iaTask').textContent = t.title || ''; $('iaComment').value = ''; $('iaMsg').textContent = ''; $('itActModal').classList.remove('hidden'); }
    else if (kind === 'done') {
      if (!(t.activityLog || []).length) { toast('يرجى إضافة إجراء على المهمة قبل إنهائها', 'err'); return; }
      const res = prompt('اكتب النتيجة النهائية للمهمة:'); if (!res || !res.trim()) return;
      await mutateTask(id, x => { x.activityLog = [...(x.activityLog || []), { type: 'إنهاء المهمة', comment: res.trim(), by, at: now }]; x.finalResult = res.trim(); x.status = 'مكتمل'; x.completedBy = by; x.completedAt = now; });
      toast('✓ تم إنهاء المهمة', 'ok');
    }
    else if (kind === 'edit') openItask(t);
    else if (kind === 'del') { if (!confirm('هل تريد حذف المهمة المسندة نهائيًا؟')) return; await setDoc(doc(col('tasks'), id), { id: t.id, deletedAt: now, updatedAt: Date.now(), deletedBy: by }, { merge: true }); IT.map.delete(id); renderItasks(); toast('✓ تم حذف المهمة', 'ok'); }
  } catch (e) { toast(e.message, 'err'); }
}
async function saveItAct() {
  const c = $('iaComment').value.trim(); if (!c) { $('iaMsg').className = 'msg err'; $('iaMsg').textContent = 'يرجى كتابة التعليق'; return; }
  $('iaSave').disabled = true;
  try { await mutateTask(IT.actOn, x => { x.activityLog = [...(x.activityLog || []), { type: $('iaType').value, comment: c, by: actor(), at: new Date().toISOString() }]; x.status = 'قيد المعالجة'; x.startedAt = x.startedAt || new Date().toISOString(); }); $('itActModal').classList.add('hidden'); toast('✓ تم حفظ الإجراء', 'ok'); }
  catch (e) { $('iaMsg').textContent = e.message; } finally { $('iaSave').disabled = false; }
}

// ---------- 5) ملاحظات يومي ----------
const NT = { doc: null };
const noteId = () => `${String(state.me.id).replace(/[^a-zA-Z0-9_-]/g, '_')}_${cairoDate()}`;
async function loadNotes() { try { const s = await getDoc(doc(col('dailyNotes'), noteId())); NT.doc = s.exists() ? s.data() : { items: [] }; } catch (e) { NT.doc = NT.doc || { items: [] }; } renderNotes(); }
function renderNotes() {
  const items = (NT.doc?.items || []).filter(i => !i.deletedAt), done = items.filter(i => i.done).length;
  $('cNotes').textContent = `${done}/${items.length}`;
  $('noteList').innerHTML = items.length ? items.map(i => `<div class="note ${i.done ? 'done' : ''}"><button class="iconbtn" data-note="toggle|${esc(i.id)}" title="تم"><i class="fa-solid ${i.done ? 'fa-square-check' : 'fa-square'}"></i></button><span>${esc(i.text)}</span><button class="iconbtn" data-note="edit|${esc(i.id)}" title="تعديل"><i class="fa-solid fa-pen"></i></button><button class="iconbtn" data-note="del|${esc(i.id)}" title="حذف"><i class="fa-solid fa-trash"></i></button></div>`).join('') : '<div class="empty">لا توجد ملاحظات لليوم</div>';
}
async function saveNotes(items) {
  const payload = { ...(NT.doc || {}), items, id: noteId(), ownerId: state.me.id, ownerName: state.me.name, date: cairoDate(), updatedAt: new Date().toISOString() };
  delete payload._syncAt;
  await withTimeout(setDoc(doc(col('dailyNotes'), noteId()), payload), 10000, 'تأخر الحفظ'); NT.doc = payload; renderNotes();
}
async function noteAction(kind, id) {
  const items = (NT.doc?.items || []).slice();
  try {
    if (kind === 'add') { const v = $('noteInput').value.trim(); if (!v) return; items.push({ id: 'note_' + Date.now(), text: v, done: false, createdAt: new Date().toISOString() }); await saveNotes(items); $('noteInput').value = ''; }
    else if (kind === 'toggle') await saveNotes(items.map(i => i.id === id ? { ...i, done: !i.done, completedAt: !i.done ? new Date().toISOString() : '' } : i));
    else if (kind === 'edit') { const it = items.find(i => i.id === id); const v = prompt('تعديل الملاحظة:', it?.text || ''); if (v === null || !v.trim()) return; await saveNotes(items.map(i => i.id === id ? { ...i, text: v.trim(), editedAt: new Date().toISOString() } : i)); }
    else if (kind === 'del') { if (!confirm('هل تريد حذف هذه الملاحظة؟')) return; await saveNotes(items.map(i => i.id === id ? { ...i, deletedAt: new Date().toISOString() } : i)); }
  } catch (e) { toast('تعذّر الحفظ: ' + e.message, 'err'); }
}

// ---------- 6) نشرات الدعم ----------
const BL = { list: [], unsub: null };
const canSeeBulletins = () => isMgr() || isSupport(state.me);
const canPublish = () => isMgr() || (isSup() && isSupport(state.me));
function startBulletins() {
  if (BL.unsub || !canSeeBulletins()) return;
  BL.unsub = onSnapshot(query(col('tasks'), where('taskType', '==', 'support_bulletin')), s => { BL.list = []; s.forEach(d => { const x = d.data(); if (!x.deletedAt) BL.list.push({ ...x, _docId: d.id }); }); BL.list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)); renderBulletins(); updateBell(); }, () => {});
}
function renderBulletins() {
  if (!$('bulList')) return;
  $('bulForm').classList.toggle('hidden', !canPublish());
  $('bulList').innerHTML = BL.list.length ? BL.list.slice(0, 30).map(b => `<div class="item" style="cursor:default"><div class="t">${esc(b.title)}</div><div class="s" style="white-space:pre-wrap">${esc(b.message)}</div><div class="s">${esc(b.assignedBy || '')} · ${b.createdAt ? esc(new Date(b.createdAt).toLocaleString('ar-EG', { timeZone: TZ, dateStyle: 'medium', timeStyle: 'short' })) : ''}</div></div>`).join('') : '<div class="empty">لا توجد نشرات</div>';
}
async function publishBulletin() {
  const title = $('bulTitle').value.trim(), message = $('bulMsg').value.trim(); if (!title || !message) { toast('يرجى كتابة العنوان والنص', 'err'); return; }
  const r = { id: 'bulletin_' + (crypto.randomUUID ? crypto.randomUUID() : Date.now()), taskType: 'support_bulletin', department: 'الدعم الفني', title, message, assignedBy: actor(), createdAt: Date.now() };
  try { await withTimeout(setDoc(doc(col('tasks'), r.id), r), 10000, 'تأخر الحفظ'); $('bulTitle').value = ''; $('bulMsg').value = ''; toast('✓ تم نشر التعميم', 'ok'); } catch (e) { toast(e.message, 'err'); }
}

// ---------- 7) الإشعارات ----------
const readKey = () => `v2_read_${state.me?.id}`;
const getRead = () => { try { return new Set(JSON.parse(localStorage.getItem(readKey()) || '[]')); } catch (e) { return new Set(); } };
function markRead(k) { const s = getRead(); s.add(k); localStorage.setItem(readKey(), JSON.stringify([...s].slice(-500))); updateBell(); }
function bellItems() {
  const out = [];
  if (state.me?.id !== 'manager') for (const t of myInternalTasks()) if (itState(t) !== 'مكتملة') out.push({ key: 'it:' + t._docId, title: `مهمة مسندة: ${t.title || ''}`, sub: `من ${t.assignedBy || 'الإدارة'} · التسليم ${fmtDate(t.date)}`, at: t.createdAt || 0, go: () => setTab('today') });
  if (isMgr() || isSup()) for (const t of IT.map.values()) if (isInternal(t)) { const l = (t.activityLog || []).slice(-1)[0]; if (l && !['تعديل الإسناد', 'إعادة إسناد المهمة'].includes(l.type) && Date.now() - Date.parse(l.at) < 7 * 864e5) out.push({ key: 'itl:' + t._docId + ':' + l.at, title: `${l.type}: ${t.title || ''}`, sub: `${l.by || ''} — ${l.comment || ''}`, at: Date.parse(l.at), go: () => setTab('itasks') }); }
  if (canSeeBulletins()) for (const b of BL.list.slice(0, 10)) out.push({ key: 'bul:' + b._docId, title: `تعميم: ${b.title}`, sub: b.assignedBy || '', at: b.createdAt || 0, go: () => setTab('support') });
  return out.sort((a, b) => b.at - a.at).slice(0, 40);
}
function updateBell() {
  if (!state.me) return;
  const r = getRead(), items = bellItems(), n = items.filter(i => !r.has(i.key)).length;
  $('bellCount').textContent = n; $('bellCount').classList.toggle('hidden', !n);
  if (!$('bellPanel').classList.contains('hidden')) $('bellList').innerHTML = items.length ? items.map((i, x) => `<div class="bitem ${r.has(i.key) ? '' : 'unread'}" data-bell="${x}"><div><b>${esc(i.title)}</b></div><div class="s">${esc(i.sub)}</div></div>`).join('') : '<div class="empty">لا توجد إشعارات</div>';
  BELL_ITEMS = items;
}
let BELL_ITEMS = [];


const KPI_LIST = [
  { k: 'n', l: 'إجمالي الإجراءات', c: '#5A3B8B', f: () => true },
  { k: 'calls', l: 'مكالمات تم الرد عليها', c: '#16a34a', f: t => ccat(t) === CAT.call },
  { k: 'na', l: 'مكالمات لم يُرد عليها', c: '#f59e0b', f: t => ccat(t) === CAT.na },
  { k: 'rate', l: 'نسبة الرد', c: '#0d9488', f: t => ccat(t) === CAT.call || ccat(t) === CAT.na },
  { k: 'wa', l: 'رسائل واتساب', c: '#2563eb', f: t => ccat(t) === CAT.wa },
  { k: 'meetSet', l: 'اجتماعات تم الاتفاق عليها', c: '#a855f7', f: t => ccat(t) === CAT.meetSet, uniq: true },
  { k: 'meet', l: 'اجتماعات تمت', c: '#7c3aed', f: t => ccat(t) === CAT.meet, uniq: true },
  { k: 'sent', l: 'عقود مُرسلة', c: '#ea580c', f: t => ccat(t) === CAT.sent, uniq: true },
  { k: 'signed', l: 'عقود موقّعة', c: '#dc2626', f: t => ccat(t) === CAT.signed, uniq: true },
  { k: 'newC', l: 'عملاء جدد', c: '#0891b2', clients: true },
  { k: 'touched', l: 'عملاء تم التواصل معهم', c: '#64748b', touched: true }
];
function dedupe(list) { const seen = new Set(); return list.filter(t => { const key = (t.clientId || plain(t.customer)) + '|' + t.date; if (seen.has(key)) return false; seen.add(key); return true; }); }
function kpiReportHtml(def, r, pr) {
  const k = r.k, p = pr?.k;
  const head = `<div class="rsec"><h3>الملخص</h3><div class="rkpis">${rk(def.l, def.k === 'rate' ? k.rate + '%' : fmt(k[def.k]), rdelta(k[def.k], p?.[def.k]))}${p ? rk('الفترة السابقة', def.k === 'rate' ? p.rate + '%' : fmt(p[def.k])) : ''}${def.uniq ? rk('ملاحظة', '<span style="font-size:12px">يُحتسب العميل مرة واحدة في اليوم</span>') : ''}</div></div>`;
  if (def.clients) return head + repClients(r);
  const byEmp = new Map();
  let list;
  if (def.touched) {
    const m = new Map(); [...r.T].sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0)).forEach(t => m.set(t.clientId || plain(t.customer), t));
    list = [...m.values()];
    list.forEach(t => byEmp.set(t.agent || '—', (byEmp.get(t.agent || '—') || 0) + 1));
    const empT = `<div class="rsec"><h3>حسب الموظف</h3><table class="rtbl"><thead><tr><th class="l">الموظف</th><th>عدد العملاء</th><th>النسبة</th></tr></thead><tbody>${[...byEmp].sort((a, b) => b[1] - a[1]).map(([n, v]) => `<tr><td class="l">${esc(n)}</td><td>${v}</td><td>${pct(v, list.length)}%</td></tr>`).join('')}</tbody></table></div>`;
    RP.rows = list;
    return head + empT + `<div class="rsec"><h3>قائمة العملاء (${list.length}) — آخر إجراء خلال الفترة</h3><table class="rtbl"><thead><tr><th>#</th><th class="l">العميل</th><th>الجوال</th><th>المدينة</th><th class="l">الموظف</th><th>آخر إجراء</th><th>التاريخ</th></tr></thead><tbody>${list.map((t, i) => `<tr><td>${i + 1}</td><td class="l">${esc(t.customer || '')}</td><td dir="ltr">${esc(t.phone || '')}</td><td>${esc(t.city || '')}</td><td class="l">${esc(t.agent || '')}</td><td>${esc(t.category || '')}</td><td>${fmtDate(t.date)}</td></tr>`).join('')}</tbody></table></div>`;
  }
  list = r.T.filter(def.f); if (def.uniq) list = dedupe(list);
  list.forEach(t => byEmp.set(t.agent || '—', (byEmp.get(t.agent || '—') || 0) + 1));
  const empRows = [...byEmp].sort((a, b) => b[1] - a[1]);
  let empT;
  if (def.k === 'rate') {
    const per = new Map(); list.forEach(t => { const x = per.get(t.agent || '—') || { c: 0, n: 0 }; ccat(t) === CAT.call ? x.c++ : x.n++; per.set(t.agent || '—', x); });
    empT = `<div class="rsec"><h3>نسبة الرد حسب الموظف</h3><table class="rtbl"><thead><tr><th class="l">الموظف</th><th>تم الرد</th><th>لم يُرد</th><th>إجمالي المكالمات</th><th>نسبة الرد</th></tr></thead><tbody>${[...per].sort((a, b) => pct(b[1].c, b[1].c + b[1].n) - pct(a[1].c, a[1].c + a[1].n)).map(([n, x]) => `<tr><td class="l">${esc(n)}</td><td>${x.c}</td><td>${x.n}</td><td>${x.c + x.n}</td><td><b>${pct(x.c, x.c + x.n)}%</b></td></tr>`).join('')}</tbody></table></div>`;
  } else empT = `<div class="rsec"><h3>حسب الموظف</h3><table class="rtbl"><thead><tr><th class="l">الموظف</th><th>العدد</th><th>النسبة من الإجمالي</th></tr></thead><tbody>${empRows.map(([n, v]) => `<tr><td class="l">${esc(n)}</td><td>${v}</td><td>${pct(v, list.length)}%</td></tr>`).join('') || '<tr><td colspan="3">لا يوجد</td></tr>'}<tr class="tot"><td class="l">الإجمالي</td><td>${list.length}</td><td>100%</td></tr></tbody></table></div>`;
  let dayT = '';
  if (r.days.length > 1) { const dm = new Map(); list.forEach(t => dm.set(t.date, (dm.get(t.date) || 0) + 1)); dayT = `<div class="rsec"><h3>حسب اليوم</h3><table class="rtbl"><thead><tr><th class="l">اليوم</th><th>التاريخ</th><th>العدد</th></tr></thead><tbody>${r.days.filter(d => dm.get(d)).map(d => `<tr><td class="l">${dayName(d)}</td><td>${fmtDate(d)}</td><td>${dm.get(d)}</td></tr>`).join('') || '<tr><td colspan="3">لا يوجد</td></tr>'}</tbody></table></div>`; }
  return head + empT + dayT + actionsTable(list, `تفاصيل ${def.l}`);
}
function openKpiReport(key, src) {
  const def = KPI_LIST.find(x => x.k === key); if (!def) return;
  const r = src === 'dash' ? D.last : RP.cur, pr = src === 'dash' ? (D.prev ? computeDash(D.prev) : null) : RP.prev;
  if (!r) return;
  const scope = src === 'dash' ? (state.employees.find(e => e.id === $('dashEmp').value)?.name || $('dashDept').value || (accessOf(state.me) === 'employee' ? state.me.name : 'جميع الأقسام')) : (RP.last?.scope || '');
  const title = `تقرير ${def.l}`;
  RP.last = { type: { t: title }, from: r.from, to: r.to, scope };
  $('repDoc').innerHTML = repWrap(title, r.from, r.to, scope, kpiReportHtml(def, r, pr));
  if (state.tab !== 'reports') setTab('reports');
  document.querySelector('.repbuilder').classList.add('hidden');
  $('repOut').classList.remove('hidden');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}


// ---------- التحقق من رقم قبل التواصل ----------
async function lookupPhone(phone) {
  const vs = phoneVariants(phone); if (!vs.length) return [];
  const s = await withTimeout(getDocs(query(col('clients'), where('phone', 'in', vs))), 10000, 'الاتصال بطيء، يرجى المحاولة مرة أخرى');
  const out = []; s.forEach(d => { const c = d.data(); if (!c.deletedAt) out.push({ ...c, id: c.id || d.id, _docId: d.id }); });
  return out;
}
async function checkPhone(box) {
  const inp = box.querySelector('.chkPhone'), res = box.querySelector('.chkRes'), phone = inp.value.trim();
  if (digits(phone).length < 9) { res.innerHTML = '<div class="chkres-box taken"><i class="fa-solid fa-circle-exclamation"></i><div>يرجى كتابة رقم جوال صحيح</div></div>'; return; }
  res.innerHTML = '<div class="muted small" style="margin-top:8px">جارٍ البحث في جميع عملاء الشركة…</div>';
  try {
    const found = await lookupPhone(phone);
    const mine = found.find(c => owns('clients', c)), other = found.find(c => !owns('clients', c));
    if (isMgr() && found.length) { res.innerHTML = found.map(c => `<div class="chkres-box mine"><i class="fa-solid fa-circle-info"></i><div>الرقم مسجّل للعميل «${esc(c.name)}» لدى الموظف <b>${esc(c.addedBy || '—')}</b><div class="s">المرحلة: ${esc(normStage(c.stage))}${c.createdAt ? ' · تاريخ التسجيل: ' + fmtDate(cairoDate(new Date(c.createdAt))) : ''}</div></div></div>`).join(''); return; }
    if (mine) { res.innerHTML = `<div class="chkres-box mine"><i class="fa-solid fa-user-check"></i><div>هذا الرقم من عملائك: «${esc(mine.name)}»<div class="s">المرحلة الحالية: ${esc(normStage(mine.stage))}</div><button class="btn primary sm" style="margin-top:6px" data-chkopen="${esc(mine._docId)}">فتح ملف العميل</button></div></div>`; state.clients.has(mine._docId) || state.clients.set(mine._docId, mine); return; }
    if (other) { res.innerHTML = `<div class="chkres-box taken"><i class="fa-solid fa-ban"></i><div>هذا الرقم مسجّل لدى الموظف <b>${esc(other.addedBy || 'موظف آخر')}</b>${other.createdAt ? ' منذ ' + fmtDate(cairoDate(new Date(other.createdAt))) : ''}<div class="s">لا يمكنك التواصل معه أو تسجيله باسمك. إذا كان هناك سبب للتحويل، يرجى الرجوع إلى المشرف.</div></div></div>`; return; }
    res.innerHTML = `<div class="chkres-box ok"><i class="fa-solid fa-circle-check"></i><div>الرقم غير مسجّل لدى أي موظف — يمكنك التواصل معه<div class="s">بعد التواصل، سجّل الإجراء ليُحفظ العميل باسمك.</div><button class="btn primary sm" style="margin-top:6px" data-chknew="${esc(phone)}">تسجيل إجراء لهذا الرقم</button></div></div>`;
  } catch (e) { res.innerHTML = `<div class="chkres-box taken"><i class="fa-solid fa-triangle-exclamation"></i><div>${esc(e.message)}</div></div>`; }
}
async function checkActionPhone() {
  const el = $('aPhoneChk'), phone = $('aPhone').value.trim();
  if (state.actionClient || digits(phone).length < 9) { el.textContent = ''; return; }
  el.className = 'small muted'; el.textContent = 'جارٍ التحقق من الرقم…';
  try {
    const found = await lookupPhone(phone);
    const mine = found.find(c => owns('clients', c)), other = found.find(c => !owns('clients', c));
    if (mine) { el.className = 'small'; el.style.color = '#1e40af'; el.textContent = `هذا الرقم من عملائك: «${mine.name}» — اختره من البحث بالأعلى`; }
    else if (other) { el.className = 'small'; el.style.color = '#be123c'; el.textContent = `⛔ هذا الرقم مسجّل لدى الموظف ${other.addedBy || 'آخر'} — لا يمكن تسجيله باسمك`; }
    else { el.className = 'small'; el.style.color = '#15803d'; el.textContent = '✓ الرقم غير مسجّل لدى أي موظف'; }
  } catch (e) { el.textContent = ''; }
}

// ---------------- التشغيل ----------------
function startApp(emp) {
  state.me = emp;
  $('loginView').classList.add('hidden'); $('appView').classList.remove('hidden');
  $('whoName').textContent = emp.name;
  $('whoAvatar').textContent = String(emp.name || '؟').trim().charAt(0);
  const lvl = accessOf(emp);
  if (lvl !== 'employee') {
    $('teamTabBtn').classList.remove('hidden');
    document.querySelectorAll('.mgrsup,.mgrsec').forEach(b => b.classList.remove('hidden'));
    document.querySelector('.agentrep').classList.add('hidden');
    if (lvl === 'manager' || isSupport(emp)) { document.querySelector('.supnav').classList.remove('hidden'); startSupport(); }
    setupDash();
    setupReports();
    startItasks();
    $('itEmp').innerHTML = '<option value="">جميع الموظفين</option>' + itScopeEmployees().map(e => `<option value="${esc(e.id)}">${esc(e.name)}</option>`).join('');
    const depts = [...new Set(state.employees.map(e => e.department).filter(Boolean))];
    $('teamDept').innerHTML = lvl === 'manager' ? '<option value="">جميع الأقسام</option>' + depts.map(d => `<option>${esc(d)}</option>`).join('') : `<option>${esc(emp.department || '')}</option>`;
    $('teamDate').value = cairoDate();
    $('allLogDate').value = cairoDate();
    $('allLogEmp').innerHTML = '<option value="">جميع الموظفين</option>' + state.employees.filter(e => lvl === 'manager' || e.department === emp.department).map(e => `<option value="${esc(e.id)}">${esc(e.name)}</option>`).join('');
    if (lvl === 'manager') document.querySelectorAll('.tab.mgr').forEach(b => b.classList.remove('hidden'));
  }
  if (emp.id === 'manager') {
    document.querySelectorAll('.tab').forEach(b => { if (!['dash', 'reports', 'itasks', 'support', 'accounts', 'team', 'allclients', 'alllog'].includes(b.dataset.tab) || b.classList.contains('agentrep')) b.classList.add('hidden'); });
    document.querySelector('.agentsec').classList.add('hidden');
    $('attBtn').classList.add('hidden'); $('pinBtn').classList.add('hidden'); $('syncBar').textContent = '';
    startBulletins();
    setTab('dash');
    getDocs(col('authAccounts')).then(s => { s.forEach(d => ACC.map.set(d.id, d.data())); renderAccounts(); }).catch(() => {});
    return;
  }
  if (lvl === 'employee') setupDash();
  loadNotes(); startBulletins();
  if (isSupport(emp)) { document.querySelector('.supnav').classList.remove('hidden'); startSupport(); setTab('support'); } else setTab('today');
  syncMsg();
  loadAttendance();
  syncCollection('clients').catch(e => { $('syncBar').textContent = 'تعذر تحميل العملاء: ' + e.message; $('syncBar').classList.add('err'); });
  syncCollection('tasks').catch(e => { $('syncBar').textContent = 'تعذر تحميل الإجراءات: ' + e.message; $('syncBar').classList.add('err'); });
}
function setTab(tab) {
  state.tab = tab;
  document.querySelectorAll('.tab').forEach(b => b.classList.toggle('on', b.dataset.tab === tab));
  document.body.classList.remove('menu');
  ['dash', 'reports', 'itasks', 'support', 'accounts', 'today', 'clients', 'log', 'team', 'allclients', 'alllog'].forEach(t => $('tab-' + t).classList.toggle('hidden', t !== tab));
  if (tab === 'team') startTeam(); else { teamUnsubs.forEach(u => u()); teamUnsubs = []; }
  if (tab === 'allclients') loadAllClients();
  if (tab === 'dash') loadDash();
  if (tab === 'accounts') loadAccounts();
  if (tab === 'itasks') { startItasks(); renderItasks(); }
  if (tab === 'support') { startBulletins(); renderBulletins(); }
  if (tab === 'support') { startSupport(); renderSupport(); }
  if (tab === 'alllog') startAllLog(); else if (all.dayUnsub) { all.dayUnsub(); all.dayUnsub = null; }
  render();
}

fillSelect('aCity', CITIES); fillSelect('aEntity', ENTITIES); fillSelect('aCategory', STAGES); fillSelect('aChannel', CHANNELS); fillSelect('aStatus', STATUSES); fillSelect('aPriority', PRIORITIES);
$('loginBtn').onclick = login;
$('googleBtn').onclick = googleLogin;
$('loginPin').addEventListener('keydown', e => { if (e.key === 'Enter') login(); });
$('logoutBtn').onclick = logout;
$('menuBtn').onclick = () => document.body.classList.toggle('menu');
$('backdrop').onclick = () => document.body.classList.remove('menu');
document.querySelectorAll('.tab').forEach(b => { b.onclick = () => setTab(b.dataset.tab); });
document.querySelectorAll('[data-close]').forEach(b => { b.onclick = () => $(b.dataset.close).classList.add('hidden'); });
$('newActionBtn').onclick = () => openAction(null);
$('attBtn').onclick = () => { $('attMsg').textContent = ''; renderAttendance(); $('attModal').classList.remove('hidden'); loadAttendance(); };
$('attIn').onclick = () => attAction('in');
$('attBreak').onclick = () => attAction('break');
$('attBack').onclick = () => attAction('back');
$('attOut').onclick = () => { if (confirm('هل تريد تأكيد تسجيل الانصراف وإنهاء الدوام؟')) attAction('out'); };
$('aSearch').addEventListener('input', searchMatches);
$('aSave').onclick = saveAction;
$('clientSearch').addEventListener('input', render);
$('logDate').addEventListener('change', render);
$('teamDate').addEventListener('change', startTeam);
$('teamDept').addEventListener('change', startTeam);
$('allSearch').addEventListener('input', renderAllClients);
$('allLogDate').addEventListener('change', startAllLog);
$('allLogEmp').addEventListener('change', renderAllLog);
$('supSearch').addEventListener('input', renderSupport);
$('supScope').onclick = e => { const b = e.target.closest('button[data-s]'); if (!b) return; S.scope = b.dataset.s; $('supScope').querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b)); renderSupport(); };
$('supAddTask').onclick = () => openSupTask('', '');
$('stSave').onclick = saveSupTask;
$('hoSave').onclick = saveHandoff;
$('cfSave').onclick = saveClientForm;
['cPeriod', 'cBasis', 'cFrom', 'cTo'].forEach(id => $(id).addEventListener('change', () => { $('cCustom').classList.toggle('hidden', $('cPeriod').value !== 'custom'); renderClients(); }));
document.querySelectorAll('.chkcard').forEach(box => { box.querySelector('.chkBtn').onclick = () => checkPhone(box); box.querySelector('.chkPhone').addEventListener('keydown', e => { if (e.key === 'Enter') checkPhone(box); }); });
$('aPhone').addEventListener('blur', checkActionPhone);
$('aPhone').addEventListener('input', () => { clearTimeout(window._apt); window._apt = setTimeout(checkActionPhone, 700); });
$('newClientBtn').onclick = () => openClientForm(null);
$('empAdd').onclick = () => openEmp(null);
$('emSave').onclick = saveEmp;
$('pinBtn').onclick = () => { ['pnCur', 'pnNew', 'pnConf'].forEach(i => { $(i).value = ''; }); $('pnMsg').textContent = ''; $('pinModal').classList.remove('hidden'); };
$('pnSave').onclick = savePin;
$('itNew').onclick = () => openItask(null);
$('itSave').onclick = saveItask;
$('iaSave').onclick = saveItAct;
$('itScope').onclick = e => { const b = e.target.closest('button[data-s]'); if (!b) return; IT.scope = b.dataset.s; $('itScope').querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b)); renderItasks(); };
$('itEmp').onchange = renderItasks; $('itSearch').oninput = renderItasks;
$('noteAdd').onclick = () => noteAction('add');
$('noteInput').addEventListener('keydown', e => { if (e.key === 'Enter') noteAction('add'); });
$('bulSave').onclick = publishBulletin;
$('bellBtn').onclick = e => { e.stopPropagation(); $('bellPanel').classList.toggle('hidden'); updateBell(); };
$('bellRead').onclick = () => { const s = getRead(); BELL_ITEMS.forEach(i => s.add(i.key)); localStorage.setItem(readKey(), JSON.stringify([...s].slice(-500))); updateBell(); };
document.addEventListener('change', e => { const f = e.target.closest('[data-docf]'); if (f && f.files[0]) { if (f.files[0].size > 15 * 1024 * 1024) { toast('حجم الملف أكبر من 15 ميجابايت', 'err'); return; } CF.files[f.dataset.docf] = f.files[0]; renderDocSlots(); } });
document.addEventListener('change', e => { const s = e.target.closest('[data-stst]'); if (s) { const [pid, tid] = s.dataset.stst.split('|'); setSupTaskStatus(pid, tid, s.value); } });
document.addEventListener('click', e => {
  if (!e.target.closest('#bellPanel') && !e.target.closest('#bellBtn')) $('bellPanel').classList.add('hidden');
  const bi = e.target.closest('[data-bell]'); if (bi) { const it = BELL_ITEMS[+bi.dataset.bell]; if (it) { markRead(it.key); $('bellPanel').classList.add('hidden'); it.go(); } return; }
  const dd = e.target.closest('[data-docdel]'); if (dd) { delete CF.docs[dd.dataset.docdel]; delete CF.files[dd.dataset.docdel]; renderDocSlots(); return; }
  const te = e.target.closest('[data-tedit]'); if (te) { editTask(state.tasks.get(te.dataset.tedit) || [...state.tasks.values()].find(t => t.id === te.dataset.tedit)); return; }
  const td = e.target.closest('[data-tdel]'); if (td) { deleteTask(state.tasks.get(td.dataset.tdel) || [...state.tasks.values()].find(t => t.id === td.dataset.tdel)); return; }
  const ia = e.target.closest('[data-itact]'); if (ia) { const [k, id] = ia.dataset.itact.split('|'); itAction(k, id); return; }
  const nt = e.target.closest('[data-note]'); if (nt) { const [k, id] = nt.dataset.note.split('|'); noteAction(k, id); return; }
  const ee = e.target.closest('[data-emedit]'); if (ee) { openEmp(state.employees.find(x => x.id === ee.dataset.emedit)); return; }
  const ed = e.target.closest('[data-emdel]'); if (ed) { deleteEmp(state.employees.find(x => x.id === ed.dataset.emdel)); return; }
  const cst = e.target.closest('[data-cst]'); if (cst) { window._cStage = cst.dataset.cst; renderClients(); return; }
  const co = e.target.closest('[data-chkopen]'); if (co) { openClient(state.clients.get(co.dataset.chkopen)); return; }
  const cn = e.target.closest('[data-chknew]'); if (cn) { openAction(null); $('aPhone').value = cn.dataset.chknew; checkActionPhone(); return; }
  const kc = e.target.closest('[data-kpi]'); if (kc) { openKpiReport(kc.dataset.kpi, kc.dataset.src); return; }
  const mk = e.target.closest('[data-mkacc]'); if (mk) { makeAccount(mk.dataset.mkacc); return; }
  const pt = e.target.closest('[data-ptoggle]'); if (pt) { const id = pt.dataset.ptoggle; S.open.has(id) ? S.open.delete(id) : S.open.add(id); renderSupport(); return; }
  const pa = e.target.closest('[data-pact]'); if (pa) { const [k, id] = pa.dataset.pact.split('|'); projAction(k, id); return; }
  const se = e.target.closest('[data-stedit]'); if (se) { const [pid, tid] = se.dataset.stedit.split('|'); openSupTask(pid, tid); return; }
  const er = e.target.closest('[data-emp]'); if (er) { showEmployeeDay(er.dataset.emp); return; }
  const ac = e.target.closest('[data-allclient]'); if (ac) { openAnyClient(all.clients.get(ac.dataset.allclient)); return; }
  const lt = e.target.closest('[data-logtask]'); if (lt) { const t = all.dayTasks.get(lt.dataset.logtask); if (t) { const c = [...all.clients.values()].find(c => c.id === t.clientId || c._docId === t.clientId); if (c) openAnyClient(c); else if (t.clientId) getDocs(query(col('clients'), where('id', '==', t.clientId))).then(s => { s.forEach(d => putDoc(all.clients, d)); openAnyClient([...all.clients.values()].find(c => c.id === t.clientId)); }).catch(() => {}); } return; }
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



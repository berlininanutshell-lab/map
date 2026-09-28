/* contact.js — live chat with the author.
   Load it AFTER the main inline <script> in index.html (it uses the globals
   auth, db, state, sidebarTab, showAuthOverlay and ADMIN_EMAILS from there).

   Data model (Firestore):
     chats/{uid}                 one conversation per reader
     chats/{uid}/messages/{id}   the messages of that conversation
   Who can see what is enforced by Firestore rules (see firestore-chat.rules),
   not by this file: a reader can only ever read their own chat, the admin
   can read all of them. */
(function () {
  'use strict';

  const tabBtn = document.getElementById('contactTabBtn');
  const view = document.getElementById('contactView');
  const badge = document.getElementById('contactTabBadge');
  if (!tabBtn || !view) return;
  if (typeof auth === 'undefined' || !auth || typeof db === 'undefined' || !db) {
    tabBtn.hidden = true; // Firebase not available -> no chat
    return;
  }

  const AUTHOR_NAME = 'Что по фронту?';
  const AUTHOR_SUB = "Direct chat with the map's author";
  const MAX_LEN = 1000;        // reader message length (also enforced in rules)
  const ADMIN_MAX_LEN = 2000;  // admin reply length (also enforced in rules)
  const COOLDOWN_MS = 4000;    // rules enforce >= 3 s between messages
  const HOURLY_LIMIT = 30;     // rules enforce 30 messages / hour / reader
  const MAX_LINKS = 2;
  const HOUR_MS = 3600000;

  const chatsRef = db.collection('chats');
  const FV = firebase.firestore.FieldValue;

  const cc = {
    mode: null, user: null, verified: false, isAdmin: false, ui: {},
    chat: null, messages: [],
    chats: [], search: '', threadUid: null,
    unsubChat: null, unsubMsgs: null, unsubList: null,
    lastText: '', lastSentAt: 0,
    marking: false, autoMailed: false
  };

  // ---------- small helpers ----------
  function h(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  function toDate(ts) {
    if (!ts) return null;
    if (typeof ts.toDate === 'function') return ts.toDate();
    return ts instanceof Date ? ts : null;
  }
  function sameDay(a, b) {
    return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  }
  function fmtTime(d) {
    return d ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
  }
  function fmtDay(d) {
    const now = new Date();
    if (sameDay(d, now)) return 'Today';
    const y = new Date(now); y.setDate(now.getDate() - 1);
    if (sameDay(d, y)) return 'Yesterday';
    return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  }
  function fmtListTime(d) {
    if (!d) return '';
    return sameDay(d, new Date()) ? fmtTime(d) : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }
  function chatName(c) {
    return c.name || (c.email || '').split('@')[0] || 'User';
  }
  function isActive() {
    return typeof sidebarTab !== 'undefined' && sidebarTab === 'contact' && !document.hidden;
  }

  function updateBadge() {
    let n = 0;
    if (cc.verified) {
      n = cc.isAdmin
        ? cc.chats.reduce((sum, c) => sum + (c.unreadAdmin || 0), 0)
        : (cc.chat ? (cc.chat.unreadUser || 0) : 0);
    }
    badge.hidden = n <= 0;
    badge.textContent = n > 99 ? '99+' : String(n);
  }

  // ---------- message list ----------
  function renderMessages(container, msgs, opts) {
    const nearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 80;
    const first = !container.dataset.filled;
    container.textContent = '';
    if (!msgs.length) {
      container.appendChild(h('div', 'cc-empty', opts.empty));
      return;
    }
    let prev = null;
    msgs.forEach((m) => {
      const d = toDate(m.createdAt);
      if (d && (!prev || !sameDay(prev, d))) {
        container.appendChild(h('div', 'cc-day', fmtDay(d)));
        prev = d;
      }
      const mine = m.from === opts.mine;
      const bubble = h('div', 'cc-msg ' + (mine ? 'mine' : 'theirs'));
      if (!mine) bubble.appendChild(h('div', 'cc-msg-who', opts.theirName));
      bubble.appendChild(h('div', 'cc-msg-text', m.text)); // textContent -> no XSS
      bubble.appendChild(h('div', 'cc-msg-time', fmtTime(d)));
      container.appendChild(bubble);
    });
    container.dataset.filled = '1';
    if (first || nearBottom) container.scrollTop = container.scrollHeight;
  }

  // ---------- composer (textarea + honeypot + send button) ----------
  function buildComposer(opts) {
    const c = { locked: false, busy: false, until: 0, timer: null };
    const max = opts.admin ? ADMIN_MAX_LEN : MAX_LEN;

    const root = h('div', 'cc-composer');
    const status = h('div', 'cc-status');
    status.setAttribute('aria-live', 'polite');

    let hp = null;
    if (!opts.admin) {
      // Honeypot: invisible to people, bots tend to fill it in.
      hp = h('input', 'cc-hp');
      hp.type = 'text';
      hp.name = 'website';
      hp.tabIndex = -1;
      hp.autocomplete = 'off';
      hp.setAttribute('aria-hidden', 'true');
    }

    const input = h('textarea', 'cc-input');
    input.rows = 3;
    input.maxLength = max;
    input.placeholder = opts.placeholder;
    input.setAttribute('aria-label', opts.placeholder);

    const row = h('div', 'cc-composer-row');
    const count = h('span', 'cc-count', '0/' + max);
    const send = h('button', 'cc-send', 'Send');
    send.type = 'button';
    row.append(count, send);

    root.append(status);
    if (hp) root.append(hp);
    root.append(input, row);

    c.root = root;
    c.input = input;
    c.setStatus = (msg, isError) => {
      status.textContent = msg || '';
      status.className = 'cc-status' + (isError ? ' error' : '');
    };
    c.lock = (reason) => { c.locked = true; c.setStatus(reason, true); c.update(); };
    c.unlock = () => { if (c.locked) { c.locked = false; c.setStatus(''); c.update(); } };
    c.update = () => {
      const wait = Math.max(0, c.until - Date.now());
      input.disabled = c.locked;
      send.disabled = c.locked || c.busy || wait > 0 || !input.value.trim();
      send.textContent = wait > 0 ? Math.ceil(wait / 1000) + 's' : 'Send';
      count.textContent = input.value.length + '/' + max;
      if (wait > 0 && !c.timer) {
        c.timer = setTimeout(() => { c.timer = null; c.update(); }, 250);
      }
    };

    async function trigger() {
      if (send.disabled) return;
      const text = input.value.trim();
      c.busy = true;
      c.setStatus('');
      c.update();
      try {
        const ok = await opts.onSend(text, hp ? hp.value : '');
        if (ok) input.value = '';
      } finally {
        c.busy = false;
        c.update();
      }
    }
    input.addEventListener('input', c.update);
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
        event.preventDefault();
        trigger();
      }
    });
    send.addEventListener('click', trigger);
    c.update();
    return c;
  }

  // ---------- reader: sending ----------
  function commitUserMessage(text, chat, inWindow) {
    const u = auth.currentUser;
    const chatRef = chatsRef.doc(u.uid);
    const TS = FV.serverTimestamp();
    const name = (state.nickname || u.displayName || (u.email || '').split('@')[0] || 'User').slice(0, 60);
    const msgCount = (chat ? (chat.msgCount || 0) : 0) + 1;
    const batch = db.batch();

    // The message id is the running counter, so one chat update can only ever
    // pair with exactly one message (checked by the rules).
    batch.set(chatRef.collection('messages').doc(String(msgCount)), {
      from: 'user', text, uid: u.uid, createdAt: TS
    });

    if (!chat) {
      batch.set(chatRef, {
        uid: u.uid, name, email: u.email, createdAt: TS,
        lastText: text.slice(0, 120), lastAt: TS, lastFrom: 'user',
        unreadAdmin: 1, unreadUser: 0, blocked: false,
        lastSentAt: TS, hourStart: TS, hourCount: 1, msgCount: 1
      });
    } else {
      const update = {
        name, lastText: text.slice(0, 120), lastAt: TS, lastFrom: 'user',
        unreadAdmin: FV.increment(1), lastSentAt: TS, msgCount: FV.increment(1)
      };
      if (inWindow) {
        update.hourCount = FV.increment(1);   // hourStart stays unchanged
      } else {
        update.hourStart = TS;
        update.hourCount = 1;
      }
      batch.update(chatRef, update);
    }
    return batch.commit();
  }

  async function sendAsUser(text, honeypot) {
    const c = cc.ui.composer;
    if (honeypot) return true; // a bot filled the hidden field: pretend it worked
    if (!text) return false;
    if (text.length > MAX_LEN) {
      c.setStatus('Message is too long (max ' + MAX_LEN + ' characters).', true);
      return false;
    }
    if ((text.match(/https?:\/\/|www\./gi) || []).length > MAX_LINKS) {
      c.setStatus('Please include at most ' + MAX_LINKS + ' links per message.', true);
      return false;
    }
    if (text === cc.lastText && Date.now() - cc.lastSentAt < 60000) {
      c.setStatus('You already sent that message.', true);
      return false;
    }
    const chat = cc.chat;
    if (chat && chat.blocked) {
      c.setStatus('You can no longer send messages to the author.', true);
      return false;
    }
    const start = chat && toDate(chat.hourStart);
    const elapsed = start ? Date.now() - start.getTime() : Infinity;
    const inWindow = elapsed < HOUR_MS;
    if (inWindow && (chat.hourCount || 0) >= HOURLY_LIMIT) {
      c.setStatus('Message limit reached. Please try again later.', true);
      return false;
    }

    try {
      try {
        await commitUserMessage(text, chat, inWindow);
      } catch (e) {
        // Right at the 1-hour boundary the client and server clocks can
        // disagree about which window we are in — retry once the other way.
        const nearEdge = chat && Math.abs(elapsed - HOUR_MS) < 120000;
        const flipOk = inWindow || (chat && (chat.hourCount || 0) < HOURLY_LIMIT);
        if (e && e.code === 'permission-denied' && nearEdge && flipOk) {
          await commitUserMessage(text, chat, !inWindow);
        } else {
          throw e;
        }
      }
      cc.lastText = text;
      cc.lastSentAt = Date.now();
      c.until = Date.now() + COOLDOWN_MS;
      return true;
    } catch (e) {
      console.error('Contact: send failed', e);
      if (e && e.code === 'permission-denied') {
        c.setStatus('The message was not accepted. You may be sending too fast or have reached the limit — try again in a moment.', true);
      } else if (e && (e.code === 'unavailable' || e.code === 'deadline-exceeded')) {
        c.setStatus('You seem to be offline. Try again when you are connected.', true);
      } else {
        c.setStatus('Could not send the message. Please try again.', true);
      }
      return false;
    }
  }

  // ---------- admin: sending / blocking ----------
  async function sendAsAdmin(text) {
    const uid = cc.threadUid;
    const c = cc.ui.composer;
    if (!uid || !text) return false;
    const chatRef = chatsRef.doc(uid);
    const TS = FV.serverTimestamp();
    const batch = db.batch();
    batch.set(chatRef.collection('messages').doc(), { from: 'admin', text, uid, createdAt: TS });
    batch.update(chatRef, {
      lastText: text.slice(0, 120), lastAt: TS, lastFrom: 'admin',
      unreadUser: FV.increment(1), unreadAdmin: 0
    });
    try {
      await batch.commit();
      return true;
    } catch (e) {
      console.error('Contact: admin send failed', e);
      c.setStatus('Could not send the reply.', true);
      return false;
    }
  }

  function toggleBlock() {
    const chat = cc.chats.find((x) => x.uid === cc.threadUid);
    if (!chat) return;
    cc.ui.blockBtn.disabled = true;
    chatsRef.doc(chat.uid).update({ blocked: !chat.blocked })
      .catch((e) => {
        console.error('Contact: block toggle failed', e);
        cc.ui.composer.setStatus('Could not change the block state.', true);
      })
      .finally(() => { if (cc.ui.blockBtn) cc.ui.blockBtn.disabled = false; });
  }

  // ---------- read receipts ----------
  function maybeMarkRead() {
    if (!isActive() || !cc.verified || cc.marking) return;
    let ref = null;
    let patch = null;
    if (cc.isAdmin) {
      const chat = cc.threadUid && cc.chats.find((x) => x.uid === cc.threadUid);
      if (chat && chat.unreadAdmin > 0) { ref = chatsRef.doc(chat.uid); patch = { unreadAdmin: 0 }; }
    } else if (cc.chat && cc.chat.unreadUser > 0) {
      ref = chatsRef.doc(cc.user.uid); patch = { unreadUser: 0 };
    }
    if (!ref) return;
    cc.marking = true;
    ref.update(patch)
      .catch((e) => console.error('Contact: mark read failed', e))
      .finally(() => { cc.marking = false; });
  }

  // ---------- screens ----------
  function buildGuest() {
    const root = h('div', 'cc-root');
    const box = h('div', 'cc-center');
    box.appendChild(h('p', null, 'Log in or register to write to the author directly.'));
    box.appendChild(h('p', null, 'Only accounts with a verified email can send messages — this keeps the chat free of spam.'));
    const btn = h('button', 'cc-btn primary', 'Log in');
    btn.type = 'button';
    btn.addEventListener('click', () => showAuthOverlay());
    box.appendChild(btn);
    root.appendChild(box);
    view.replaceChildren(root);
    cc.ui = {};
  }

  function buildVerify() {
    const u = cc.user;
    const root = h('div', 'cc-root');
    const box = h('div', 'cc-center');
    box.appendChild(h('p', null, 'Please confirm your email address to write to the author.'));
    box.appendChild(h('p', null, u.email || ''));
    const status = h('div', 'cc-status');
    const sendBtn = h('button', 'cc-btn primary', 'Send verification email');
    const checkBtn = h('button', 'cc-btn', "I've verified — continue");
    sendBtn.type = checkBtn.type = 'button';

    async function sendVerification() {
      sendBtn.disabled = true;
      try {
        await u.sendEmailVerification();
        status.className = 'cc-status';
        status.textContent = 'Verification email sent. Check your inbox (and spam folder).';
      } catch (e) {
        status.className = 'cc-status error';
        status.textContent = e && e.code === 'auth/too-many-requests'
          ? 'Too many requests. Please wait a few minutes and try again.'
          : 'Could not send the email. Please try again later.';
      } finally {
        setTimeout(() => { sendBtn.disabled = false; }, 30000);
      }
    }
    sendBtn.addEventListener('click', sendVerification);

    checkBtn.addEventListener('click', async () => {
      checkBtn.disabled = true;
      try {
        await u.reload();
        await auth.currentUser.getIdToken(true); // refresh the email_verified claim
      } catch (e) {
        console.error('Contact: reload failed', e);
      }
      checkBtn.disabled = false;
      if (auth.currentUser && auth.currentUser.emailVerified) {
        onAuth(auth.currentUser);
      } else {
        status.className = 'cc-status error';
        status.textContent = 'Not verified yet. Open the link in the email, then try again.';
      }
    });

    box.append(sendBtn, checkBtn, status);
    root.appendChild(box);
    view.replaceChildren(root);
    cc.ui = {};

    // Brand-new email/password account: send the email automatically once.
    if (!cc.autoMailed && u.metadata && u.metadata.creationTime === u.metadata.lastSignInTime) {
      cc.autoMailed = true;
      sendVerification();
    }
  }

  function buildUser() {
    const root = h('div', 'cc-root');
    const head = h('div', 'cc-head');
    head.appendChild(h('div', 'cc-avatar', 'Ч'));
    const text = h('div', 'cc-head-text');
    text.appendChild(h('div', 'cc-head-title', AUTHOR_NAME));
    text.appendChild(h('div', 'cc-head-sub', AUTHOR_SUB));
    head.appendChild(text);

    const messages = h('div', 'cc-messages');
    const composer = buildComposer({ placeholder: 'Write a message to the author…', onSend: sendAsUser });
    root.append(head, messages, composer.root);
    view.replaceChildren(root);
    cc.ui = { messages, composer };
  }

  function updateUser() {
    const ui = cc.ui;
    if (!ui.messages) return;
    renderMessages(ui.messages, cc.messages, {
      mine: 'user',
      theirName: AUTHOR_NAME,
      empty: 'Say hello! Your message goes straight to the author, and only the two of you can see this conversation.'
    });
    if (cc.chat && cc.chat.blocked) {
      ui.composer.lock('You can no longer send messages to the author.');
    } else {
      ui.composer.unlock();
    }
    ui.composer.update();
  }

  function buildAdmin() {
    const root = h('div', 'cc-root');
    const admin = h('div', 'cc-admin');

    // --- inbox screen ---
    const listScreen = h('div', 'cc-screen');
    const head = h('div', 'cc-head');
    head.appendChild(h('div', 'cc-avatar', '✉'));
    const headText = h('div', 'cc-head-text');
    headText.appendChild(h('div', 'cc-head-title', 'Inbox'));
    const sub = h('div', 'cc-head-sub', '');
    headText.appendChild(sub);
    head.appendChild(headText);

    const search = h('input', 'cc-search');
    search.type = 'search';
    search.placeholder = 'Search name, email or message';
    search.autocomplete = 'off';
    search.addEventListener('input', () => { cc.search = search.value; renderAdminList(); });

    const list = h('div', 'cc-chat-list');
    listScreen.append(head, search, list);

    // --- thread screen ---
    const threadScreen = h('div', 'cc-screen');
    threadScreen.hidden = true;
    const bar = h('div', 'cc-thread-bar');
    const back = h('button', 'cc-back', '‹');
    back.type = 'button';
    back.setAttribute('aria-label', 'Back to inbox');
    const who = h('div', 'cc-thread-who');
    const whoName = h('div', 'cc-head-title', '');
    const whoSub = h('div', 'cc-head-sub', '');
    who.append(whoName, whoSub);
    const actions = h('div', 'cc-thread-actions');
    const blockBtn = h('button', 'cc-btn danger', 'Block');
    blockBtn.type = 'button';
    actions.appendChild(blockBtn);
    bar.append(back, who, actions);

    const tMessages = h('div', 'cc-messages');
    const composer = buildComposer({ admin: true, placeholder: 'Write a reply…', onSend: sendAsAdmin });
    threadScreen.append(bar, tMessages, composer.root);

    back.addEventListener('click', closeThread);
    blockBtn.addEventListener('click', toggleBlock);

    admin.append(listScreen, threadScreen);
    root.appendChild(admin);
    view.replaceChildren(root);
    cc.ui = { sub, search, list, listScreen, threadScreen, whoName, whoSub, blockBtn, tMessages, composer };
  }

  function renderAdminList() {
    const ui = cc.ui;
    if (!ui.list) return;
    ui.sub.textContent = cc.chats.length + (cc.chats.length === 1 ? ' conversation' : ' conversations');

    const q = cc.search.trim().toLowerCase();
    const items = cc.chats.filter((c) =>
      !q ||
      (c.name || '').toLowerCase().includes(q) ||
      (c.email || '').toLowerCase().includes(q) ||
      (c.lastText || '').toLowerCase().includes(q)
    );

    ui.list.textContent = '';
    if (!items.length) {
      ui.list.appendChild(h('div', 'cc-empty',
        cc.chats.length ? 'No matches.' : 'No conversations yet. When someone writes to you, they will appear here.'));
      return;
    }

    items.forEach((c) => {
      const btn = h('button', 'cc-chat-item' + (c.unreadAdmin > 0 ? ' unread' : ''));
      btn.type = 'button';
      btn.appendChild(h('div', 'cc-avatar', chatName(c).charAt(0).toUpperCase()));

      const body = h('div', 'cc-chat-body');
      const top = h('div', 'cc-chat-top');
      const name = h('div', 'cc-chat-name', chatName(c));
      name.style.minWidth = '0';
      top.append(name, h('div', 'cc-chat-time', fmtListTime(toDate(c.lastAt))));

      const bottom = h('div', 'cc-chat-bottom');
      const snippet = h('div', 'cc-chat-snippet', (c.lastFrom === 'admin' ? 'You: ' : '') + (c.lastText || ''));
      snippet.style.minWidth = '0';
      bottom.appendChild(snippet);
      if (c.blocked) bottom.appendChild(h('span', 'cc-pill blocked', 'Blocked'));
      if (c.unreadAdmin > 0) bottom.appendChild(h('span', 'cc-pill', String(c.unreadAdmin)));

      body.append(top, bottom);
      btn.appendChild(body);
      btn.addEventListener('click', () => openThread(c.uid));
      ui.list.appendChild(btn);
    });
  }

  function updateThreadHeader() {
    const ui = cc.ui;
    const chat = cc.chats.find((x) => x.uid === cc.threadUid);
    if (!ui.whoName || !chat) return;
    ui.whoName.textContent = chatName(chat);
    ui.whoSub.textContent = chat.email || '';
    ui.blockBtn.textContent = chat.blocked ? 'Unblock' : 'Block';
    ui.blockBtn.className = 'cc-btn' + (chat.blocked ? '' : ' danger');
  }

  function renderThread() {
    const ui = cc.ui;
    const chat = cc.chats.find((x) => x.uid === cc.threadUid);
    if (!ui.tMessages || !chat) return;
    renderMessages(ui.tMessages, cc.messages, { mine: 'admin', theirName: chatName(chat), empty: 'No messages yet.' });
  }

  function updateAdmin() {
    renderAdminList();
    if (cc.threadUid) updateThreadHeader();
  }

  function openThread(uid) {
    const ui = cc.ui;
    if (cc.unsubMsgs) { cc.unsubMsgs(); cc.unsubMsgs = null; }
    cc.threadUid = uid;
    cc.messages = [];
    ui.tMessages.textContent = '';
    delete ui.tMessages.dataset.filled;
    ui.listScreen.hidden = true;
    ui.threadScreen.hidden = false;
    ui.composer.setStatus('');
    updateThreadHeader();

    cc.unsubMsgs = chatsRef.doc(uid).collection('messages')
      .orderBy('createdAt').limitToLast(200)
      .onSnapshot((snap) => {
        cc.messages = snap.docs.map((d) => ({ id: d.id, ...d.data({ serverTimestamps: 'estimate' }) }));
        renderThread();
        maybeMarkRead();
      }, (error) => console.error('Contact: thread listener failed', error));
    maybeMarkRead();
    requestAnimationFrame(() => { ui.tMessages.scrollTop = ui.tMessages.scrollHeight; });
  }

  function closeThread() {
    if (cc.unsubMsgs) { cc.unsubMsgs(); cc.unsubMsgs = null; }
    cc.threadUid = null;
    cc.messages = [];
    if (cc.ui.listScreen) {
      cc.ui.threadScreen.hidden = true;
      cc.ui.listScreen.hidden = false;
    }
  }

  // ---------- wiring ----------
  function render() {
    const mode = !cc.user ? 'guest' : !cc.verified ? 'verify' : cc.isAdmin ? 'admin' : 'user';
    if (mode !== cc.mode) {
      cc.mode = mode;
      ({ guest: buildGuest, verify: buildVerify, admin: buildAdmin, user: buildUser })[mode]();
    }
    if (mode === 'admin') updateAdmin();
    else if (mode === 'user') updateUser();
  }

  function startUser() {
    const uid = cc.user.uid;
    cc.unsubChat = chatsRef.doc(uid).onSnapshot((doc) => {
      cc.chat = doc.exists ? doc.data({ serverTimestamps: 'estimate' }) : null;
      updateBadge();
      if (cc.mode === 'user') updateUser();
      maybeMarkRead();
    }, (error) => console.error('Contact: chat listener failed', error));

    cc.unsubMsgs = chatsRef.doc(uid).collection('messages')
      .orderBy('createdAt').limitToLast(200)
      .onSnapshot((snap) => {
        cc.messages = snap.docs.map((d) => ({ id: d.id, ...d.data({ serverTimestamps: 'estimate' }) }));
        if (cc.mode === 'user') updateUser();
      }, (error) => {
        console.error('Contact: message listener failed', error);
        if (cc.ui.messages) {
          cc.ui.messages.replaceChildren(h('div', 'cc-empty', 'Chat is unavailable right now. Please try again later.'));
        }
      });
  }

  function startAdmin() {
    cc.unsubList = chatsRef.orderBy('lastAt', 'desc').limit(200).onSnapshot((snap) => {
      cc.chats = snap.docs.map((d) => ({ uid: d.id, ...d.data({ serverTimestamps: 'estimate' }) }));
      updateBadge();
      if (cc.mode === 'admin') updateAdmin();
      maybeMarkRead();
    }, (error) => {
      console.error('Contact: inbox listener failed', error);
      if (cc.ui.list) cc.ui.list.replaceChildren(h('div', 'cc-empty', 'Inbox unavailable. Check the Firestore rules for chats.'));
    });
  }

  function teardown() {
    ['unsubChat', 'unsubMsgs', 'unsubList'].forEach((k) => {
      if (cc[k]) { cc[k](); cc[k] = null; }
    });
    cc.chat = null;
    cc.chats = [];
    cc.messages = [];
    cc.threadUid = null;
    cc.mode = null;
    cc.ui = {};
    cc.search = '';
  }

  function onAuth(user) {
    teardown();
    cc.user = user && !user.isAnonymous ? user : null;
    cc.verified = !!(cc.user && cc.user.emailVerified);
    const email = cc.user ? (cc.user.email || '').toLowerCase() : '';
    // Admin only counts once the email is verified (the rules check this too).
    cc.isAdmin = cc.verified && Array.isArray(ADMIN_EMAILS) && ADMIN_EMAILS.includes(email);

    if (cc.verified) {
      if (cc.isAdmin) startAdmin(); else startUser();
    }
    updateBadge();
    render();
  }

  window.contactOnTabShown = function () {
    render();
    maybeMarkRead();
    requestAnimationFrame(() => {
      [cc.ui.messages, cc.ui.tMessages].forEach((el) => { if (el) el.scrollTop = el.scrollHeight; });
    });
  };

  document.addEventListener('visibilitychange', maybeMarkRead);
  auth.onAuthStateChanged(onAuth);
})();

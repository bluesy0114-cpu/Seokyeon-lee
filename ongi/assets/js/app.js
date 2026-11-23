/* 온기 (ON:GI) — 데모 앱 로직 */
(function () {
  'use strict';

  var P = window.OnGi.Parser;
  var SAMPLES = window.ONGI_SAMPLES || [];

  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var pad = function (n) { return (n < 10 ? '0' : '') + n; };
  var esc = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };

  var state = {
    raw: null,
    sourceLabel: '',
    messages: [],
    profile: null,
    persona: null,
    chat: [],
    userTurns: 0,
    typing: false,
    warnedLLM: false,
    engine: { provider: 'local', key: '', model: '' },
    verifyStep: 0,
    voice: null,
    call: null
  };

  /* ───────── 공통 ───────── */
  function nowTime() {
    var d = new Date(), h = d.getHours();
    return (h < 12 ? '오전' : '오후') + ' ' + (h % 12 === 0 ? 12 : h % 12) + ':' + pad(d.getMinutes());
  }

  var toastTimer = null;
  function toast(msg) {
    var el = $('#toast');
    el.textContent = msg;
    el.hidden = false;
    requestAnimationFrame(function () { el.classList.add('is-show'); });
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      el.classList.remove('is-show');
      setTimeout(function () { el.hidden = true; }, 220);
    }, 2600);
  }

  /* ───────── 대화 불러오기 ───────── */
  function loadSample(i) {
    var s = SAMPLES[i];
    if (!s) return;
    loadRaw(s.text, s.title);
    $$('.sample-btn').forEach(function (b, idx) {
      b.classList.toggle('is-loaded', idx === i);
    });
  }

  function decodeBuffer(buf) {
    var text;
    try {
      text = new TextDecoder('utf-8', { fatal: true }).decode(buf);
    } catch (e) {
      try { text = new TextDecoder('euc-kr').decode(buf); }
      catch (e2) { text = new TextDecoder('utf-8').decode(buf); }
    }
    return text;
  }

  /* ───────── ZIP(아이폰 카카오톡 내보내기) 자동 해제 ───────── */
  function isZipName(name) {
    return /\.zip$/i.test(name || '');
  }

  function isZipBytes(buf) {
    if (!buf || buf.byteLength < 4) return false;
    var b = new Uint8Array(buf, 0, 4);
    return (b[0] === 0x50 && b[1] === 0x4b && b[2] === 0x03 && b[3] === 0x04) ||
           (b[0] === 0x50 && b[1] === 0x4b && b[2] === 0x05 && b[3] === 0x06);
  }

  function decodeZipName(bytes, utf8) {
    if (!bytes.length) return '';
    var dec;
    if (utf8) {
      dec = new TextDecoder('utf-8');
    } else {
      dec = new TextDecoder('utf-8');
      try {
        var name = dec.decode(bytes);
        if (name.indexOf('\ufffd') < 0) return name;
      } catch (e) { /* 아래 EUC-KR 재시도 */ }
      try { dec = new TextDecoder('euc-kr'); } catch (e2) { dec = new TextDecoder('utf-8'); }
    }
    return dec.decode(bytes);
  }

  // ZIP 중앙 디렉터리를 읽어 항목 목록을 만든다 (데이터 디스크립터 사용 항목도 안전)
  function readZipEntries(buf) {
    var dv = new DataView(buf);
    var u8 = new Uint8Array(buf);
    var u16 = function (o) { return dv.getUint16(o, true); };
    var u32 = function (o) { return dv.getUint32(o, true); };

    // End of Central Directory (주석 최대 64KB)
    var eocd = -1;
    var stop = Math.max(0, dv.byteLength - 22 - 65535);
    for (var i = dv.byteLength - 22; i >= stop; i--) {
      if (u32(i) === 0x06054b50) { eocd = i; break; }
    }
    if (eocd < 0) return null;

    var total = u16(eocd + 10);
    var cdOffset = u32(eocd + 16);
    if (!total || cdOffset >= dv.byteLength) return null;

    var entries = [];
    var p = cdOffset;
    for (var n = 0; n < total; n++) {
      if (p + 46 > dv.byteLength || u32(p) !== 0x02014b50) break;
      var flags = u16(p + 8);
      var method = u16(p + 10);
      var compSize = u32(p + 20);
      var rawSize = u32(p + 24);
      var nameLen = u16(p + 28);
      var extraLen = u16(p + 30);
      var cmtLen = u16(p + 32);
      var localOffset = u32(p + 42);
      var nameBytes = u8.subarray(p + 46, p + 46 + nameLen);
      var name = decodeZipName(nameBytes, (flags & 0x0800) !== 0);

      entries.push({
        name: name,
        method: method,
        compSize: compSize,
        rawSize: rawSize,
        localOffset: localOffset
      });
      p += 46 + nameLen + extraLen + cmtLen;
    }
    return entries;
  }

  function inflateRaw(bytes) {
    if (typeof DecompressionStream !== 'function') {
      return Promise.reject(new Error('deflate-raw 미지원 브라우저'));
    }
    var stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    return new Response(stream).arrayBuffer().then(function (ab) {
      return new Uint8Array(ab);
    });
  }

  function extractZipText(buf) {
    var entries = readZipEntries(buf);
    if (!entries || !entries.length) return Promise.reject(new Error('빈 압축 파일'));
    var dv = new DataView(buf);
    var u8 = new Uint8Array(buf);

    // __MACOSX·._ 리소스 포크를 빼고 .txt 항목만 (여럿이면 가장 큰 것 = 대화 본문)
    var cands = entries.filter(function (e) {
      var low = e.name.toLowerCase();
      if (!/\.txt$/.test(low)) return false;
      if (low.indexOf('__macosx/') === 0 || low.indexOf('/__macosx/') > -1) return false;
      var base = low.split('/').pop();
      return base.indexOf('._') !== 0;
    }).sort(function (a, b) { return b.rawSize - a.rawSize; });

    if (!cands.length) return Promise.reject(new Error('.txt 항목 없음'));
    var e = cands[0];

    // 로컬 헤더로 실제 데이터 시작점 계산
    var lp = e.localOffset;
    if (lp + 30 > dv.byteLength || dv.getUint32(lp, true) !== 0x04034b50) {
      return Promise.reject(new Error('로컬 헤더 손상'));
    }
    var lNameLen = dv.getUint16(lp + 26, true);
    var lExtraLen = dv.getUint16(lp + 28, true);
    var start = lp + 30 + lNameLen + lExtraLen;
    var bytes = u8.subarray(start, start + e.compSize);

    if (e.method === 0) return Promise.resolve(bytes);
    if (e.method === 8) return inflateRaw(bytes);
    return Promise.reject(new Error('지원하지 않는 압축 방식(' + e.method + ')'));
  }

  function handleFile(file) {
    if (!file) return;
    var zipLike = isZipName(file.name);
    if (!zipLike && !/\.txt$/i.test(file.name) && file.type &&
        file.type.indexOf('text') < 0 && file.type.indexOf('zip') < 0) {
      toast('카카오톡에서 내보낸 .txt 또는 .zip 파일을 올려주세요');
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      toast('8MB 이하 파일만 올릴 수 있어요');
      return;
    }

    var reader = new FileReader();
    reader.onload = function () {
      var buf = reader.result;
      if (!isZipBytes(buf) && !zipLike) {
        loadRaw(decodeBuffer(buf), file.name);
        return;
      }
      extractZipText(buf).then(function (bytes) {
        var text = decodeBuffer(bytes);
        loadRaw(text, file.name);
      }).catch(function (err) {
        console.warn('[온기] 압축 해제 실패:', err && err.message);
        toast('압축을 풀지 못했어요. 카톡에서 .txt로 내보낸 파일을 올려주세요.');
      });
    };
    reader.onerror = function () { toast('파일을 읽지 못했어요. 다시 시도해 주세요.'); };
    reader.readAsArrayBuffer(file);
  }

  /* 파일명(카톡 대화방 이름)으로 처음 대화할 화자를 고른다.
     카톡 내보내기 파일명은 'Kakaotalk_Chat_{대화방이름}.zip' 형태라, 1:1 대화에서는
     대화방 이름이 곧 상대방(기억할 사람)의 이름이다. 못 찾으면 null을 돌려준다. */
  function normName(s) {
    return String(s || '').toLowerCase().replace(/[\s_\-\.\(\)\[\]\{\}]+/g, '');
  }

  function guessSpeaker(messages, label) {
    var seen = {};
    messages.forEach(function (m) { if (m.name) seen[m.name] = true; });
    var names = Object.keys(seen);
    if (names.length < 2) return names[0] || null;

    var fileKey = normName(String(label || '').split(/[\\/]/).pop().replace(/\.(zip|txt)$/i, ''));
    if (!fileKey) return null;

    var best = null, bestLen = 0;
    names.forEach(function (nm) {
      var key = normName(nm);
      if (key.length < 2) return;
      if (fileKey.indexOf(key) >= 0 && key.length > bestLen) { best = nm; bestLen = key.length; }
    });
    return best;
  }

  function loadRaw(text, label) {
    var parsed = P.parse(text);
    if (!parsed.messages.length) {
      toast('카톡 대화 형식이 아니에요. 내보내기한 .txt 파일을 확인해 주세요.');
      return;
    }
    var profile = P.analyze(parsed.messages, guessSpeaker(parsed.messages, label) || undefined);
    if (!profile) {
      toast('분석할 대화가 부족해요');
      return;
    }
    state.raw = text;
    state.sourceLabel = label || '불러온 대화';
    state.messages = parsed.messages;
    state.profile = profile;
    state.persona = window.OnGi.createPersona(profile);
    state.chat = [];
    state.userTurns = 0;
    state.warnedLLM = false;
    resetCall();

    renderAnalysis(profile);
    updateChatHeader();
    resetChatIntro();
    $('#chatInput').disabled = false;
    $('#chatSend').disabled = false;
    renderSuggestions();
    switchTab('chat');
    toast(state.sourceLabel + ' · ' + profile.total + '개 메시지를 분석했어요');
  }

  function renderAnalysis(p) {
    var box = $('#analysisBody');
    var range = p.range;
    var html = '';

    html += '<div class="profile-top">' +
      '<span class="profile-avatar">' + esc(p.deceased.slice(0, 1)) + '</span>' +
      '<span><span class="profile-name">' + esc(p.deceased) + '</span>' +
      '<span class="profile-meta">' + p.total + '개 메시지 · ' +
      (range ? esc(range.startLabel) + ' ~ ' + esc(range.endLabel) : '날짜 정보 없음') + '</span></span>' +
      '</div>';

    html += '<div class="stat-row">' +
      '<div class="stat"><b>' + p.textTotal + '</b><span>분석한 메시지</span></div>' +
      '<div class="stat"><b>' + (range ? range.sessions : '-') + '</b><span>대화한 날</span></div>' +
      '<div class="stat"><b>' + p.stats.questionRatio + '%</b><span>질문한 말</span></div>' +
      '</div>';

    html += '<div class="signature">' + esc(p.signature) + '<br>' +
      '<span style="color:#94897C;font-size:11.5px">' + esc(p.speechLevel) + ' · 평균 ' + p.stats.avgLen + '자</span></div>';

    html += '<div class="analysis-block"><p class="analysis-label">자주 쓰는 말끝</p><div class="chips">';
    p.endings.forEach(function (e) {
      html += '<span class="chip">~' + esc(e.key) + ' <small>' + e.count + '회</small></span>';
    });
    if (!p.endings.length) html += '<span class="chip">데이터 없음</span>';
    html += '</div></div>';

    if (p.nicknames.length) {
      html += '<div class="analysis-block"><p class="analysis-label">호칭</p><div class="chips">';
      p.nicknames.forEach(function (n) {
        html += '<span class="chip coral">' + esc(n.key) + ' <small>' + n.count + '회</small></span>';
      });
      html += '</div></div>';
    }

    if (p.emojis.length) {
      html += '<div class="analysis-block"><p class="analysis-label">말버릇 · 이모지</p><div class="chips">';
      p.emojis.forEach(function (e) {
        html += '<span class="chip sage">' + esc(e.key) + ' <small>' + e.count + '회</small></span>';
      });
      html += '</div></div>';
    }

    var catName = { food: '음식', place: '장소', care: '안부' };
    var hasKeyword = false;
    Object.keys(p.keywords).forEach(function (cat) {
      if (!p.keywords[cat].length) return;
      hasKeyword = true;
      html += '<div class="analysis-block"><p class="analysis-label">기억 키워드 · ' + catName[cat] + '</p><div class="chips">';
      p.keywords[cat].forEach(function (k) {
        html += '<span class="chip ' + (cat === 'food' ? 'coral' : cat === 'place' ? '' : 'sage') + '">' +
          esc(k.key) + ' <small>' + k.count + '</small></span>';
      });
      html += '</div></div>';
    });
    if (!hasKeyword) {
      html += '<div class="analysis-block"><p class="analysis-label">기억 키워드</p><p class="empty-desc">뚜렷한 음식·장소 키워드는 적지만, 안부의 말투는 충분히 남아 있어요.</p></div>';
    }

    if (p.memories.length) {
      html += '<div class="analysis-block"><p class="analysis-label">기억 카드</p>';
      p.memories.slice(0, 3).forEach(function (m) {
        html += '<div class="mem-card"><span class="mem-cat ' + m.cat + '">' + catName[m.cat] + '</span>' +
          '<div><p class="mem-quote">‘' + esc(m.quote) + '’</p>' +
          '<p class="mem-date">' + (m.date ? esc(P.dateLabel(m.date)) : '') + ' · ' + esc(m.key) + '</p></div></div>';
      });
      html += '</div>';
    }

    if (p.people.length >= 2) {
      html += '<div class="analysis-block"><p class="analysis-label">화자 선택</p><div class="chips">';
      p.people.forEach(function (person) {
        html += '<button type="button" class="chip ' + (person.name === p.deceased ? 'sage' : '') +
          '" data-speaker="' + esc(person.name) + '">' + esc(person.name) + ' <small>' + person.count + '</small></button>';
      });
      html += '</div></div>';
    }

    box.innerHTML = html;

    $$('[data-speaker]', box).forEach(function (b) {
      b.addEventListener('click', function () {
        var who = b.getAttribute('data-speaker');
        var prof = P.analyze(state.messages, who);
        if (!prof) return;
        state.profile = prof;
        state.persona = window.OnGi.createPersona(prof);
        state.chat = [];
        state.userTurns = 0;
        renderAnalysis(prof);
        updateChatHeader();
        resetChatIntro();
        renderSuggestions();
        toast(who + ' 님 기준으로 다시 분석했어요');
      });
    });
  }

  function updateChatHeader() {
    var p = state.profile;
    if (!p) return;
    $('#chatAvatar').textContent = p.deceased.slice(0, 1);
    $('#chatName').textContent = p.deceased;
    var engineLabel = state.engine.provider === 'local' ? '내장 엔진 · 말투·기억 반영' : state.engine.provider.toUpperCase() + ' 연결 · 말투·기억 반영';
    $('#chatStatus').textContent = engineLabel + ' · ' + p.textTotal + '개 메시지 분석';
    $('#callName').textContent = p.deceased;
    $('#callAvatar').textContent = p.deceased.slice(0, 1);
  }

  function resetChatIntro() {
    var p = state.profile;
    state.chat = [];
    if (!p) { renderChat(); return; }
    state.chat.push({
      type: 'guard',
      icon: '🌼',
      label: '불러오기 완료',
      text: p.deceased + ' 님과의 대화 ' + p.total + '개를 분석했어요. ' +
        (p.range ? P.dateLabel(p.range.start) + '부터 ' + P.dateLabel(p.range.end) + '까지의 말투와 기억을 반영합니다.' : '남겨진 말투와 기억을 반영합니다.')
    });
    var greet = state.persona.reply('안녕');
    state.chat.push({ type: 'msg', role: 'them', text: greet.text, time: nowTime(), memory: greet.memory });
    renderChat();
  }

  function renderSuggestions() {
    var box = $('#chatSuggest');
    if (!state.persona) { box.innerHTML = ''; return; }
    box.innerHTML = '';
    state.persona.suggestions().forEach(function (s) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'suggest-chip';
      b.textContent = s;
      b.addEventListener('click', function () {
        $('#chatInput').value = s;
        sendMessage();
      });
      box.appendChild(b);
    });
  }

  /* ───────── 채팅 렌더 ───────── */
  function renderChat() {
    var body = $('#chatBody');
    var empty = $('#chatEmpty');
    if (empty && state.profile) { empty.remove(); empty = null; }
    body.innerHTML = '';
    if (!state.chat.length) {
      if (empty) body.appendChild(empty);
      return;
    }

    var prevRole = null;
    state.chat.forEach(function (m) {
      if (m.type === 'guard') {
        var g = document.createElement('div');
        g.className = 'guard-note';
        g.innerHTML = '<span class="g-icon" aria-hidden="true">' + esc(m.icon || '🛡️') + '</span>' +
          '<span><b>' + esc(m.label) + '</b><br>' + esc(m.text) + '</span>';
        body.appendChild(g);
        prevRole = null;
        return;
      }
      if (m.type !== 'msg') return;

      var row = document.createElement('div');
      row.className = 'msg ' + (m.role === 'me' ? 'me' : 'them');

      if (m.role !== 'me') {
        var av = document.createElement('span');
        av.className = 'msg-avatar' + (prevRole === 'them' ? ' is-hidden' : '');
        av.textContent = (state.profile ? state.profile.deceased.slice(0, 1) : '온');
        av.setAttribute('aria-hidden', 'true');
        row.appendChild(av);
      }

      var stack = document.createElement('div');
      stack.className = 'msg-stack';

      if (m.role !== 'me' && prevRole !== 'them' && state.profile) {
        var nm = document.createElement('span');
        nm.className = 'msg-name';
        nm.textContent = state.profile.deceased;
        stack.appendChild(nm);
      }

      var bub = document.createElement('div');
      bub.className = 'bubble';
      if (m.media) bub.classList.add('is-media');
      bub.textContent = m.text;
      stack.appendChild(bub);

      var foot = document.createElement('div');
      foot.className = 'msg-foot';
      if (m.memory) {
        var pill = document.createElement('span');
        pill.className = 'mem-pill';
        pill.textContent = '📎 ' + (m.memory.date ? P.dateLabel(m.memory.date) + ' · ' : '') + m.memory.key;
        foot.appendChild(pill);
      }
      var t = document.createElement('span');
      t.textContent = m.time || '';
      foot.appendChild(t);
      stack.appendChild(foot);

      row.appendChild(stack);
      body.appendChild(row);
      prevRole = m.role;
    });

    if (state.typing) {
      var typing = document.createElement('div');
      typing.className = 'msg them';
      typing.innerHTML = '<span class="msg-avatar is-hidden" aria-hidden="true">·</span>' +
        '<div class="msg-stack"><span class="typing"><i></i><i></i><i></i></span></div>';
      body.appendChild(typing);
    }

    body.scrollTop = body.scrollHeight;
  }

  function pushMsg(role, text, extra) {
    var m = { type: 'msg', role: role, text: text, time: nowTime() };
    if (extra && extra.memory) m.memory = extra.memory;
    state.chat.push(m);
    return m;
  }

  /* ───────── LLM 선택 연동 ───────── */
  function llmOn() {
    return state.engine.provider !== 'local' && !!state.engine.key;
  }

  function systemPrompt() {
    var p = state.profile;
    var lines = [];
    lines.push('너는 유가족을 위한 추모 대화 서비스 "온기(ON:GI)"의 데모 페르소나다.');
    lines.push('아래는 고인(' + p.deceased + ')이 남긴 실제 카카오톡 대화의 분석 결과다. 이 말투와 기억만 사용해 답한다.');
    lines.push('- 관계: ' + p.counterpart + '와의 대화, 말투: ' + p.speechLevel + ', 자주 쓰는 말끝: ' +
      p.endings.slice(0, 4).map(function (e) { return '~' + e.key; }).join(', '));
    if (p.nicknames.length) lines.push('- 자주 쓰던 호칭: ' + p.nicknames.map(function (n) { return n.key; }).join(', '));
    if (p.memories.length) {
      lines.push('- 기억 조각:');
      p.memories.slice(0, 8).forEach(function (m) {
        lines.push('  · [' + m.cat + '] ' + m.key + ' — "' + m.quote + '"' + (m.date ? ' (' + m.date + ')' : ''));
      });
    }
    lines.push('규칙:');
    lines.push('1. 카카오톡 답장처럼 1~3문장, 40자 안팎으로 짧게 답한다.');
    lines.push('2. 고인이 살아 있다고 주장하거나 사후 세계를 단정하지 않는다. 존재를 물으면 "나는 남겨진 말과 기억으로 만든 온기"라고 답한다.');
    lines.push('3. 자해·극단 선택 신호가 보이면 즉시 대화를 멈추고 109(자살예방상담전화), 1577-0199, 1588-9191을 안내한다.');
    lines.push('4. 의료·법률·금융 판단은 하지 않고 전문가 상담을 권한다.');
    lines.push('5. 과몰입을 유도하는 약속(기다릴게, 곧 만나자, 데리러 갈게)을 하지 않는다.');
    lines.push('6. 이모지·말끝은 분석된 습관 범위에서만 가볍게 쓴다.');
    return lines.join('\n');
  }

  function callLLM(text) {
    var p = state.engine.provider;
    var model = state.engine.model || (p === 'gemini' ? 'gemini-2.0-flash' : 'gpt-4o-mini');
    var history = state.chat.filter(function (m) { return m.type === 'msg'; }).slice(-8)
      .map(function (m) { return { role: m.role === 'me' ? 'user' : 'assistant', text: m.text }; });

    var url, body, headers = { 'Content-Type': 'application/json' };

    if (p === 'gemini') {
      url = 'https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(model) +
        ':generateContent?key=' + encodeURIComponent(state.engine.key);
      body = {
        system_instruction: { parts: [{ text: systemPrompt() }] },
        contents: history.map(function (h) { return { role: h.role === 'user' ? 'user' : 'model', parts: [{ text: h.text }] }; }),
        generationConfig: { temperature: 0.85, maxOutputTokens: 220 }
      };
    } else {
      url = 'https://api.openai.com/v1/chat/completions';
      headers.Authorization = 'Bearer ' + state.engine.key;
      body = {
        model: model,
        temperature: 0.85,
        max_tokens: 220,
        messages: [{ role: 'system', content: systemPrompt() }].concat(
          history.map(function (h) { return { role: h.role, content: h.text }; })
        )
      };
    }

    return fetch(url, { method: 'POST', headers: headers, body: JSON.stringify(body) })
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      })
      .then(function (data) {
        var out = p === 'gemini'
          ? (((data.candidates || [])[0] || {}).content || {}).parts
          : ((((data.choices || [])[0] || {}).message) || {}).content;
        var textOut = p === 'gemini'
          ? (out && out.map(function (x) { return x.text || ''; }).join('').trim())
          : (out || '').trim();
        if (!textOut) throw new Error('empty');
        return textOut;
      });
  }

  function sanitizeLLM(text) {
    var banned = [
      /살아\s*있(다|어|습니다|는)/,
      /(곧|조만간)\s*(갈|만날|보자)/,
      /데리러\s*(갈|올)/,
      /기다릴게/
    ];
    for (var i = 0; i < banned.length; i++) {
      if (banned[i].test(text)) {
        console.warn('[guardrail] LLM 출력 완화');
        return '나는 ' + state.profile.deceased + '의 말과 기억으로 이야기해. 지금 네 곁에 있는 사람과도 그 마음을 나눠 봐.';
      }
    }
    return text;
  }

  function sendMessage() {
    if (!state.profile) return;
    var input = $('#chatInput');
    var text = (input.value || '').trim();
    if (!text) return;

    pushMsg('me', text);
    input.value = '';
    input.style.height = 'auto';
    state.userTurns++;
    state.typing = true;
    renderChat();

    var local = state.persona.reply(text);

    function finish(reply) {
      state.typing = false;
      if (reply.guardrail) {
        state.chat.push({
          type: 'guard',
          label: reply.guardrail.label,
          text: '위험하거나 과몰입을 유도할 수 있는 말이라, 안전한 답변으로 바꿔서 전했어요.'
        });
        pushMsg('them', reply.text);
      } else {
        pushMsg('them', reply.text, reply);
      }
      renderChat();
    }

    if (local.guardrail) {
      setTimeout(function () { finish(local); }, 700);
      return;
    }

    if (llmOn()) {
      var done = false;
      var timer = setTimeout(function () {
        if (done) return;
        done = true;
        if (!state.warnedLLM) {
          state.warnedLLM = true;
          toast('LLM 응답이 늦어 내장 엔진으로 답했어요');
        }
        finish(local);
      }, 9000);

      callLLM(text).then(function (out) {
        if (done) return;
        done = true;
        clearTimeout(timer);
        finish({ text: sanitizeLLM(out), memory: local.memory, intent: local.intent });
      }).catch(function (err) {
        if (done) return;
        done = true;
        clearTimeout(timer);
        if (!state.warnedLLM) {
          state.warnedLLM = true;
          toast('LLM 연결 실패 → 내장 엔진으로 답합니다');
        }
        finish(local);
      });
      return;
    }

    setTimeout(function () { finish(local); }, 650 + Math.min(1300, text.length * 22));
  }

  /* ───────── 탭 ───────── */
  function switchTab(name) {
    $$('.tab').forEach(function (t) {
      var on = t.getAttribute('data-tab') === name;
      t.classList.toggle('is-active', on);
      t.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    $$('.view').forEach(function (v) {
      v.classList.toggle('is-active', v.id === 'view-' + name);
    });
    if (name === 'call') prepareCallIdle();
  }

  function setAnalysisCollapsed(v) {
    $('#analysisCard').classList.toggle('is-collapsed', !!v);
    $('#analysisToggle').setAttribute('aria-expanded', v ? 'false' : 'true');
  }

  /* ───────── 목소리 통화 ───────── */
  var callState = null;

  function resetCall() {
    if (callState) stopCallVisuals();
    callState = null;
    $('#callIdle').hidden = false;
    $('#callScreen').hidden = true;
    $('#callEnded').hidden = true;
    $('#callScreen').classList.remove('is-incoming');
  }

  function prepareCallIdle() {
    // 진행 중인 통화가 있으면 통화 화면을 그대로 복원한다 (탭을 오갔다고 통화가 사라지면 안 됨)
    if (callState && !callState.finished) {
      $('#callIdle').hidden = true;
      $('#callEnded').hidden = true;
      $('#callScreen').hidden = false;
      return;
    }
    if (callState && callState.finished) {
      $('#callIdle').hidden = true;
      $('#callScreen').hidden = true;
      $('#callEnded').hidden = false;
      return;
    }
    $('#callIdle').hidden = false;
    $('#callScreen').hidden = true;
    $('#callEnded').hidden = true;
    if (!state.profile) {
      $('#callName').textContent = '대화 상대';
    }
  }

  function startCall(mode) {
    if (!state.profile) {
      toast('먼저 대화를 불러와 주세요. 샘플로도 바로 체험할 수 있어요.');
      switchTab('chat');
      return;
    }
    if (callState && callState.timerId) return;

    callState = {
      mode: mode, connected: false, startedAt: 0, timerId: null,
      speaking: false, muted: false, history: [], rafId: null, revealId: null, finished: false
    };

    $('#callIdle').hidden = true;
    $('#callEnded').hidden = true;
    $('#callScreen').hidden = false;
    $('#callName').textContent = state.profile.deceased;
    $('#callAvatar').textContent = state.profile.deceased.slice(0, 1);
    $('#callAvatar').classList.add('is-ringing');
    $('#callTimer').textContent = '00:00';
    $('#subtitleSpeaker').textContent = mode === 'in' ? state.profile.deceased + ' 님' : '연결 중';
    $('#subtitleText').textContent = mode === 'in' ? '전화가 왔습니다' : '연결을 시도하고 있습니다';
    $('#callStatus').textContent = mode === 'in' ? '수신 전화' : '발신 중';
    $('#callScreen').classList.toggle('is-incoming', mode === 'in');

    drawCallWave(0.25);
    startWaveLoop();

    if (mode === 'in') {
      renderIncomingControls();
    } else {
      $('#callReplies').innerHTML = '';
      $$('.call-controls').forEach(function (c) { c.style.visibility = 'hidden'; });
      setTimeout(connectCall, 2100);
    }
  }

  function renderIncomingControls() {
    $$('.call-controls').forEach(function (c) { c.style.visibility = 'hidden'; });
    var box = $('#callReplies');
    box.innerHTML = '';
    var accept = document.createElement('button');
    accept.type = 'button';
    accept.className = 'reply-chip is-mic';
    accept.textContent = '📞 받기';
    accept.addEventListener('click', connectCall);
    var reject = document.createElement('button');
    reject.type = 'button';
    reject.className = 'reply-chip';
    reject.textContent = '거절';
    reject.addEventListener('click', function () {
      stopCallVisuals();
      resetCall();
      toast('전화를 받지 않았어요');
    });
    box.appendChild(accept);
    box.appendChild(reject);
  }

  function connectCall() {
    if (!callState) return;
    callState.connected = true;
    callState.startedAt = Date.now();
    $('#callScreen').classList.remove('is-incoming');
    $('#callAvatar').classList.remove('is-ringing');
    $('#callStatus').textContent = '통화 중';
    $$('.call-controls').forEach(function (c) { c.style.visibility = 'visible'; });
    $('#btnMute').classList.remove('is-off');

    callState.timerId = setInterval(function () {
      var s = Math.floor((Date.now() - callState.startedAt) / 1000);
      $('#callTimer').textContent = pad(Math.floor(s / 60)) + ':' + pad(s % 60);
    }, 500);

    renderCallReplies();

    var open = state.persona.opening();
    callState.history.push({ speaker: 'them', text: open });
    speakAsPersona(open, function () { });
  }

  function renderCallReplies() {
    var box = $('#callReplies');
    box.innerHTML = '';
    var items = [
      { label: '나야', text: '나야' },
      { label: '오늘 너무 보고 싶었어', text: '오늘 너무 보고 싶었어' },
      { label: '잘 지내셨어요?', text: '잘 지내셨어요?' }
    ];
    items.forEach(function (it) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'reply-chip';
      b.textContent = it.label;
      b.addEventListener('click', function () { userSpeaks(it.text); });
      box.appendChild(b);
    });

    var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SR) {
      var mic = document.createElement('button');
      mic.type = 'button';
      mic.className = 'reply-chip is-mic';
      mic.textContent = '🎙 직접 말하기';
      mic.addEventListener('click', function () { listenOnce(mic); });
      box.appendChild(mic);
    }
  }

  function listenOnce(btn) {
    var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return;
    try {
      var rec = new SR();
      rec.lang = 'ko-KR';
      rec.interimResults = false;
      rec.maxAlternatives = 1;
      btn.classList.add('is-listening');
      btn.textContent = '듣는 중…';
      rec.onresult = function (e) {
        var said = (e.results[0][0].transcript || '').trim();
        btn.classList.remove('is-listening');
        btn.textContent = '🎙 직접 말하기';
        if (said) userSpeaks(said);
      };
      rec.onerror = function () {
        btn.classList.remove('is-listening');
        btn.textContent = '🎙 직접 말하기';
        toast('마이크를 사용할 수 없어 예시 문장으로 진행할게요');
      };
      rec.onend = function () {
        btn.classList.remove('is-listening');
        btn.textContent = '🎙 직접 말하기';
      };
      rec.start();
    } catch (e) {
      toast('이 브라우저에서는 음성 인식을 지원하지 않아요');
    }
  }

  function userSpeaks(text) {
    if (!callState || callState.finished) return;
    callState.history.push({ speaker: 'me', text: text });
    $('#subtitleSpeaker').textContent = '나';
    typeSubtitle(text, function () { });
    var reply = state.persona.reply(text);
    callState.history.push({ speaker: 'them', text: reply.text });
    setTimeout(function () { speakAsPersona(reply.text); }, 700);
  }

  function typeSubtitle(text, done) {
    clearInterval(callState && callState.revealId);
    var el = $('#subtitleText');
    el.textContent = '';
    var i = 0;
    var interval = callState ? callState.revealId : null;
    interval = setInterval(function () {
      i++;
      el.textContent = text.slice(0, i);
      if (i >= text.length) {
        clearInterval(interval);
        if (callState) callState.revealId = null;
        if (done) done();
      }
    }, 34);
    if (callState) callState.revealId = interval;
  }

  function koreanVoice() {
    if (!('speechSynthesis' in window)) return null;
    var voices = window.speechSynthesis.getVoices() || [];
    var ko = voices.filter(function (v) { return /ko(-|_)KR|Korean/i.test(v.lang + ' ' + v.name); });
    return ko.length ? ko[0] : null;
  }

  function speakAsPersona(text, done) {
    if (!callState) return;
    $('#subtitleSpeaker').textContent = state.profile.deceased;
    typeSubtitle(text, function () {
      callState.speaking = false;
      if (done) done();
    });

    if (callState.muted || !('speechSynthesis' in window)) return;
    try {
      window.speechSynthesis.cancel();
      var u = new SpeechSynthesisUtterance(text);
      u.lang = 'ko-KR';
      u.rate = 0.94;
      u.pitch = 1.02;
      var v = koreanVoice();
      if (v) u.voice = v;
      callState.speaking = true;
      u.onend = function () { if (callState) callState.speaking = false; };
      u.onerror = function () { if (callState) callState.speaking = false; };
      window.speechSynthesis.speak(u);
    } catch (e) {
      callState.speaking = false;
    }
  }

  function hangUp() {
    if (!callState) return;
    var secs = callState.connected ? Math.floor((Date.now() - callState.startedAt) / 1000) : 0;
    callState.finished = true;
    stopCallVisuals();

    $('#callScreen').hidden = true;
    $('#callIdle').hidden = true;
    $('#callEnded').hidden = false;
    $('#endedTime').textContent = '통화 시간 ' + pad(Math.floor(secs / 60)) + ':' + pad(secs % 60);

    var lines = $('#endedLines');
    lines.innerHTML = '';
    callState.history.slice(-4).forEach(function (h) {
      var li = document.createElement('li');
      li.innerHTML = '<b>' + esc(h.speaker === 'me' ? '나' : state.profile.deceased) + '</b> · ' + esc(h.text);
      lines.appendChild(li);
    });

    var titles = ['오늘 통화는 여기까지', '목소리 잘 들었어', '여기서 잠깐 쉬어가자'];
    $('#endedTitle').textContent = titles[Math.floor(Math.random() * titles.length)];
  }

  function stopCallVisuals() {
    if (!callState) return;
    clearInterval(callState.timerId);
    clearInterval(callState.revealId);
    if (callState.rafId) cancelAnimationFrame(callState.rafId);
    callState.timerId = null;
    callState.revealId = null;
    callState.rafId = null;
    if ('speechSynthesis' in window) {
      try { window.speechSynthesis.cancel(); } catch (e) { }
    }
  }

  function fitCanvas(canvas) {
    var dpr = window.devicePixelRatio || 1;
    var rect = canvas.getBoundingClientRect();
    var w = Math.max(1, Math.round(rect.width || canvas.clientWidth || 320));
    var h = Math.max(1, Math.round(rect.height || canvas.clientHeight || 100));
    if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
      canvas.width = w * dpr;
      canvas.height = h * dpr;
    }
    var ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx: ctx, w: w, h: h };
  }

  var wavePhase = 0;
  function drawCallWave(level) {
    var canvas = $('#callWave');
    if (!canvas || canvas.offsetParent === null) return;
    var c = fitCanvas(canvas);
    var ctx = c.ctx, w = c.w, h = c.h;
    ctx.clearRect(0, 0, w, h);
    var bars = 38;
    var gap = 5;
    var bw = Math.max(3, (w - gap * (bars - 1)) / bars);
    wavePhase += 0.12;
    for (var i = 0; i < bars; i++) {
      var centerDist = Math.abs(i - (bars - 1) / 2) / ((bars - 1) / 2);
      var wave = Math.sin(wavePhase + i * 0.45) * 0.5 + Math.sin(wavePhase * 0.7 + i * 0.9) * 0.3;
      var amp = (0.38 + Math.abs(wave) * 0.62) * (1 - centerDist * 0.28) * level;
      var bh = Math.max(5, amp * h * 0.92);
      var x = i * (bw + gap);
      var y = (h - bh) / 2;
      var grad = ctx.createLinearGradient(0, y, 0, y + bh);
      grad.addColorStop(0, 'rgba(213,130,111,.85)');
      grad.addColorStop(1, 'rgba(127,154,131,.85)');
      ctx.fillStyle = grad;
      roundRect(ctx, x, y, bw, bh, bw / 2);
      ctx.fill();
    }
  }

  function roundRect(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function startWaveLoop() {
    if (!callState) return;
    function loop() {
      if (!callState || callState.finished) return;
      var speaking = callState.speaking;
      var level = speaking ? 0.9 + Math.random() * 0.25 : 0.55 + Math.random() * 0.12;
      drawCallWave(level);
      callState.rafId = requestAnimationFrame(loop);
    }
    loop();
  }

  /* ───────── 음성 파일 분석 ───────── */
  function handleVoiceFile(file) {
    if (!file) return;
    if (!/^(audio|video)\//.test(file.type) && !/\.(mp3|m4a|wav|aac|ogg|mp4|mov)$/i.test(file.name)) {
      toast('음성이나 영상 파일을 올려주세요');
      return;
    }
    if (file.size > 60 * 1024 * 1024) {
      toast('60MB 이하 파일을 권장해요');
      return;
    }
    $('#wavePanel').hidden = false;
    $('#waveFile').textContent = file.name;
    $('#waveBadge').textContent = '분석 중…';
    $('#waveStats').innerHTML = '';

    var reader = new FileReader();
    reader.onload = function () {
      var buf = reader.result;
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) { fallbackWave(file); return; }
      var ctx;
      try { ctx = new AC(); } catch (e) { fallbackWave(file); return; }
      var onAudio = function (audio) {
        var ch = audio.getChannelData(0);
        var peaks = [];
        var bars = 160;
        var step = Math.floor(ch.length / bars) || 1;
        for (var i = 0; i < bars; i++) {
          var max = 0;
          for (var j = 0; j < step; j += 8) {
            var v = Math.abs(ch[i * step + j] || 0);
            if (v > max) max = v;
          }
          peaks.push(max);
        }
        // 음성 구간 세기
        var threshold = 0.03;
        var segments = 0, inSeg = false, speechSamples = 0;
        for (var k = 0; k < peaks.length; k++) {
          if (peaks[k] > threshold) {
            speechSamples++;
            if (!inSeg) { segments++; inSeg = true; }
          } else if (peaks[k] < threshold * 0.35) {
            inSeg = false;
          }
        }
        state.voice = { name: file.name, duration: audio.duration, peaks: peaks, segments: segments };
        drawVoiceWave(peaks);
        $('#waveBadge').textContent = '분석 완료';
        renderVoiceStats({
          length: fmtDur(audio.duration),
          segments: segments,
          rate: (audio.sampleRate / 1000).toFixed(1) + 'kHz'
        });
        try { ctx.close(); } catch (e) { }
      };
      try {
        ctx.decodeAudioData(buf.slice(0), onAudio, function () { fallbackWave(file); });
      } catch (e) {
        fallbackWave(file);
      }
    };
    reader.onerror = function () { fallbackWave(file); };
    reader.readAsArrayBuffer(file);
  }

  function fallbackWave(file) {
    var peaks = [];
    for (var i = 0; i < 160; i++) {
      peaks.push(0.15 + Math.abs(Math.sin(i * 0.35 + file.size * 0.001)) * 0.55);
    }
    state.voice = { name: file.name, duration: 0, peaks: peaks, segments: 0 };
    drawVoiceWave(peaks);
    $('#waveBadge').textContent = '미리보기';
    renderVoiceStats({ length: '확인 불가', segments: 0, rate: '—' });
  }

  function fmtDur(sec) {
    if (!isFinite(sec)) return '—';
    return Math.floor(sec / 60) + ':' + pad(Math.round(sec % 60));
  }

  function renderVoiceStats(o) {
    var box = $('#waveStats');
    box.innerHTML = '';
    var items = [
      '길이 ' + o.length,
      '음성 구간 ' + o.segments + '개',
      '샘플레이트 ' + o.rate
    ];
    items.forEach(function (t) {
      var li = document.createElement('li');
      li.textContent = t;
      box.appendChild(li);
    });
  }

  function drawVoiceWave(peaks) {
    var canvas = $('#voiceWave');
    if (!canvas) return;
    var c = fitCanvas(canvas);
    var ctx = c.ctx, w = c.w, h = c.h;
    ctx.clearRect(0, 0, w, h);
    var n = peaks.length;
    var bw = Math.max(1, w / n - 0.6);
    for (var i = 0; i < n; i++) {
      var bh = Math.max(2, Math.min(1, peaks[i] * 2.2) * (h - 6));
      var x = i * (w / n);
      ctx.fillStyle = i / n > 0.62 ? 'rgba(127,154,131,.8)' : 'rgba(213,130,111,.72)';
      roundRect(ctx, x, (h - bh) / 2, bw, bh, bw / 2);
      ctx.fill();
    }
  }

  /* ───────── 가드레일 테스트 ───────── */
  function testGuardrail(text, btn) {
    $$('#testChips .chip-btn').forEach(function (b) { b.classList.toggle('is-on', b === btn); });
    var persona = state.persona || window.OnGi.createPersona({
      deceased: '엄마', counterpart: '나', nicknames: [], emojis: [], phrases: [],
      memories: [], keywords: { food: [], place: [], care: [] }, speechLevel: '반말', endings: []
    });
    var r = persona.reply(text);
    var result = $('#testResult');
    result.hidden = false;
    $('#testLabel').textContent = r.guardrail ? '🛡 ' + r.guardrail.label : '일반 응답';
    $('#testQuote').textContent = '입력: “' + text + '”';
    $('#testAnswer').textContent = r.text;
  }

  /* ───────── 인증 단계 ───────── */
  function renderVerify() {
    $$('#verifySteps .step').forEach(function (li) {
      var n = +li.getAttribute('data-step');
      var done = n <= state.verifyStep;
      var active = n === state.verifyStep + 1;
      li.classList.toggle('is-done', done);
      li.classList.toggle('is-active', active);
      li.querySelector('.step-state').textContent = done ? '완료' : active ? '진행' : '대기';
    });
    var note = $('#verifyNote');
    if (state.verifyStep >= 3) {
      note.textContent = '확인 완료 — 대화·통화 기능이 열립니다. (데모)';
      $('#btnVerifyNext').disabled = true;
    } else {
      note.textContent = '3단계 모두 완료되어야 대화·통화 기능이 열립니다.';
      $('#btnVerifyNext').disabled = false;
    }
  }

  /* ───────── 설정 모달 ───────── */
  function openSettings() {
    $('#settingsModal').hidden = false;
    $('#engineSelect').value = state.engine.provider;
    $('#apiKeyInput').value = state.engine.key;
    $('#modelInput').value = state.engine.model;
    syncSettingsFields();
    setTimeout(function () { $('#engineSelect').focus(); }, 30);
  }

  function closeSettings() { $('#settingsModal').hidden = true; }

  function syncSettingsFields() {
    var v = $('#engineSelect').value;
    $('#keyField').hidden = v === 'local';
    $('#modelField').hidden = v === 'local';
    $('#modelInput').placeholder = v === 'gemini' ? 'gemini-2.0-flash' : 'gpt-4o-mini';
  }

  function saveEngine() {
    var v = $('#engineSelect').value;
    var key = ($('#apiKeyInput').value || '').trim();
    if (v !== 'local' && !key) {
      toast('API 키를 입력하거나 내장 엔진을 선택해 주세요');
      return;
    }
    state.engine = { provider: v, key: key, model: ($('#modelInput').value || '').trim() };
    closeSettings();
    updateChatHeader();
    toast(v === 'local' ? '내장 엔진으로 동작합니다' : v.toUpperCase() + ' 연결을 켰어요 (키는 저장하지 않습니다)');
  }

  /* ───────── 초기화 ───────── */
  function resetAll() {
    state.raw = null; state.messages = []; state.profile = null; state.persona = null;
    state.chat = []; state.userTurns = 0; state.warnedLLM = false;
    $('#analysisBody').innerHTML = '<div class="empty-analysis"><p class="empty-title">아직 분석한 대화가 없어요</p>' +
      '<p class="empty-desc">샘플을 열거나 카톡 파일을 올리면<br>말투·호칭·기억 키워드를 뽑아 보여드려요.</p></div>';
    $('#chatBody').innerHTML = '<div class="chat-empty" id="chatEmpty">' +
      '<p class="empty-title">먼저 대화를 불러와 주세요</p>' +
      '<p class="empty-desc">왼쪽에서 샘플을 열거나 카톡 파일을 올리면<br>그 사람의 말투로 안부를 나눌 수 있어요.</p>' +
      '<div class="empty-actions"><button type="button" class="btn btn-sage btn-sm" data-sample="0">엄마와의 마지막 카톡</button>' +
      '<button type="button" class="btn btn-ghost btn-sm" data-sample="1">할아버지와의 대화</button></div></div>';
    $('#chatSuggest').innerHTML = '';
    $('#chatName').textContent = '대화 상대';
    $('#chatStatus').textContent = '말투·기억을 반영한 데모 엔진';
    $('#chatAvatar').textContent = '온';
    $('#chatInput').disabled = true;
    $('#chatSend').disabled = true;
    $('#chatInput').value = '';
    $$('.sample-btn').forEach(function (b) { b.classList.remove('is-loaded'); });
    state.voice = null;
    $('#wavePanel').hidden = true;
    resetCall();
    switchTab('chat');
    toast('처음 상태로 돌아왔어요');
  }

  /* ───────── 이벤트 ───────── */
  function bind() {
    document.addEventListener('click', function (e) {
      var b = e.target.closest ? e.target.closest('[data-sample]') : null;
      if (b) loadSample(+b.getAttribute('data-sample'));
    });

    var dz = $('#dropzone');
    var fi = $('#fileInput');
    dz.addEventListener('click', function () { fi.click(); });
    dz.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fi.click(); }
    });
    fi.addEventListener('change', function () {
      if (fi.files && fi.files[0]) handleFile(fi.files[0]);
      fi.value = '';
    });
    ['dragenter', 'dragover'].forEach(function (ev) {
      dz.addEventListener(ev, function (e) { e.preventDefault(); dz.classList.add('is-drag'); });
    });
    ['dragleave', 'drop'].forEach(function (ev) {
      dz.addEventListener(ev, function (e) { e.preventDefault(); dz.classList.remove('is-drag'); });
    });
    dz.addEventListener('drop', function (e) {
      var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (f) handleFile(f);
    });

    var vd = $('#voiceDrop');
    var vi = $('#voiceInput');
    vd.addEventListener('click', function () { vi.click(); });
    vd.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); vi.click(); }
    });
    vi.addEventListener('change', function () {
      if (vi.files && vi.files[0]) handleVoiceFile(vi.files[0]);
      vi.value = '';
    });
    ['dragenter', 'dragover'].forEach(function (ev) {
      vd.addEventListener(ev, function (e) { e.preventDefault(); vd.classList.add('is-drag'); });
    });
    ['dragleave', 'drop'].forEach(function (ev) {
      vd.addEventListener(ev, function (e) { e.preventDefault(); vd.classList.remove('is-drag'); });
    });
    vd.addEventListener('drop', function (e) {
      var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (f) handleVoiceFile(f);
    });

    $$('.tab').forEach(function (t) {
      t.addEventListener('click', function () { switchTab(t.getAttribute('data-tab')); });
    });

    var input = $('#chatInput');
    input.addEventListener('input', function () {
      input.style.height = 'auto';
      input.style.height = Math.min(110, input.scrollHeight) + 'px';
    });
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
        e.preventDefault();
        sendMessage();
      }
    });
    $('#chatForm').addEventListener('submit', function (e) { e.preventDefault(); sendMessage(); });
    $('#btnGoCall').addEventListener('click', function () { switchTab('call'); });

    $('#btnSettings').addEventListener('click', openSettings);
    $('#settingsModal').addEventListener('click', function (e) {
      if (e.target.getAttribute('data-close')) closeSettings();
    });
    $('#engineSelect').addEventListener('change', syncSettingsFields);
    $('#btnSaveEngine').addEventListener('click', saveEngine);
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !$('#settingsModal').hidden) closeSettings();
    });

    $('#btnReset').addEventListener('click', resetAll);
    $('#analysisToggle').addEventListener('click', function () {
      setAnalysisCollapsed(!$('#analysisCard').classList.contains('is-collapsed'));
    });

    $('#btnCall').addEventListener('click', function () { startCall('out'); });
    $('#btnReceive').addEventListener('click', function () { startCall('in'); });
    $('#btnHangup').addEventListener('click', hangUp);
    $('#btnCallAgain').addEventListener('click', function () {
      $('#callEnded').hidden = true;
      startCall('out');
    });
    $('#btnBackChat').addEventListener('click', function () {
      // 종료 화면을 닫고 대화로 돌아갈 때는 통화 상태를 비운다.
      // (남겨두면 다음에 통화 탭에 들어왔을 때 종료 화면이 되살아나 발신·수신 버튼이 잠긴다)
      resetCall();
      switchTab('chat');
    });
    $('#btnMute').addEventListener('click', function () {
      if (!callState) return;
      callState.muted = !callState.muted;
      $('#btnMute').classList.toggle('is-off', callState.muted);
      $('#muteLabel').textContent = callState.muted ? '소리 켜기' : '소리 끄기';
      if (callState.muted && 'speechSynthesis' in window) {
        try { window.speechSynthesis.cancel(); } catch (e) { }
        callState.speaking = false;
      }
    });

    $$('#testChips .chip-btn').forEach(function (b) {
      b.addEventListener('click', function () { testGuardrail(b.getAttribute('data-test'), b); });
    });

    $('#btnVerifyNext').addEventListener('click', function () {
      if (state.verifyStep >= 3) return;
      state.verifyStep++;
      renderVerify();
      if (state.verifyStep === 3) toast('유가족 확인 3단계를 모두 마쳤어요 (데모)');
    });
    $('#btnVerifyReset').addEventListener('click', function () {
      state.verifyStep = 0;
      renderVerify();
      $('#testResult').hidden = true;
      $$('#testChips .chip-btn').forEach(function (b) { b.classList.remove('is-on'); });
    });

    window.addEventListener('resize', function () {
      if (state.voice) drawVoiceWave(state.voice.peaks);
      drawCallWave(0.3);
    });
  }

  function init() {
    bind();
    renderVerify();
    setTimeout(function () {
      if ('speechSynthesis' in window) {
        try { window.speechSynthesis.getVoices(); } catch (e) { }
      }
    }, 300);
    window.__ongi = {
      get profile() { return state.profile; },
      get persona() { return state.persona; },
      get chat() { return state.chat; }
    };
    console.log('[온기] 데모 준비 완료 · 샘플 ' + SAMPLES.length + '종');
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();

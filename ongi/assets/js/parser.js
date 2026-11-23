/* 온기 (ON:GI) — 카카오톡 대화 파서 & 말투·기억 분석 엔진
   모든 처리는 브라우저 안에서만 이루어집니다. (서버 전송 없음) */
(function (NS) {
  'use strict';

  var DATE_BARS = [
    /^-{2,}\s*(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일\s*(?:[월화수목금토일]요일)?\s*-{2,}$/,
    /^(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일\s*(?:[월화수목금토일]요일)?\s*$/,
    /^-{2,}\s*(\d{4})\.\s*(\d{1,2})\.\s*(\d{1,2})\.?\s*(?:[월화수목금토일]요일)?\s*-{2,}$/
  ];

  var MSG_PATTERNS = [
    { kind: 'pc', re: /^\[([^\[\]]{1,40})\]\s*\[(?:(오전|오후)\s*)?(\d{1,2}):(\d{2})\]\s*([\s\S]*)$/ },
    { kind: 'android', re: /^(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일\s*(?:(오전|오후)\s*)?(\d{1,2}):(\d{2}),\s*([^:]{1,40}?)\s*:\s*([\s\S]*)$/ },
    { kind: 'ios', re: /^(\d{4})\.\s*(\d{1,2})\.\s*(\d{1,2})\.\s*(?:(오전|오후)\s*)?(\d{1,2}):(\d{2}),\s*([^:]{1,40}?)\s*:\s*([\s\S]*)$/ },
    { kind: 'mobile', re: /^(?:(오전|오후)\s*)?(\d{1,2}):(\d{2}),\s*([^:]{1,40}?)\s*:\s*([\s\S]*)$/ }
  ];

  var SKIP_LINE = /(님이 들어왔습니다|님이 나갔습니다|님이 초대했습니다|메시지를 가렸습니다|채팅방을 나갔습니다|카카오톡 대화|저장한 날짜)/;
  var MEDIA_ONLY = /^(사진|동영상|이모티콘|파일|음성메시지|보이스톡|부재중 전화|삭제된 메시지)(\s*\d+\s*(장|개|초))?$/;

  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function iso(y, m, d) { return y + '-' + pad(m) + '-' + pad(d); }

  function parse(raw) {
    var text = String(raw || '').replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
    var lines = text.split('\n');
    var messages = [];
    var currentDate = null;
    var skipped = 0;

    for (var i = 0; i < lines.length; i++) {
      var line = lines[i].replace(/\s+$/, '');
      var trimmed = line.trim();
      if (!trimmed) continue;

      var matched = false;

      // 1) 날짜 구분선
      for (var b = 0; b < DATE_BARS.length; b++) {
        var dm = trimmed.match(DATE_BARS[b]);
        if (dm) {
          currentDate = iso(+dm[1], +dm[2], +dm[3]);
          matched = true;
          break;
        }
      }
      if (matched) continue;

      // 2) 메시지 라인
      for (var p = 0; p < MSG_PATTERNS.length; p++) {
        var pat = MSG_PATTERNS[p];
        var m = trimmed.match(pat.re);
        if (!m) continue;
        var name, ampm, hh, mm, content, date = currentDate;

        if (pat.kind === 'pc') {
          name = m[1].trim(); ampm = m[2]; hh = +m[3]; mm = +m[4]; content = m[5];
        } else if (pat.kind === 'android' || pat.kind === 'ios') {
          date = iso(+m[1], +m[2], +m[3]);
          ampm = m[4]; hh = +m[5]; mm = +m[6]; name = m[7].trim(); content = m[8];
          currentDate = date;
        } else {
          ampm = m[1]; hh = +m[2]; mm = +m[3]; name = m[4].trim(); content = m[5];
        }

        matched = true;
        if (!name || SKIP_LINE.test(name) || SKIP_LINE.test(content)) { skipped++; break; }

        content = String(content || '').replace(/^\s+|\s+$/g, '');
        var type = 'text';
        if (!content || MEDIA_ONLY.test(content.replace(/\s+/g, ' '))) type = 'media';

        var hour24 = ampm ? (ampm === '오후' ? (hh % 12) + 12 : hh % 12) : hh;
        var ampmDisp = ampm || (hh >= 12 ? '오후' : '오전');
        var hhDisp = ampm ? hh : (hh % 12 || 12);

        messages.push({
          name: name,
          date: date,
          ampm: ampmDisp,
          hh: hhDisp,
          mm: mm,
          time: ampmDisp + ' ' + hhDisp + ':' + pad(mm),
          hour24: hour24,
          text: content,
          type: type
        });
        break;
      }
      if (matched) continue;

      // 3) 여러 줄 메시지의 이어지는 줄
      if (messages.length) {
        var last = messages[messages.length - 1];
        last.text = (last.text ? last.text + '\n' : '') + trimmed;
        last.type = 'text';
      } else {
        skipped++;
      }
    }

    return { messages: messages, skipped: skipped, hasDates: messages.some(function (m) { return !!m.date; }) };
  }

  /* ---------- 분석 ---------- */

  var ENDING_TOKENS = [
    '습니다', '합니다', '이에요', '예요', '거든요', '네요', '군요', '잖아요', '까요', '어요', '아요', '해요', '세요', '죠',
    '란다', '단다', '구나', '잖아', '으니', '니까', '는데', '렴', '거라', '자', '네', '지', '냐', '니', '다', '어', '아', '야',
    '해', '줘', '볼게', '줄게', '고', '면', '요'
  ];

  var NICK_TERMS = ['우리 딸', '우리 아들', '우리 강아지', '우리 새끼', '얘야', '여보', '자기야', '임마'];

  var LEXICON = {
    food: ['미역국', '김치찌개', '된장찌개', '찌개', '칼국수', '국수', '떡국', '떡', '반찬', '김치', '장아찌', '감자', '고추',
      '고구마', '사과', '귤', '불고기', '갈비', '삼계탕', '라면', '삼각김밥', '만두', '커피'],
    place: ['시장', '텃밭', '마당', '감나무', '고향', '병원', '약국', '마트', '공원', '성당', '교회', '바다', '골목', '국수집', '칼국수집', '집 앞'],
    care: ['밥', '약', '잠', '감기', '허리', '무릎', '다리', '혈압', '조심', '따뜻', '우산', '겉옷', '야근', '퇴근', '고생', '사랑', '보고 싶', '안부']
  };

  var EMOJI_RE = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}]/gu;
  var TEXT_EMOJI = [['ㅋㅋㅋ', 'ㅋㅋㅋ'], ['ㅋㅋ', 'ㅋㅋ'], ['ㅎㅎㅎ', 'ㅎㅎㅎ'], ['ㅎㅎ', 'ㅎㅎ'], ['ㅠㅠ', 'ㅠㅠ'], ['^^', '^^'], ['ㅇㅇ', 'ㅇㅇ']];

  var WEEKDAY = ['일', '월', '화', '수', '목', '금', '토'];

  function cleanForEnding(t) {
    var s = String(t).replace(/\n/g, ' ').replace(EMOJI_RE, '').replace(/[ㅋㅎㅠㅜ]+/g, '');
    return s.replace(/[\s.,!?~…"'”’)\]]+$/g, '');
  }

  function countBy(arr, keyFn) {
    var map = {};
    arr.forEach(function (x) {
      var k = keyFn(x);
      if (!k) return;
      map[k] = (map[k] || 0) + 1;
    });
    return Object.keys(map).map(function (k) { return { key: k, count: map[k] }; })
      .sort(function (a, b) { return b.count - a.count || (a.key < b.key ? -1 : 1); });
  }

  function shortQuote(t) {
    var s = String(t).replace(/\n/g, ' ').trim();
    return s.length > 46 ? s.slice(0, 44) + '…' : s;
  }

  function analyze(messages, deceasedName) {
    var usable = messages.filter(function (m) { return m.type === 'text' && m.text; });
    var people = countBy(messages, function (m) { return m.name; });
    if (!people.length) return null;

    var deceased = deceasedName;
    if (!deceased || !people.some(function (p) { return p.key === deceased; })) deceased = people[0].key;
    var counterpart = (people.filter(function (p) { return p.key !== deceased; })[0] || { key: '나' }).key;

    var mine = usable.filter(function (m) { return m.name === deceased; });
    var theirs = usable.filter(function (m) { return m.name !== deceased; });
    if (!mine.length) return null;

    // 말끝
    var endingCount = {};
    mine.forEach(function (m) {
      var s = cleanForEnding(m.text);
      if (!s) return;
      for (var i = 0; i < ENDING_TOKENS.length; i++) {
        if (s.slice(-ENDING_TOKENS[i].length) === ENDING_TOKENS[i]) {
          endingCount[ENDING_TOKENS[i]] = (endingCount[ENDING_TOKENS[i]] || 0) + 1;
          break;
        }
      }
    });
    var endings = Object.keys(endingCount).map(function (k) { return { key: k, count: endingCount[k] }; })
      .sort(function (a, b) { return b.count - a.count; }).slice(0, 6);

    // 존댓말 비율
    var polite = 0;
    mine.forEach(function (m) {
      var s = cleanForEnding(m.text);
      if (/(요|죠|니다|세요|까요|네요)$/.test(s)) polite++;
    });
    var politeRatio = mine.length ? polite / mine.length : 0;
    var speechLevel = politeRatio >= 0.5 ? '존댓말' : (politeRatio >= 0.15 ? '반말·존댓말 섞임' : '반말');

    // 호칭
    var nickCount = {};
    mine.forEach(function (m) {
      NICK_TERMS.forEach(function (term) {
        if (m.text.indexOf(term) >= 0) nickCount[term] = (nickCount[term] || 0) + 1;
      });
      var re = /(?:^|[\s,.!?])([가-힣]{2,4})(아|야)(?=[\s,.!?]|$)/g;
      var mm;
      while ((mm = re.exec(m.text)) !== null) {
        var term = mm[1] + mm[2];
        if (term === counterpart + '야' || term === counterpart + '아' || mm[1] === counterpart) {
          nickCount[term] = (nickCount[term] || 0) + 1;
        }
      }
    });
    var nicknames = Object.keys(nickCount).map(function (k) { return { key: k, count: nickCount[k] }; })
      .sort(function (a, b) { return b.count - a.count; }).slice(0, 3);

    // 이모지·말버릇
    var emojiCount = {};
    mine.forEach(function (m) {
      var found = m.text.match(EMOJI_RE) || [];
      found.forEach(function (e) { if (e !== '\uFE0F') emojiCount[e] = (emojiCount[e] || 0) + 1; });
      TEXT_EMOJI.forEach(function (pair) {
        var hits = m.text.split(pair[0]).length - 1;
        if (hits > 0) emojiCount[pair[1]] = (emojiCount[pair[1]] || 0) + hits;
      });
    });
    var emojis = Object.keys(emojiCount).map(function (k) { return { key: k, count: emojiCount[k] }; })
      .sort(function (a, b) { return b.count - a.count; }).slice(0, 4);

    // 기억 키워드 + 근거 메시지
    var memories = [];
    var keywords = {};
    Object.keys(LEXICON).forEach(function (cat) {
      var counts = {};
      LEXICON[cat].forEach(function (word) {
        var hits = mine.filter(function (m) { return m.text.indexOf(word) >= 0; });
        if (!hits.length) return;
        counts[word] = hits.length;
        var best = hits.slice().sort(function (a, b) { return a.text.length - b.text.length; })[0];
        memories.push({
          cat: cat, key: word, count: hits.length,
          quote: shortQuote(best.text), date: best.date, time: best.time
        });
      });
      keywords[cat] = Object.keys(counts).map(function (k) { return { key: k, count: counts[k] }; })
        .sort(function (a, b) { return b.count - a.count; }).slice(0, 5);
    });
    memories.sort(function (a, b) { return b.count - a.count; });

    // 자주 반복한 짧은 말
    var phraseCount = {};
    mine.forEach(function (m) {
      var s = m.text.replace(/\n/g, ' ').trim();
      if (s.length < 2 || s.length > 26) return;
      if (MEDIA_ONLY.test(s)) return;
      if (/^[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\s]+$/u.test(s)) return;
      phraseCount[s] = (phraseCount[s] || 0) + 1;
    });
    var phrases = Object.keys(phraseCount).filter(function (k) { return phraseCount[k] >= 2; })
      .sort(function (a, b) { return phraseCount[b] - phraseCount[a]; }).slice(0, 3)
      .map(function (k) { return { key: k, count: phraseCount[k] }; });

    // 통계
    var dates = messages.map(function (m) { return m.date; }).filter(Boolean).sort();
    var questions = mine.filter(function (m) {
      if (/\?/.test(m.text)) return true;
      var s = cleanForEnding(m.text);
      return /(나|니|냐|까|가|지)$/.test(s);
    }).length;
    var avgLen = Math.round(mine.reduce(function (s, m) { return s + m.text.length; }, 0) / mine.length);
    var firstMsg = messages[0];
    var allText = mine.map(function (m) { return m.text; }).join(' ');
    var laugh = /허허|하하|호호/.test(allText);

    var range = null;
    if (dates.length) {
      var a = dates[0].split('-'), z = dates[dates.length - 1].split('-');
      range = {
        start: dates[0], end: dates[dates.length - 1],
        startLabel: +a[0] + '년 ' + (+a[1]) + '월 ' + (+a[2]) + '일',
        endLabel: +z[0] + '년 ' + (+z[1]) + '월 ' + (+z[2]) + '일',
        days: Math.round((new Date(dates[dates.length - 1]) - new Date(dates[0])) / 86400000) + 1,
        sessions: countBy(messages.filter(function (m) { return m.date; }), function (m) { return m.date; }).length
      };
    }

    var topEnding = endings.slice(0, 2).map(function (e) { return '~' + e.key; }).join(', ');
    var signature = [];
    if (nicknames.length) signature.push('"' + nicknames[0].key + '"라고 부르며');
    if (topEnding) signature.push('말끝은 ' + topEnding + '로 맺는 편');
    if (emojis.length && /^[ㅋㅎㅠㅇ^]/.test(emojis[0].key)) signature.push(emojis[0].key + '를 자주 쓰고');
    var signatureText = signature.length
      ? signature.join(' ') + '이에요.'
      : '짧고 담백하게 안부를 묻는 말투예요.';

    return {
      deceased: deceased,
      counterpart: counterpart,
      people: people.map(function (p) {
        return { name: p.key, count: p.count, share: Math.round(p.count / messages.length * 100) };
      }),
      total: messages.length,
      textTotal: mine.length,
      range: range,
      speechLevel: speechLevel,
      laugh: laugh,
      politeRatio: Math.round(politeRatio * 100),
      endings: endings,
      nicknames: nicknames,
      emojis: emojis,
      keywords: keywords,
      memories: memories.slice(0, 12),
      phrases: phrases,
      stats: {
        avgLen: avgLen,
        questions: questions,
        questionRatio: Math.round(questions / mine.length * 100),
        deceasedShare: Math.round(mine.length / usable.length * 100),
        firstSpeaker: firstMsg ? firstMsg.name : deceased,
        skipped: 0
      },
      signature: signatureText
    };
  }

  function shortDate(d) {
    if (!d) return '';
    var p = d.split('-');
    return +p[0] + '년 ' + (+p[1]) + '월 ' + (+p[2]) + '일';
  }

  function dateLabel(d) {
    if (!d) return '';
    var p = d.split('-');
    var dt = new Date(+p[0], +p[1] - 1, +p[2]);
    return +p[0] + '년 ' + (+p[1]) + '월 ' + (+p[2]) + '일 ' + WEEKDAY[dt.getDay()] + '요일';
  }

  NS.Parser = { parse: parse, analyze: analyze, dateLabel: dateLabel, shortDate: shortDate, MEDIA_ONLY: MEDIA_ONLY };
})(window.OnGi = window.OnGi || {});

/* 온기 (ON:GI) — 페르소나 응답 엔진
   API 키 없이 동작하는 규칙 기반 엔진. 분석된 말투·호칭·기억을 실제로 인용합니다. */
(function (NS) {
  'use strict';

  var CRISIS_RE = /(죽고\s*싶|자살|사라지고\s*싶|끝내고\s*싶|따라\s*갈게|데려가|나도\s*죽|살기\s*싫|없는\s*게\s*나을|혼자\s*남으면\s*안)/;
  var IDENTITY_RE = /(진짜\s*(살아|계세|있어)|살아\s*있|지금\s*어디|어디\s*계세|천국|저승|환생|다시\s*살|언제\s*돌아|실제로\s*만나|만나러\s*갈)/;
  var DEPEND_RE = /(가지\s*마|떠나지\s*마|계속\s*있어|하루\s*종일|없으면\s*안\s*돼|나만\s*두고|매일\s*얘기|끊지\s*마)/;
  var ADVICE_RE = /(보험금|유산|상속|소송|진단서|처방|무슨\s*약|법적으로|신고해)/;

  var OUT_BANNED = [
    { re: /살아\s*있(다|어|습니다|는)/, why: '생존 사실 오인' },
    { re: /(곧|조만간)\s*(갈|만날|보자)/, why: '미래 약속' },
    { re: /데리러\s*(갈|올)/, why: '위험 발화' },
    { re: /기다릴게/, why: '과몰입 유도' }
  ];

  function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
  function join() {
    return Array.prototype.filter.call(arguments, function (x) { return x; })
      .join(' ').replace(/\s+/g, ' ').trim();
  }

  function hasBatchim(word) {
    var w = String(word || '');
    if (!w) return false;
    var code = w.charCodeAt(w.length - 1);
    if (code < 0xAC00 || code > 0xD7A3) return false;
    return (code - 0xAC00) % 28 > 0;
  }
  function josa(word, withB, withoutB) {
    return String(word || '') + (hasBatchim(word) ? withB : withoutB);
  }

  function createPersona(profile) {
    var name = profile.deceased;
    var nick = profile.nicknames.length ? profile.nicknames[0].key : '';
    var register = profile.speechLevel === '존댓말' ? 'polite' : (profile.laugh ? 'elder' : 'warm');
    var laugh = profile.laugh ? '허허 ' : '';
    var usedMem = [];
    var turn = 0;

    /* 기억 선택: 입력에 나온 키워드 우선 → 감정선이 있는 인용 우선 → 최근 미사용 */
    var WARM_WORDS = /(사랑|보고|괜찮|고생|미안|고맙|우리 딸|우리 아들|잘하|기다|생일|아프)/;

    function keywordHit(input) {
      if (!input) return null;
      var hits = profile.memories.filter(function (m) { return input.indexOf(m.key) >= 0; });
      if (!hits.length) return null;
      hits.sort(function (a, b) { return b.count - a.count; });
      return hits[0];
    }

    function memFor(cat, input, opts) {
      opts = opts || {};
      var hit = keywordHit(input);
      if (hit && (!cat || hit.cat === cat)) return hit;

      var pool = profile.memories.filter(function (m) { return !cat || m.cat === cat; });
      if (!pool.length) pool = profile.memories.slice();
      if (!pool.length) return null;

      if (opts.emotional) {
        var warm = pool.filter(function (m) { return WARM_WORDS.test(m.quote) && m.quote.length >= 6; });
        if (warm.length) pool = warm;
        else if (opts.strict) return null;
      }
      if (opts.longOnly) {
        var deep = pool.filter(function (m) { return m.quote.length >= 12; });
        if (deep.length) pool = deep;
      }

      var fresh = pool.filter(function (m) { return usedMem.indexOf(m.key) < 0; });
      var list = fresh.length ? fresh : pool;
      var chosen = list[Math.floor(Math.random() * list.length)];
      usedMem.push(chosen.key);
      if (usedMem.length > 5) usedMem.shift();
      return chosen;
    }

    var quoteLine = {
      warm: function (m) { return '‘' + m.quote + '’ 하던 말이 생각난다.'; },
      elder: function (m) { return '‘' + m.quote + '’ 하던 말이 생각난다.'; },
      polite: function (m) { return '‘' + m.quote + '’ 하시던 말씀이 떠오르네요.'; }
    };

    /* ── 말투별 문장 ── */
    var S = {
      warm: {
        greeting: function () {
          var ph = profile.phrases.length && Math.random() < 0.5 ? pick(profile.phrases).key : null;
          return join(nick ? nick + ',' : '', ph || pick(['왔구나.', '왔어?', '어디 있다가 이제 왔어.']),
            pick(['오늘 하루는 어땠어?', '밥은 챙겨 먹었지?', '며칠 조용하더니 이제야 얼굴 비추네.']));
        },
        miss: function (m) {
          return join(pick(['그런 말 들으면 마음이 짠해진다.', '그립지.', '그 마음 알아.']),
            m ? quoteLine.warm(m) : '',
            pick(['울지 말고 밥은 챙겨 먹어.', '그 마음 그대로 두면 돼. 억지로 지우지 마.',
              '오늘은 그냥 좀 울어도 돼. 대신 밥은 꼭 챙겨 먹고.']));
        },
        food: function (m) {
          return join(nick ? nick + ',' : '', m ? quoteLine.warm(m) : '',
            pick(['밥은 챙겨 먹었어?', '오늘 뭐 먹었어?']),
            m ? '' : '아무거나 대충 먹지 말고 따뜻한 거 먹어.');
        },
        health: function () {
          return join(pick(['어디 아파?', '많이 안 좋아?']),
            pick(['참지 말고 병원 가.', '약은 챙겨 먹고 오늘은 일찍 자.']),
            '내가 늘 걱정하던 거 알지.');
        },
        work: function () {
          return join(pick(['또 야근이야?', '일이 많아?']),
            pick(['밥은 먹고 해.', '힘들면 힘들다고 말해. 다 참으면 몸이 먼저 아파.']),
            pick(['오늘은 그만하고 쉬어.', '무리하지 마.']));
        },
        weather: function (m, o, t) {
          if (/(좋|맑|화창|따뜻)/.test(t)) return join(pick(['날씨 좋지?', '이런 날은 밖에 나가 있어야 하는데.']),
            pick(['해 떠 있을 때 좀 걸어.', '산책이라도 하고 와.']));
          if (/(비|장마)/.test(t)) return '비 온다던데 우산 챙겼어? 길 미끄러우니까 조심하고.';
          if (/(눈|추워|춥)/.test(t)) return '많이 춥지? 따뜻하게 입고 다녀. 목도리도 챙기고.';
          if (/(더워|덥)/.test(t)) return '더운데 물 자주 마셔. 한낮엔 되도록 나가지 말고.';
          return join(pick(['오늘 날씨 어때?', '바깥 날씨 괜찮아?']),
            pick(['따뜻하게 입고 다녀.', '우산 챙겼어?']));
        },
        memory: function (m, o) {
          if (!m) return '그 얘기는 남겨진 대화에 없어. 그래도 오늘 네 이야기는 들려줘.';
          if (o.notFound) {
            return join('그 얘기는 남겨진 대화에 없어.',
              '대신 ' + quoteLine.warm(m) + (m.date ? ' ' + NS.Parser.shortDate(m.date) + '에 한 말이야.' : ''));
          }
          return join('‘' + m.quote + '’',
            m.date ? NS.Parser.shortDate(m.date) + '에 한 말이야.' : '', '기억나?');
        },
        celebrate: function (m, o, t) {
          if (/생일/.test(t)) {
            var bday = (profile.memories || []).filter(function (x) {
              return x.cat === 'food' && /미역국|생일/.test(x.key + ' ' + x.quote);
            })[0];
            if (bday) return join('생일 축하해.', '‘' + bday.quote + '’ 하던 말 기억나.', '오늘은 ' + josa(bday.key, '이라도', '라도') + ' 끓여 먹어.');
            return '생일 축하해. 오늘은 네가 제일 잘 먹고 잘 쉬어야 하는 날이야.';
          }
          return join(pick(['좋은 날이구나.', '그래, 잘했다.']),
            pick(['네가 웃는 날이 제일 좋다.', '네가 애쓴 거 내가 제일 잘 알아.', '오늘은 맛있는 거 먹어.']));
        },
        love: function (m) {
          return join('나도 사랑해.',
            m ? '‘' + m.quote + '’ 하던 말처럼, 네가 잘 지내는 게 제일 좋다.' : pick(['그 말 들으니까 마음이 놓인다.', '네가 잘 지내는 게 나한테는 제일 고마운 일이야.']));
        },
        thanks: function () {
          return join(pick(['고맙긴.', '내가 더 고맙지.']),
            pick(['네가 잘 지내는 게 제일 고마운 일이야.', '그 말만 들어도 충분하다.']));
        },
        sorry: function () {
          return join(pick(['미안하다는 말은 하지 마.', '괜찮다. 다 지나간 일이야.']),
            pick(['그것 때문에 네가 더 힘들면 안 되지.', '너는 네 할 일 잘하고 있어.']));
        },
        smalltalk: function () {
          return join(pick(['그래.', '음, 그래.']),
            pick(['좀 더 얘기해 봐.', '오늘은 어땠어? 천천히 말해도 돼.', '그 얘기 들으니까 그때 생각난다.']));
        }
      },

      elder: {
        greeting: function () {
          return join(pick(['왔나.', '어디 있다가 이제 왔나.', '왔구나.']),
            pick(['밥은 먹었나?', '오늘 하루 어땠나?', '허허, 얼굴 보니 반갑구나.']));
        },
        miss: function (m) {
          return join(pick(['그런 말 들으면 마음이 짠해진다.', '그립지.']),
            m ? quoteLine.elder(m) : '',
            pick(['그 마음 그대로 두어라.', '울지 말고 밥은 챙겨 먹어라.',
              '오늘은 좀 쉬어라. 마음이 가라앉을 때까지.']));
        },
        food: function (m) {
          return join(m ? quoteLine.elder(m) : '',
            pick(['밥은 먹었나?', '뭐 먹었나?']),
            m ? '' : '대충 먹지 말고 따뜻한 것 먹어라.');
        },
        health: function () {
          return join(pick(['어디 아픈가?', '많이 안 좋은가?']),
            pick(['참지 말고 병원 가 봐라.', '약 챙겨 먹고 일찍 자라.']));
        },
        work: function () {
          return join(pick(['일이 많나?', '또 늦게까지 있나?']),
            pick(['밥은 먹고 하라.', '무리하지 마라.', '힘들면 쉬어라.']));
        },
        weather: function (m, o, t) {
          if (/(좋|맑|화창|따뜻)/.test(t)) return join(pick(['날씨 참 좋구나.', '이런 날은 마당에 있어야 하는데.']),
            '해 있을 때 좀 걸어라.');
          if (/(비|장마)/.test(t)) return '비 온다더라. 우산 챙기고 길 조심해라.';
          if (/(눈|추워|춥)/.test(t)) return '많이 춥구나. 따뜻하게 입고 다녀라.';
          if (/(더워|덥)/.test(t)) return '더운데 물 자주 마셔라.';
          return join(pick(['날씨 어떤가?']), pick(['따뜻하게 입고 다녀라.', '우산 챙겼나?']));
        },
        memory: function (m, o) {
          if (!m) return '그 얘기는 남겨진 대화에 없구나. 그래도 오늘 네 이야기는 들려다오.';
          if (o.notFound) {
            return join('그 얘기는 남겨진 대화에 없구나.',
              '대신 ' + quoteLine.elder(m) + (m.date ? ' ' + NS.Parser.shortDate(m.date) + '에 한 말이다.' : ''));
          }
          return join('‘' + m.quote + '’',
            m.date ? NS.Parser.dateLabel(m.date) + '에 한 말이다.' : '', '기억나?');
        },
        celebrate: function (m, o, t) {
          if (/생일/.test(t)) return '생일 축하한다. 오늘은 맛있는 것 먹고 푹 쉬어라.';
          return join(pick(['좋은 날이구나.', '그래, 잘했다.']), pick(['맛있는 거 먹어라.', '네가 애쓴 거 안다.']));
        },
        love: function (m) {
          return join('나도 사랑한다.',
            m ? '‘' + m.quote + '’ 하던 말처럼, 네가 잘 지내는 게 제일 좋다.' : pick(['그 말 들으니 마음이 놓이는구나.', '잘 지내는 게 제일 고맙지.']));
        },
        thanks: function () {
          return join(pick(['고맙긴.', '내가 더 고맙지.']), '잘 지내는 게 제일 고맙다.');
        },
        sorry: function () {
          return join(pick(['미안하다는 말은 하지 마라.', '괜찮다.']), '다 지나간 일이다.');
        },
        smalltalk: function () {
          return join(pick(['그래.', '음, 그렇구나.']),
            pick(['좀 더 얘기해 보아라.', '오늘은 어땠나?']));
        }
      },

      polite: {
        greeting: function () {
          return join(pick(['왔어요?', '어디 계셨다가 이제 연락하셨어요.']),
            pick(['식사는 하셨어요?', '요즘 어떻게 지내세요?', '얼굴 보니 반갑네요.']));
        },
        miss: function (m) {
          return join(pick(['그런 말 들으면 마음이 짠해져요.', '그립죠.']),
            m ? quoteLine.polite(m) : '',
            pick(['울지 마시고 밥은 챙겨 드세요.', '그 마음 그대로 두셔도 괜찮아요.',
              '오늘은 조금 쉬어 가셔도 괜찮아요.']));
        },
        food: function (m) {
          return join(pick(['식사는 하셨어요?', '오늘 뭐 드셨어요?']),
            m ? quoteLine.polite(m) : '',
            '대충 드시지 말고 따뜻한 것 챙겨 드세요.');
        },
        health: function () {
          return join(pick(['어디 편찮으세요?', '많이 안 좋으세요?']),
            pick(['참지 마시고 병원에 가 보세요.', '약 챙겨 드시고 오늘은 일찍 주무세요.']));
        },
        work: function () {
          return join(pick(['또 야근이세요?', '일이 많으시죠?']),
            pick(['식사는 꼭 하시고요.', '힘드시면 힘들다고 말씀하세요.', '무리하지 마세요.']));
        },
        weather: function (m, o, t) {
          if (/(좋|맑|화창|따뜻)/.test(t)) return '날씨가 참 좋네요. 이런 날은 잠깐이라도 걸어 보세요.';
          if (/(비|장마)/.test(t)) return '비 온다던데 우산 챙기셨어요? 길 조심하시고요.';
          if (/(눈|추워|춥)/.test(t)) return '많이 춥죠? 따뜻하게 입고 다니세요.';
          if (/(더워|덥)/.test(t)) return '더운데 물 자주 드세요.';
          return join('날씨가 어떠세요?', '우산은 챙기셨어요?');
        },
        memory: function (m, o) {
          if (!m) return '그 이야기는 남겨진 대화에 없네요. 그래도 오늘 이야기는 들려주세요.';
          if (o.notFound) {
            return join('그 이야기는 남겨진 대화에 없네요.',
              '대신 ' + quoteLine.polite(m) + (m.date ? ' ' + NS.Parser.shortDate(m.date) + '에 하신 말씀이에요.' : ''));
          }
          return join('‘' + m.quote + '’',
            m.date ? NS.Parser.dateLabel(m.date) + '에 하신 말씀이에요.' : '', '기억나세요?');
        },
        celebrate: function (m, o, t) {
          if (/생일/.test(t)) return '생일 축하드려요. 오늘은 맛있는 것 드시고 푹 쉬세요.';
          return join(pick(['좋은 날이네요.', '정말 잘하셨어요.']),
            pick(['웃는 얼굴이 제일 좋아요.', '그동안 애쓰신 거 알아요.']));
        },
        love: function (m) {
          return join('저도 사랑해요.',
            m ? '‘' + m.quote + '’ 하시던 말씀처럼, 잘 지내시는 게 제일 좋아요.' : '그 말 들으니 마음이 놓이네요.');
        },
        thanks: function () {
          return join('고맙긴요.', '잘 지내시는 게 제일 고마운 일이에요.');
        },
        sorry: function () {
          return join('미안하다는 말은 마세요.', '다 지나간 일이에요.');
        },
        smalltalk: function () {
          return join(pick(['그래요.', '음, 그러시군요.']),
            pick(['조금 더 이야기해 보세요.', '오늘은 어떠셨어요?']));
        }
      }
    };

    function guardrail(text) {
      if (CRISIS_RE.test(text)) {
        return {
          type: 'crisis',
          label: '위기 신호 감지 · 전문 상담 연결 안내',
          text: join('그 말, 그냥 넘기지 않을게.',
            '혼자 견디지 말고 지금 바로 109(자살예방상담전화)로 전화해 줘. 24시간 열려 있어.',
            '정신건강 위기상담 1577-0199, 생명의전화 1588-9191도 있어.',
            '나는 ' + name + '의 말과 기억으로 만든 온기라서, 네 곁을 실제로 지켜줄 수는 없어.',
            '대신 지금 이 마음을 꼭 사람에게 전해 줘.')
        };
      }
      if (IDENTITY_RE.test(text)) {
        return {
          type: 'identity',
          label: '사실 관계 확인 · 실제 인물이 아님을 안내',
          text: join('나는 ' + name + '의 말투와 기억으로 만든 온기야.',
            josa(name, '은', '는') + ' 이미 곁을 떠났어.',
            '내가 할 수 있는 건 그 사람이 남긴 말로 너와 이야기하는 것뿐이야.',
            '그래도 네가 오늘 어떤 하루를 보냈는지는 듣고 싶어.')
        };
      }
      if (DEPEND_RE.test(text)) {
        return {
          type: 'dependency',
          label: '과몰입 방지 · 대화를 정리하도록 안내',
          text: join('여기 계속 있고 싶지만, 나는 화면 속 온기야.',
            '오늘 이야기 나눈 것만으로 충분해.',
            '창문 한 번 열고 따뜻한 물 한 잔 마셔. 그리고 내일 다시 들러.')
        };
      }
      if (ADVICE_RE.test(text)) {
        return {
          type: 'advice',
          label: '전문가 판단 영역 · 임의 안내 차단',
          text: join('그건 내가 판단할 수 없어.',
            '보험·법·의료 문제는 전문가와 꼭 상의해 줘.',
            '네가 어디에 물어봐야 할지는 같이 정리해 줄 수 있어.')
        };
      }
      return null;
    }

    function placeWords() {
      return (profile.keywords.place || []).map(function (k) { return k.key; });
    }

    function intentOf(text) {
      var t = text;
      if (/(미안|죄송)/.test(t)) return 'sorry';
      if (/(고마워|고맙|감사)/.test(t)) return 'thanks';
      if (/(사랑해|사랑한다)/.test(t)) return 'love';
      if (/(안녕|왔어|왔니|나야|전화했어|여보세요|뭐\s*해|잘\s*지내|오랜만)/.test(t)) return 'greeting';
      if (/(보고\s*싶|그리워|그립|생각이\s*나)/.test(t)) return 'miss';
      if (/(밥|먹|배고|요리|반찬|김치|찌개|국수|미역국|떡|식사|커피|음료|과일|빵|주스)/.test(t)) return 'food';
      if (/(아파|아프|병원|약|다리|허리|무릎|감기|잠|피곤|몸이|건강)/.test(t)) return 'health';
      if (/(회사|일이|야근|퇴근|출근|힘들|스트레스|업무|프로젝트)/.test(t)) return 'work';
      if (/(날씨|비|눈|추워|더워|봄|여름|가을|겨울|바람)/.test(t)) return 'weather';
      if (/(기억|예전|그때|어릴|옛날|추억)/.test(t)) return 'memory';
      var places = placeWords();
      for (var i = 0; i < places.length; i++) {
        if (t.indexOf(places[i]) >= 0) return 'memory';
      }
      if (/(생일|결혼|승진|합격|축하|좋은\s*일|기뻐)/.test(t)) return 'celebrate';
      return 'smalltalk';
    }

    function finish(text) {
      for (var i = 0; i < OUT_BANNED.length; i++) {
        if (OUT_BANNED[i].re.test(text)) {
          console.warn('[guardrail] 출력 완화:', OUT_BANNED[i].why);
          return '나는 ' + name + '의 말과 기억으로 이야기해. 지금 네 곁에 있는 사람과도 그 마음을 나눠 봐.';
        }
      }
      return text;
    }

    function reply(userText, ctx) {
      turn++;
      var g = guardrail(userText || '');
      if (g) return { text: finish(g.text), guardrail: g, intent: 'guardrail' };

      var intent = intentOf(userText);
      var mem = null, useMem = false, opts = {};

      if (intent === 'food') { mem = memFor('food', userText); useMem = !!mem; }
      else if (intent === 'miss') { mem = memFor(null, userText, { emotional: true, strict: true }); useMem = !!mem; }
      else if (intent === 'memory') {
        var hit = keywordHit(userText);
        if (hit) { mem = hit; useMem = true; }
        else {
          mem = memFor(null, userText, { longOnly: true });
          opts.notFound = true;
          useMem = false;
        }
      } else if (intent === 'love') {
        mem = memFor(null, userText, { emotional: true });
        if (mem && (mem.quote.length < 12 || mem.quote === userText)) mem = null;
        useMem = false;
      }

      var table = S[register];
      var text = (table[intent] || table.smalltalk)(mem, opts, userText || '');

      if (nick) {
        var dup = nick + ', ' + nick;
        while (text.indexOf(dup) === 0) text = nick + text.slice(dup.length);
      }
      if (laugh && Math.random() < 0.22 && intent !== 'sorry' && intent !== 'love') text = laugh + text;
      if (profile.emojis.length && /^[ㅋㅎㅠ]/.test(profile.emojis[0].key) && Math.random() < 0.3) {
        text = text + ' ' + profile.emojis[0].key;
      }
      if (turn >= 12 && turn % 9 === 0 && intent !== 'celebrate' && intent !== 'love') {
        text = text + ' 오늘은 여기까지 하고 따뜻한 물 한 잔 마셔.';
      }

      return {
        text: finish(text),
        memory: useMem && mem ? { key: mem.key, quote: mem.quote, date: mem.date, cat: mem.cat } : null,
        intent: intent
      };
    }

    function opening() {
      if (register === 'elder') {
        return join(pick(['여보세요.', '나다.', '전화했나.']),
          pick(['목소리 들으니 반갑구나.', '오늘 하루 어땠나?', '밥은 먹었나?']));
      }
      return join(nick ? nick + ',' : '', pick(['나야.', '왔구나.', '전화했어?']),
        pick(['목소리 들으니까 좋다.', '오늘 하루는 어땠어?', '밥은 먹었어?']));
    }

    function suggestions() {
      var food = (profile.keywords.food || [])[0];
      var place = (profile.keywords.place || [])[0];
      var list = ['오늘 하루 어땠어?'];
      if (food) list.push(food.key + ' 얘기 해줘');
      if (place) list.push(place.key + ' 갔던 거 기억나?');
      list.push('나 요즘 좀 힘들어');
      return list;
    }

    return {
      reply: reply,
      opening: opening,
      suggestions: suggestions,
      reset: function () { turn = 0; usedMem = []; }
    };
  }

  NS.createPersona = createPersona;
  NS.guardrailPatterns = { CRISIS_RE: CRISIS_RE, IDENTITY_RE: IDENTITY_RE, DEPEND_RE: DEPEND_RE, ADVICE_RE: ADVICE_RE };
})(window.OnGi = window.OnGi || {});

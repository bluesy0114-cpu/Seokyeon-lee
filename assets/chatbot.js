/* ============================================================
   Mini AI Seokyeon — 포트폴리오 내장 챗봇 (프론트엔드 전용)
   외부 API·키 없이 data/projects.json · data/films.json 과
   내장 커리어 지식을 브라우저에서 매칭해 답변합니다.
   ============================================================ */
(function () {
  'use strict';
  if (window.__slcChatbotLoaded) return;
  window.__slcChatbotLoaded = true;

  var EMAIL_WORK = 'seokyeon.lee@carelabs.co.kr';
  var EMAIL_PERSONAL = 'bluesy0114@gmail.com';
  var BLOG = 'https://blog.naver.com/bluesy0114';
  var GITHUB = 'https://github.com/bluesy0114-cpu';

  /* ---------------- helpers ---------------- */
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function norm(s) {
    return String(s == null ? '' : s).toLowerCase()
      .replace(/[\s\u00A0]+/g, '')
      .replace(/[.,·・:;'"“”‘’()\[\]{}<>!?~`^|\\\/+*&%$#@_=–—−]/g, '');
  }
  var PARTICLES = ['으로서', '에서는', '에게서', '이라고', '라고', '에서', '에게', '까지', '부터', '보다', '처럼', '마다', '조차', '이나', '라도', '으로', '이랑', '한테', '께서', '은', '는', '이', '가', '을', '를', '의', '에', '와', '과', '도', '만', '랑', '로'];
  function stems(t) {
    var out = [t], added = [];
    for (var p = 0; p < PARTICLES.length; p++) {
      var suf = PARTICLES[p];
      if (t.length > suf.length + 1 && t.slice(-suf.length) === suf) added.push(t.slice(0, -suf.length));
    }
    for (var k = 0; k < added.length; k++) {
      if (out.indexOf(added[k]) === -1) out.push(added[k]);
      for (var p2 = 0; p2 < PARTICLES.length; p2++) {
        var suf2 = PARTICLES[p2];
        if (added[k].length > suf2.length + 1 && added[k].slice(-suf2.length) === suf2) {
          var s2 = added[k].slice(0, -suf2.length);
          if (out.indexOf(s2) === -1) out.push(s2);
        }
      }
    }
    return out;
  }

  /* ---------------- knowledge: client families ---------------- */
  var FAMILIES = [
    { key: '넷마블', label: '넷마블', clients: ['넷마블'], words: ['넷마블', 'netmarble', '쿵야', 'koongya', '양파쿵야', '힐러비', 'kungya'] },
    { key: '삼성전자', label: '삼성전자', clients: ['삼성전자', 'Samsung'], words: ['삼성', '삼성전자', 'samsung', '엑시노스', 'exynos', '아이소셀', 'isocell', 'slsi', '반도체', '프로세서'] },
    { key: '나이키', label: '나이키', clients: ['NIKE KOREA', 'Nike KOREA'], words: ['나이키', 'nike', '에어포스', 'airforce', 'air force', 'snkrs', '프레스토', 'presto', '에어맥스', 'airmax', 'air max'] },
    { key: '아모레퍼시픽', label: '아모레퍼시픽', clients: ['아모레퍼시픽', 'Amorepacific'], words: ['아모레', '아모레퍼시픽', 'amore', 'amorepacific', '설화수', 'sulwhasoo', '헤라', 'hera', '이니스프리', 'innisfree', '필보이드', 'fillvoid', '오딧세이', 'odyssey'] },
    { key: '우리카드', label: '우리카드', clients: ['WOORI Card'], words: ['우리카드', 'wooricard', '카드의정석', 'd4'] },
    { key: '우리은행', label: '우리은행', clients: ['우리은행'], words: ['우리은행', 'wooribank', '웃튜브'] },
    { key: '맥도날드', label: '맥도날드', clients: ['맥도날드'], words: ['맥도날드', 'mcdonald', 'mcdonalds', '진도', '대파'] },
    { key: '이마트24', label: '이마트24', clients: ['이마트24'], words: ['이마트24', 'emart24', '별별김밥', '김밥'] },
    { key: '풀무원', label: '풀무원', clients: ['풀무원'], words: ['풀무원', 'pulmuone', '풀무원더랜드'] },
    { key: '포르쉐', label: '포르쉐', clients: ['포르쉐'], words: ['포르쉐', 'porsche'] },
    { key: '코웨이', label: '코웨이', clients: ['코웨이'], words: ['코웨이', 'coway'] },
    { key: 'SK', label: 'SK E&S·SK텔레콤', clients: ['SK E&S', 'SK Telecom'], words: ['ske&s', 'sk e&s', 'ske&s', 'sk이앤에스', 'skens', 'sk텔레콤', 'skt', '픽캠', 'pixcam'] },
    { key: '동아제약', label: '동아제약', clients: ['동아제약'], words: ['동아제약', '박카스', 'baccus', '제리', '뚜껑이'] },
    { key: '종근당건강', label: '종근당건강', clients: ['종근당건강'], words: ['종근당', '아임비타', 'imvita'] },
    { key: '기아', label: '기아', clients: ['기아'], words: ['기아', 'kia', '기아사람들'] },
    { key: '애경', label: '애경', clients: ['애경'], words: ['애경', '루나', 'luna', '컴피라이트'] },
    { key: '도루코', label: '도루코', clients: ['도루코'], words: ['도루코', 'dorco', '바버샵', 'barbershop'] },
    { key: '마켓컬리', label: '마켓컬리', clients: ['마켓 컬리'], words: ['마켓컬리', '컬리', 'kurly', 'marketkurly'] },
    { key: 'EBS', label: 'EBS', clients: ['EBS'], words: ['ebs', '초목달', '토목달'] },
    { key: '마카오', label: '마카오정부관광청', clients: ['마카오정부관광청'], words: ['마카오', 'macao'] },
    { key: '인스파이어', label: '인스파이어 리조트', clients: ['인스파이어 리조트'], words: ['인스파이어', 'inspire'] },
    { key: '현대리바트', label: '현대리바트', clients: ['현대리바트'], words: ['리바트', 'livart', '현대리바트'] },
    { key: '도이치모터스', label: '도이치모터스', clients: ['Deutsch Motors'], words: ['도이치', 'deutsch', '비밀딜러'] },
    { key: 'MBC', label: 'MBC', clients: ['MBC'], words: ['mbc', '목포', '미디어월', '아나모픽'] },
    { key: 'GOAL STUDIO', label: 'GOAL STUDIO', clients: ['GOAL STUDIO'], words: ['골스튜디오', 'goalstudio', 'goal studio', '에이코닉', 'aconic'] },
    { key: 'LG U+', label: 'LG U+', clients: ['LG U+'], words: ['lg유플러스', '유플러스', 'lgu', 'lg u+', '김필', '곽진언'] }
  ];

  var CATEGORIES = [
    { key: 'character-ip', label: '캐릭터 IP', words: ['캐릭터', 'character', 'ip', '이모티콘', '세계관'] },
    { key: 'social-media', label: '소셜 미디어', words: ['sns', '소셜', '소셜미디어', '인스타', '인스타그램', 'instagram', '페이스북', 'facebook', '채널운영', '커뮤니티'] },
    { key: 'imc-campaign', label: 'IMC 캠페인', words: ['imc', '통합캠페인', '온오프라인', '통합'] },
    { key: 'youtube', label: '유튜브', words: ['유튜브', 'youtube', '웹예능'] },
    { key: 'influencer', label: '인플루언서', words: ['인플루언서', 'influencer', '체험단', '크리에이터', '파워컨텐츠'] },
    { key: 'btl-campaign', label: 'BTL 캠페인', words: ['btl', '팝업', '팝업스토어', '오프라인', '부스', '체험형'] },
    { key: 'visual-project', label: '비주얼 프로젝트', words: ['비주얼', '룩북', '화보', '이미지소스', '스틸'] },
    { key: 'brand-viral', label: '브랜드 바이럴', words: ['바이럴', 'viral', '브랜디드'] },
    { key: 'live-commerce', label: '라이브 커머스', words: ['라이브커머스', '라이브', '홈쇼핑', '커머스'] }
  ];

  var FILM_CATS = [
    { key: 'TECH', label: '테크·반도체', words: ['테크', 'tech', '기술', '칩'] },
    { key: 'BEAUTY', label: '뷰티', words: ['뷰티', 'beauty', '화장품', '코스메틱'] },
    { key: 'FASHION', label: '패션', words: ['패션', 'fashion', '스니커'] },
    { key: 'BRAND', label: '브랜드 필름', words: ['브랜드필름', '브랜드영상', '브랜디드필름'] },
    { key: 'CULTURE', label: '컬처', words: ['문화', 'culture', '전시'] },
    { key: 'FILM', label: '필름', words: ['시네마', '광고필름'] }
  ];

  var STOP = {};
  ('알려줘 알려주세요 알려 뭐야 뭐지 뭔가요 무엇 어떤 어떻게 있나요 있어 있어요 있나 있습니까 보여줘 보여주세요 보여 프로젝트 캠페인 영상 필름 사례 작업 관련 대해 대한 좀 더 그 이 저 및 정도 리스트 목록 전체 건 편 개 하는 했어 했나요 한번 궁금 궁금해 궁금합니다 소개 해주세요 주세요 그리고 또 혹시 대표 성과 경력 연락 협업 마케팅 방식 방법 어디 누구 무슨 몇 왜 같은 쪽 관심 가능 되나요 됩니다 인가요 입니다 이에요 예요 습니까 까요 나요 좀더 알려줄 알려줄래 정보 자세 자세히'
    .split(/\s+/)).forEach(function (w) { STOP[w] = 1; });

  /* ---------------- data ---------------- */
  var DATA = { projects: [], films: [], loaded: false, fromFile: false, error: false };
  var loadPromise = null;

  function prepare(item, kind) {
    var hay = norm([
      item.title, item.shortTitle, item.client, item.clientEn,
      item.categoryLabel || item.category, item.period,
      item.description, (item.role || []).join(' '), (item.result || []).join(' '),
      item.tone
    ].filter(Boolean).join(' '));
    item.__hay = hay;
    item.__kind = kind;
    return item;
  }

  function inlineData() {
    var el = document.getElementById('archive-data');
    if (!el) return null;
    try {
      var parsed = JSON.parse(el.textContent);
      if (parsed.projects) return { projects: parsed.projects };
      if (parsed.films) return { films: parsed.films };
    } catch (e) { /* ignore */ }
    return null;
  }

  function loadData() {
    if (loadPromise) return loadPromise;
    function fetchJson(name) {
      return fetch(new URL('data/' + name, document.baseURI), { cache: 'force-cache' })
        .then(function (r) { if (!r.ok) throw new Error('http'); return r.json(); })
        .catch(function () { return null; });
    }
    loadPromise = Promise.all([fetchJson('projects.json'), fetchJson('films.json')])
      .then(function (res) {
        var inline = inlineData();
        var projects = (res[0] && res[0].projects) || (inline && inline.projects) || [];
        var films = (res[1] && res[1].films) || (inline && inline.films) || [];
        DATA.projects = projects.map(function (p) { return prepare(p, 'project'); });
        DATA.films = films.map(function (f) { return prepare(f, 'film'); });
        DATA.loaded = true;
        DATA.error = !DATA.projects.length && !DATA.films.length;
        return DATA;
      })
      .catch(function () {
        DATA.loaded = true; DATA.error = true; return DATA;
      });
    return loadPromise;
  }

  function proj(id) {
    for (var i = 0; i < DATA.projects.length; i++) if (DATA.projects[i].id === id) return DATA.projects[i];
    return null;
  }

  /* ---------------- query analysis ---------------- */
  function detectFamilies(nq) {
    var out = [];
    for (var i = 0; i < FAMILIES.length; i++) {
      var f = FAMILIES[i];
      for (var w = 0; w < f.words.length; w++) {
        var word = norm(f.words[w]);
        if (word.length >= 2 && nq.indexOf(word) !== -1) { out.push(f); break; }
      }
    }
    return out;
  }
  function detectCats(nq, list) {
    var out = [];
    for (var i = 0; i < list.length; i++) {
      for (var w = 0; w < list[i].words.length; w++) {
        var word = norm(list[i].words[w]);
        if (word.length >= 2 && nq.indexOf(word) !== -1) { out.push(list[i].key); break; }
      }
    }
    return out;
  }
  function keywords(q) {
    var raw = String(q).toLowerCase().split(/[^0-9a-z가-힣]+/);
    var out = [];
    raw.forEach(function (t) {
      if (!t || STOP[t]) return;
      stems(t).forEach(function (s) {
        if (s.length >= 2 && !STOP[s] && out.indexOf(s) === -1) out.push(s);
      });
    });
    return out;
  }

  function analyze(q) {
    var nq = norm(q);
    var ctx = {
      q: q, nq: nq,
      families: detectFamilies(nq),
      cats: detectCats(nq, CATEGORIES),
      filmCats: detectCats(nq, FILM_CATS),
      kws: keywords(q),
      projects: [], films: []
    };
    var i, s, item, hit;

    for (i = 0; i < DATA.projects.length; i++) {
      item = DATA.projects[i]; s = 0;
      if (ctx.families.length) {
        hit = ctx.families.some(function (f) { return f.clients.indexOf(item.client) !== -1; });
        if (hit) s += 16;
      }
      if (ctx.cats.length && ctx.cats.indexOf(item.category) !== -1) s += 8;
      for (var k = 0; k < ctx.kws.length; k++) {
        if (item.__hay.indexOf(ctx.kws[k]) !== -1) s += 3;
      }
      if (s > 0) { item.__score = s; ctx.projects.push(item); }
    }
    for (i = 0; i < DATA.films.length; i++) {
      item = DATA.films[i]; s = 0;
      if (ctx.families.length) {
        hit = ctx.families.some(function (f) { return f.clients.indexOf(item.client) !== -1; });
        if (hit) s += 16;
      }
      if (ctx.filmCats.length && ctx.filmCats.indexOf(item.category) !== -1) s += 8;
      for (var k2 = 0; k2 < ctx.kws.length; k2++) {
        if (item.__hay.indexOf(ctx.kws[k2]) !== -1) s += 3;
      }
      if (s > 0) { item.__score = s; ctx.films.push(item); }
    }
    var min = (ctx.families.length || ctx.cats.length || ctx.filmCats.length) ? 6 : 4;
    ctx.projects = ctx.projects.filter(function (p) { return p.__score >= min; })
      .sort(function (a, b) { return b.__score - a.__score || (a.no || 0) - (b.no || 0); });
    ctx.films = ctx.films.filter(function (f) { return f.__score >= min; })
      .sort(function (a, b) { return b.__score - a.__score || a.id - b.id; });
    return ctx;
  }

  /* ---------------- card markup ---------------- */
  function projectCard(p) {
    var img = p.image ? '<img src="' + esc(p.image) + '" alt="" loading="lazy" decoding="async">' : '';
    var meta = [p.client, p.categoryLabel || p.category, p.period].filter(Boolean).join(' · ');
    return '<a class="slc-card" href="./projects.html#' + esc(p.id) + '">' + img +
      '<span class="slc-card-txt"><b>' + esc(p.title) + '</b><span>' + esc(meta) + '</span></span>' +
      '<span class="slc-card-go" aria-hidden="true">↗</span></a>';
  }
  function filmCard(f) {
    var img = f.thumbnail ? '<img src="' + esc(f.thumbnail) + '" alt="" loading="lazy" decoding="async">' : '';
    var meta = [f.client, f.category, '영상'].filter(Boolean).join(' · ');
    return '<a class="slc-card" href="./films.html#' + esc(f.slug) + '">' + img +
      '<span class="slc-card-txt"><b>' + esc(f.shortTitle || f.title) + '</b><span>' + esc(meta) + '</span></span>' +
      '<span class="slc-card-go" aria-hidden="true">↗</span></a>';
  }
  function cardsHtml(list) {
    if (!list.length) return '';
    return '<div class="slc-cards">' + list.map(function (it) {
      return it.__kind === 'film' ? filmCard(it) : projectCard(it);
    }).join('') + '</div>';
  }

  var SUGGEST_DEFAULT = ['대표 성과가 뭔가요?', 'AI 마케팅은 어떻게 하나요?', '넷마블·나이키 프로젝트 알려줘', '협업·연락은 어떻게 하나요?'];
  var FOLLOW_PERF = ['AI 마케팅 방식이 궁금해요', '넷마블 프로젝트 보기', '영상 필름 18편 보기'];
  var FOLLOW_AI = ['캐릭터 IP 사례 보여줘', '무료 툴도 있나요?', '연락처 알려주세요'];
  var FOLLOW_CONTACT = ['경력이 궁금해요', '캠페인 43건 보기', '네이버 블로그 보기'];

  /* ---------------- answers ---------------- */
  function answerIntro() {
    return {
      html:
        '<p>이석연 팀장의 디지털 명함입니다. 주식회사 <strong>케어랩스 DM사업부 기획팀 팀장</strong>으로, ' +
        '월 <strong>600건이 넘는</strong> 마케팅 기획·제작을 표준화하고 요청부터 납품까지의 흐름을 데이터로 설계하는 ' +
        '<strong>AI 마케팅 워크플로우 아키텍트</strong>입니다.</p>' +
        '<ul>' +
        '<li>전 <strong>넷마블MNB 사업1실장</strong> — 21명 리드, 193억 매출, 26건 프로젝트, 퇴사자 0명</li>' +
        '<li>전 <strong>엠포스 영상기획팀 과장·팀장</strong> — 삼성전자 Exynos·ISOCELL 등 브랜드 필름</li>' +
        '<li>캠페인 <strong>43건</strong> · 영상 필름 <strong>18편</strong> 공개</li>' +
        '</ul>' +
        '<p>브랜드명이나 분야를 말씀해 주시면 해당 작업을 바로 찾아 드립니다.</p>',
      follow: ['대표 성과가 뭔가요?', 'AI 마케팅은 어떻게 하나요?', '협업·연락은 어떻게 하나요?']
    };
  }

  function answerPerformance() {
    var ids = ['kungya-restaurants', 'nike-snkrs', 'mcdonalds-jindo', 'innisfree-sns'];
    var picks = [], lis = '';
    ids.forEach(function (id) {
      var p = proj(id);
      if (!p) return;
      picks.push(p);
      var r = (p.result || [])[0] || '';
      lis += '<li><strong>' + esc(p.title) + '</strong> — ' + esc(p.client) + (r ? ' · ' + esc(r) : '') + '</li>';
    });
    if (!lis) {
      lis = '<li><strong>쿵야 레스토랑즈</strong> — 넷마블 · 인스타그램 0 → 16.9만 팔로워, 팝업 10일 연속 오픈런</li>' +
        '<li><strong>NIKE SNKRS 캠페인</strong> — 나이키 · KPI 400% 초과, 앱스토어 무료 1위</li>' +
        '<li><strong>맥도날드 진도 대파</strong> — 참여 44만 · 플레이 140만 회</li>' +
        '<li><strong>이니스프리 페이스북</strong> — 9개월 16.8만 팬 · 웹어워드 대상</li>';
    }
    return {
      html:
        '<p>숫자로 남은 대표 성과입니다.</p><ul>' +
        '<li><strong>넷마블MNB 사업1실</strong> — 21명 조직 리드 · 193억 매출 · 26건 프로젝트 완료 · <strong>퇴사자 0명</strong></li>' +
        lis +
        '</ul><p>기획의 결과를 수치로 남기고, 그 수치를 다음 캠페인의 기준으로 다시 쓰는 방식으로 일해 왔습니다.</p>',
      cards: picks.length ? cardsHtml(picks.slice(0, 3)) +
        '<a class="slc-more" href="./projects.html">캠페인 아카이브 43건 전체 보기 ↗</a>' : '',
      follow: FOLLOW_PERF
    };
  }

  function answerAI() {
    return {
      html:
        '<p>이석연 팀장이 말하는 AI 마케팅은 “AI로 광고를 만드는 일”이 아니라, ' +
        '<strong>사람이 바뀌어도 같은 품질이 나오는 운영 체계</strong>를 만드는 일입니다.</p>' +
        '<ul>' +
        '<li><strong>요청을 표준화</strong> — 월 600건이 넘는 기획·제작 요청을 유형과 난이도로 분류하고, 단계별 표준 시간·담당 역할·산출물을 정의합니다.</li>' +
        '<li><strong>흐름을 데이터로</strong> — 요청부터 납품까지 구간별 소요를 기록해 SLA를 세우고, 지연이 반복되는 병목을 화면 위에 드러냅니다.</li>' +
        '<li><strong>반려를 학습</strong> — 심의에서 걸린 사유를 코드로 구조화해 지식베이스로 만들고, 기획 초안 단계에서 같은 실수를 먼저 걸러냅니다.</li>' +
        '<li><strong>도구로 고정</strong> — 이 흐름을 기획팀 업무 포털<em>(NEXUS OS)</em>과 SLA 트래킹, 리젝트 학습형 AI 기획 어시스턴트, 의사결정 시뮬레이터로 직접 만들어 운영합니다.</li>' +
        '</ul>' +
        '<p>핵심은 개인의 감이 아니라 <strong>기준과 데이터가 남는 구조</strong>입니다. 같은 이유로 누구나 쓸 수 있는 ' +
        '<a href="./index.html#tool" style="color:#9FC3FF;text-decoration:underline;text-underline-offset:3px">광고 카피·심의 주의어 체크기</a>도 무료로 공개했습니다.</p>',
      follow: FOLLOW_AI
    };
  }

  function answerCareer() {
    return {
      html:
        '<p>경력은 마케팅 실행에서 출발해 운영 구조 설계로 확장되어 왔습니다.</p><ul>' +
        '<li><strong>현직 · 주식회사 케어랩스</strong> — DM사업부 기획팀 팀장. 다수 광고주의 캠페인 기획을 운영하며 기획·제작 프로세스 표준화, SLA 설계, 심의 데이터 기반 AI 마케팅 워크플로우를 맡고 있습니다. 2026년 12월 원익 H&amp;X 통합·확장을 앞두고 있습니다.</li>' +
        '<li><strong>넷마블MNB</strong> — 사업1실 실장. 21명 규모 조직을 리드하며 193억 매출과 26건 프로젝트를 완료했고, 퇴사자 0명의 조직을 운영했습니다.</li>' +
        '<li><strong>엠포스</strong> — 영상기획팀 과장·팀장. 삼성전자 Exynos·ISOCELL 글로벌 캠페인, 우리카드, EBS 등 브랜드 영상과 디지털 캠페인 영상을 기획했습니다.</li>' +
        '<li><strong>CJ 올리브네트웍스</strong> — 마케터. 디지털 캠페인 실행을 담당했습니다.</li>' +
        '</ul>' +
        '<p>근무 기간과 상세 이력은 <a href="mailto:' + EMAIL_WORK + '" style="color:#9FC3FF;text-decoration:underline;text-underline-offset:3px">이메일</a>로 요청해 주시면 이력서로 안내드립니다.</p>',
      follow: ['대표 성과가 뭔가요?', '캠페인 43건 보기', '협업·연락은 어떻게 하나요?']
    };
  }

  function answerContact() {
    return {
      html:
        '<p>기고·강연·협업 제안은 이메일로 받고 있습니다.</p><ul>' +
        '<li><strong>회사 메일</strong> — ' + esc(EMAIL_WORK) + '</li>' +
        '<li><strong>개인 메일</strong> — ' + esc(EMAIL_PERSONAL) + '</li>' +
        '<li><strong>블로그</strong> — AI 마케팅 실전 제작기 연재</li>' +
        '</ul>' +
        '<p>프로젝트 성격과 일정, 필요한 범위를 함께 적어 주시면 더 정확하게 답변드릴 수 있습니다.</p>' +
        '<div class="slc-cards">' +
        '<a class="slc-card" href="mailto:' + EMAIL_WORK + '"><span class="slc-card-txt"><b>회사 메일로 보내기</b><span>' + esc(EMAIL_WORK) + '</span></span><span class="slc-card-go" aria-hidden="true">↗</span></a>' +
        '<a class="slc-card" href="mailto:' + EMAIL_PERSONAL + '"><span class="slc-card-txt"><b>개인 메일로 보내기</b><span>' + esc(EMAIL_PERSONAL) + '</span></span><span class="slc-card-go" aria-hidden="true">↗</span></a>' +
        '<a class="slc-card" href="' + BLOG + '" target="_blank" rel="noopener noreferrer"><span class="slc-card-txt"><b>네이버 블로그</b><span>AI 마케팅 실전 제작기 ↗</span></span><span class="slc-card-go" aria-hidden="true">↗</span></a>' +
        '</div>',
      follow: FOLLOW_CONTACT
    };
  }

  function answerFilm() {
    var picks = DATA.films.filter(function (f) { return f.featured; }).slice(0, 4);
    if (!picks.length) picks = DATA.films.slice(0, 4);
    var counts = {};
    DATA.films.forEach(function (f) { counts[f.category] = (counts[f.category] || 0) + 1; });
    var catLine = Object.keys(counts).map(function (k) { return k + ' ' + counts[k] + '편'; }).join(' · ');
    var lis = picks.map(function (f) {
      return '<li><strong>' + esc(f.shortTitle || f.title) + '</strong> — ' + esc(f.client) + ' · ' + esc(f.category) + '</li>';
    }).join('');
    return {
      html:
        '<p>영상 필름 <strong>' + (DATA.films.length || 18) + '편</strong>이 아카이브에 정리되어 있습니다.' +
        (catLine ? ' <em>(' + esc(catLine) + ')</em>' : '') + '</p>' +
        '<p>삼성전자 S.LSI 글로벌 브랜드 필름에서 나이키 스트리트 캠페인, 우리카드·EBS 캠페인 영상, 아모레퍼시픽 뷰티 필름까지 ' +
        '기획과 제작 과정에 참여한 필름을 원본 링크와 함께 공개하고 있습니다.</p>' +
        (lis ? '<ul>' + lis + '</ul>' : '') +
        '<p>브랜드명을 말씀하시면 해당 영상만 골라 드립니다.</p>',
      cards: picks.length ? cardsHtml(picks) + '<a class="slc-more" href="./films.html">영상 필름 18편 전체 보기 ↗</a>' : '',
      follow: ['삼성 영상 보여줘', '나이키 영상 보여줘', '대표 성과가 뭔가요?']
    };
  }

  function answerProject() {
    var counts = {};
    DATA.projects.forEach(function (p) {
      var k = p.categoryLabel || p.category;
      counts[k] = (counts[k] || 0) + 1;
    });
    var catLis = '';
    if (DATA.projects.length) {
      catLis = Object.keys(counts).map(function (k) {
        return '<li>' + esc(k) + ' — <span class="slc-num">' + counts[k] + '건</span></li>';
      }).join('');
    }
    var picks = ['kungya-restaurants', 'nike-snkrs', 'mcdonalds-jindo', 'emart24-youtube']
      .map(proj).filter(Boolean);
    if (!picks.length) picks = DATA.projects.slice(0, 4);
    return {
      html:
        '<p>캠페인 아카이브 <strong>' + (DATA.projects.length || 43) + '건</strong>입니다. ' +
        '캐릭터 IP·소셜 미디어부터 IMC·유튜브·인플루언서·BTL·라이브 커머스까지 분야별로 정리해 두었습니다.</p>' +
        (catLis ? '<ul>' + catLis + '</ul>' : '') +
        '<p>카드를 누르면 해당 캠페인의 역할과 성과 수치가 아카이브에서 바로 열립니다.</p>',
      cards: picks.length ? cardsHtml(picks) + '<a class="slc-more" href="./projects.html">캠페인 43건 전체 보기 ↗</a>' : '',
      follow: ['캐릭터 IP 작업 보여줘', '라이브 커머스 사례 있어요?', '영상 필름 18편 보기']
    };
  }

  function answerTool() {
    return {
      html:
        '<p>기획 현장에서 매일 쓰는 1차 점검 도구를 무료로 공개하고 있습니다. ' +
        '<strong>광고 카피 · 심의 주의어 체크기</strong>입니다.</p><ul>' +
        '<li>공백 포함·제외 글자 수와 UTF-8 바이트를 실시간 계산</li>' +
        '<li>파워링크 제목 15자, 설명 45자, 메타 설명 125자 기준 초과 여부 표시</li>' +
        '<li>과장·비교·의료 표현 등 심의에서 자주 걸리는 표현 자동 감지</li>' +
        '<li>회원가입 없이, 입력한 문장은 서버로 전송되지 않고 브라우저에서만 계산</li>' +
        '</ul>' +
        '<p>법적 판단이나 매체 심의를 대체하는 도구는 아니고, 기획 단계의 1차 점검용입니다.</p>' +
        '<div class="slc-cards"><a class="slc-card" href="./index.html#tool"><span class="slc-card-txt"><b>무료 툴 열기</b><span>광고 카피 · 심의 주의어 체크기 ↗</span></span><span class="slc-card-go" aria-hidden="true">↗</span></a></div>',
      follow: ['AI 마케팅은 어떻게 하나요?', '대표 성과가 뭔가요?', '연락처 알려주세요']
    };
  }

  function answerBlog() {
    return {
      html:
        '<p>네이버 블로그에 <strong>AI 마케팅 실전 제작기</strong>를 연재하고 있습니다. ' +
        '기획서보다 실제로 돌아가는 흐름을 먼저 만드는 과정 — 엑셀과 메신저로 흩어져 있던 요청을 표준화하고, ' +
        '반려 이력을 데이터로 바꾸고, 그 위에 AI 보조를 얹는 이야기를 씁니다.</p>' +
        '<div class="slc-cards"><a class="slc-card" href="' + BLOG + '" target="_blank" rel="noopener noreferrer"><span class="slc-card-txt"><b>블로그에서 이어 읽기</b><span>blog.naver.com/bluesy0114 ↗</span></span><span class="slc-card-go" aria-hidden="true">↗</span></a></div>',
      follow: ['무료 툴도 있나요?', 'AI 마케팅은 어떻게 하나요?', '연락처 알려주세요']
    };
  }

  function answerBrands() {
    var counts = {};
    DATA.projects.concat(DATA.films).forEach(function (it) {
      counts[it.client] = (counts[it.client] || 0) + 1;
    });
    var keys = Object.keys(counts).sort(function (a, b) { return counts[b] - counts[a]; });
    var lis = keys.slice(0, 14).map(function (k) {
      return '<li>' + esc(k) + ' — <span class="slc-num">' + counts[k] + '건</span></li>';
    }).join('');
    return {
      html:
        '<p>아카이브에 정리된 광고주는 <strong>' + keys.length + '곳</strong>입니다. 브랜드별로 캠페인과 영상이 함께 묶여 있습니다.</p>' +
        (lis ? '<ul>' + lis + '</ul>' : '') +
        '<p>궁금한 브랜드명을 말씀하시면 해당 작업만 골라 보여드립니다.</p>',
      follow: ['삼성 작업 보여줘', '아모레퍼시픽 작업 보여줘', '캠페인 43건 보기']
    };
  }

  function answerThanks() {
    return {
      html: '<p>감사합니다. 더 궁금한 브랜드나 캠페인이 있으면 언제든 물어봐 주세요. ' +
        '협업 제안은 <a href="mailto:' + EMAIL_WORK + '" style="color:#9FC3FF;text-decoration:underline;text-underline-offset:3px">' + esc(EMAIL_WORK) + '</a>로 보내주시면 됩니다.</p>',
      follow: ['캠페인 43건 보기', '영상 필름 18편 보기', '연락처 알려주세요']
    };
  }

  function answerData(ctx) {
    var projects = ctx.projects, films = ctx.films;
    if (!projects.length && !films.length) {
      var label = ctx.families.map(function (f) { return f.label; }).join(', ');
      return {
        html: '<p>' + (label ? '‘' + esc(label) + '’ 관련 작업을 ' : '말씀하신 키워드의 작업을 ') +
          '아카이브에서 찾지 못했습니다. 지금 공개된 범위는 캠페인 43건과 영상 18편입니다.</p>' +
          '<p>브랜드명(삼성·나이키·쿵야·아모레·맥도날드·우리카드 등)이나 분야(캐릭터 IP·유튜브·라이브 커머스·BTL)로 다시 물어봐 주세요.</p>',
        follow: SUGGEST_DEFAULT.slice(0, 3)
      };
    }

    var lead;
    if (ctx.families.length) {
      lead = ctx.families.slice(0, 3).map(function (f) {
        var pc = projects.filter(function (p) { return f.clients.indexOf(p.client) !== -1; }).length;
        var fc = films.filter(function (x) { return f.clients.indexOf(x.client) !== -1; }).length;
        var inner = [];
        if (pc) inner.push('캠페인 ' + pc + '건');
        if (fc) inner.push('영상 ' + fc + '편');
        return '<strong>' + esc(f.label) + '</strong>(' + (inner.join(', ') || '공개된 작업 없음') + ')';
      }).join(' · ');
      lead = lead + '이 아카이브에 정리되어 있습니다.';
    } else {
      var catLabel = ctx.cats.concat(ctx.filmCats).map(function (k) {
        var found = CATEGORIES.concat(FILM_CATS).filter(function (c) { return c.key === k; })[0];
        return found ? found.label : k;
      }).join(' · ');
      lead = '<strong>' + esc(catLabel || '관련') + '</strong> 작업으로 캠페인 ' + projects.length + '건' +
        (films.length ? ', 영상 ' + films.length + '편' : '') + '을 찾았습니다.';
    }

    /* 카드: 캠페인 3건 + 영상 2편(최대 4장) */
    var cardP = projects.slice(0, 3);
    var cardF = films.slice(0, Math.max(0, 4 - cardP.length));
    var pickCards = cardP.concat(cardF);

    /* 본문 목록: 카드와 겹치지 않게 성과 수치만 짧게 */
    var lis = projects.filter(function (p) { return (p.result || []).length; })
      .slice(0, 3)
      .map(function (p) { return '<li><strong>' + esc(p.title) + '</strong> — ' + esc(p.result[0]) + '</li>'; })
      .join('');
    if (!lis) {
      lis = pickCards.slice(0, 2).map(function (it) {
        return '<li><strong>' + esc(it.title || it.shortTitle) + '</strong> — ' +
          esc([it.client, it.categoryLabel || it.category].filter(Boolean).join(' · ')) + '</li>';
      }).join('');
    }

    var restP = Math.max(0, projects.length - cardP.length);
    var restF = Math.max(0, films.length - cardF.length);
    var more = '';
    if (restP > 0) more += '<a class="slc-more" href="./projects.html">캠페인 ' + restP + '건 더 보기 ↗</a> ';
    if (restF > 0) more += '<a class="slc-more" href="./films.html">영상 ' + restF + '편 더 보기 ↗</a> ';

    return {
      html: '<p>' + lead + '</p>' + (lis ? '<ul>' + lis + '</ul>' : '') +
        (pickCards.length ? '<p>카드를 누르면 해당 작업의 상세 페이지가 열립니다.</p>' : ''),
      cards: cardsHtml(pickCards) + more,
      follow: ['캐릭터 IP 사례 보여줘', '대표 성과가 뭔가요?', '연락처 알려주세요']
    };
  }

  function answerFallback() {
    return {
      html:
        '<p>질문을 조금 더 구체적으로 주시면 바로 찾아드릴게요. 이렇게 물어보실 수 있습니다.</p><ul>' +
        '<li>브랜드 — “삼성 작업 보여줘”, “쿵야 프로젝트 알려줘”</li>' +
        '<li>분야 — “캐릭터 IP 사례”, “라이브 커머스 경험 있어?”</li>' +
        '<li>사람 — “대표 성과”, “경력 알려줘”, “협업 연락처”</li>' +
        '</ul>',
      follow: SUGGEST_DEFAULT.slice(0, 3)
    };
  }

  function respond(q) {
    var nq = norm(q);
    var ql = String(q).toLowerCase();

    /* 인사·소개 */
    if (/안녕|반가|하이|hello|^hi[!.\s]*$|누구세요|누구신가요|누구야|어떤분|뭐하는분|자기소개|^소개/.test(nq)) {
      return answerIntro();
    }
    /* 감사·마무리 */
    if (/고마|감사|thank|수고|잘있|바이/.test(nq)) return answerThanks();

    /* 연락·협업 — 작업 키워드가 함께 있으면 데이터 답변 우선 */
    var contactHit = /연락|이메일|메일주소|컨택|협업|미팅|면담|커피챗|문의|제안|채용|인터뷰|강연|기고|오퍼|포지션|이직|jd/.test(nq);
    var dataCue = /프로젝트|캠페인|영상|필름|사례|작업|포트폴리오|아카이브|성과|만든|일한/.test(nq);
    if (contactHit && !dataCue) return answerContact();

    var ctx = analyze(q);
    if ((ctx.families.length || ctx.cats.length || ctx.filmCats.length) && (ctx.projects.length || ctx.films.length)) {
      return answerData(ctx);
    }
    if ((ctx.families.length || ctx.cats.length || ctx.filmCats.length) && !ctx.projects.length && !ctx.films.length && dataCue) {
      return answerData(ctx);
    }

    /* 의도별 */
    if (/성과|실적|매출|숫자|잘한|강점|자랑|kpi|퇴사자|업적|이력서에/.test(nq)) return answerPerformance();
    if (/(^|[^a-z])ai([^a-z]|$)/.test(ql) || /인공지능|자동화|워크플로우|sla|600|넥서스|nexus|프롬프트|표준화|시스템|업무개선|리젝트|효율/.test(nq)) return answerAI();
    if (/무료|툴|체크기|주의어|글자수|도구/.test(nq)) return answerTool();
    if (/블로그|연재|포스팅|제작기/.test(nq)) return answerBlog();
    if (/브랜드|광고주|고객사|클라이언트|거래처|어느회사|어떤회사|함께한/.test(nq)) return answerBrands();
    if (/경력|커리어|이력|재직|회사|퇴사|팀장|실장|과장|넷마블|엠포스|cj|올리브|케어랩스|몇년|연차|전직|약력/.test(nq)) return answerCareer();
    if (/영상|필름|촬영|제작|vimeo|비메오|광고영상/.test(nq)) return answerFilm();
    if (/프로젝트|캠페인|사례|포트폴리오|아카이브|작업물|43|18편/.test(nq)) return answerProject();

    if (ctx.projects.length || ctx.films.length) return answerData(ctx);
    return answerFallback();
  }

  /* ---------------- UI ---------------- */
  var root, launcher, panel, body, form, input, sendBtn, log, suggestBlock;
  var opened = false, greeted = false;

  var ICON_CLOSE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>';
  var ICON_REFRESH = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M20 11a8 8 0 1 0-2.3 6.4"/><path d="M20 4v7h-7"/></svg>';
  var ICON_SEND = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M4 12h13M11 5.5 17.5 12 11 18.5"/></svg>';

  function build() {
    root = document.createElement('div');
    root.className = 'slc-root';
    root.setAttribute('data-slc', 'chatbot');
    root.innerHTML =
      '<button class="slc-launcher" id="slcLauncher" type="button" aria-expanded="false" aria-controls="slcPanel">' +
        '<span class="slc-launch-avatar" aria-hidden="true">SL</span>' +
        '<span class="slc-launch-text"><b>AI 이석연에게 묻기</b>' +
        '<span><i class="slc-live-dot" aria-hidden="true"></i>디지털 명함 · 포트폴리오 Q&amp;A</span></span>' +
      '</button>' +
      '<div class="slc-panel" id="slcPanel" role="dialog" aria-modal="false" aria-label="미니 AI 이석연 챗봇" aria-hidden="true">' +
        '<header class="slc-head">' +
          '<span class="slc-head-avatar" aria-hidden="true">SL</span>' +
          '<span class="slc-head-txt"><b>미니 AI 이석연</b><span>이석연 팀장 디지털 명함 · 캠페인 43건 · 영상 18편</span></span>' +
          '<span class="slc-head-actions">' +
            '<button class="slc-icon-btn" id="slcReset" type="button" aria-label="대화 초기화" title="대화 초기화">' + ICON_REFRESH + '</button>' +
            '<button class="slc-icon-btn" id="slcClose" type="button" aria-label="챗봇 닫기" title="닫기">' + ICON_CLOSE + '</button>' +
          '</span>' +
        '</header>' +
        '<div class="slc-body" id="slcBody">' +
          '<div class="slc-suggests" id="slcSuggests"><span class="slc-suggests-label">추천 질문</span>' +
            '<div class="slc-chips" id="slcChips"></div></div>' +
          '<div class="slc-log" id="slcLog" role="log" aria-live="polite" aria-label="대화 내용"></div>' +
        '</div>' +
        '<div class="slc-foot">' +
          '<form class="slc-form" id="slcForm" autocomplete="off">' +
            '<input class="slc-input" id="slcInput" type="text" maxlength="120" placeholder="브랜드나 궁금한 점을 물어보세요" aria-label="질문 입력" enterkeyhint="send">' +
            '<button class="slc-send" id="slcSend" type="submit" aria-label="보내기" disabled>' + ICON_SEND + '</button>' +
          '</form>' +
          '<p class="slc-note">외부 AI 연결 없이 포트폴리오 데이터로만 답합니다.</p>' +
        '</div>' +
      '</div>';
    document.body.appendChild(root);

    launcher = root.querySelector('#slcLauncher');
    panel = root.querySelector('#slcPanel');
    body = root.querySelector('#slcBody');
    log = root.querySelector('#slcLog');
    form = root.querySelector('#slcForm');
    input = root.querySelector('#slcInput');
    sendBtn = root.querySelector('#slcSend');
    suggestBlock = root.querySelector('#slcSuggests');

    renderChips(SUGGEST_DEFAULT, root.querySelector('#slcChips'));

    launcher.addEventListener('click', open);
    root.querySelector('#slcClose').addEventListener('click', close);
    root.querySelector('#slcReset').addEventListener('click', reset);
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      send(input.value);
    });
    input.addEventListener('input', function () {
      sendBtn.disabled = !input.value.trim();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && opened) close();
    });

    /* 같은 페이지 안의 카드 링크는 딥링크를 다시 태우기 위해 새로고침 */
    log.addEventListener('click', function (e) {
      var a = e.target.closest ? e.target.closest('a.slc-card, a.slc-more') : null;
      if (!a || !a.getAttribute('href')) return;
      var url;
      try { url = new URL(a.getAttribute('href'), location.href); } catch (err) { return; }
      if (url.protocol === 'mailto:' || a.target === '_blank') return;
      if (url.pathname === location.pathname && url.hash) {
        e.preventDefault();
        var id = decodeURIComponent(url.hash.slice(1));
        var target = id && document.getElementById(id);
        if (target && !document.getElementById('modal')) {
          close();
          target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        } else {
          location.hash = url.hash;
          location.reload();
        }
      } else if (url.pathname === location.pathname && !url.hash) {
        e.preventDefault();
        close();
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    });
  }

  function renderChips(list, host) {
    host.innerHTML = list.map(function (q) {
      return '<button class="slc-chip" type="button" data-q="' + esc(q) + '">' + esc(q) + '</button>';
    }).join('');
    host.addEventListener('click', function (e) {
      var btn = e.target.closest ? e.target.closest('.slc-chip') : null;
      if (!btn) return;
      send(btn.getAttribute('data-q'));
    });
  }

  function open() {
    if (!opened) {
      opened = true;
      panel.classList.add('slc-open');
      panel.setAttribute('aria-hidden', 'false');
      launcher.setAttribute('aria-expanded', 'true');
      if (!greeted) { greeted = true; greet(); }
      loadData();
    }
    setTimeout(function () { input.focus({ preventScroll: true }); }, 240);
  }
  function close() {
    opened = false;
    panel.classList.remove('slc-open');
    panel.setAttribute('aria-hidden', 'true');
    launcher.setAttribute('aria-expanded', 'false');
    launcher.focus({ preventScroll: true });
  }
  function reset() {
    log.innerHTML = '';
    suggestBlock.style.display = '';
    greeted = true;
    greet();
    input.focus({ preventScroll: true });
  }
  function greet() {
    pushBot(
      '<p>안녕하세요. 이석연 팀장의 디지털 명함 <strong>‘미니 AI 이석연’</strong>입니다.</p>' +
      '<p>캠페인 43건과 영상 18편, 대표 성과와 연락처를 이 창에서 바로 찾아 드립니다. 아래 추천 질문으로 시작해 보세요.</p>',
      null
    );
  }

  function scrollDown() {
    body.scrollTop = body.scrollHeight;
  }

  function pushUser(text) {
    var wrap = document.createElement('div');
    wrap.className = 'slc-msg slc-user';
    var b = document.createElement('div');
    b.className = 'slc-bubble';
    b.textContent = text;
    wrap.appendChild(b);
    log.appendChild(wrap);
    scrollDown();
  }

  function pushBot(html, follow) {
    var wrap = document.createElement('div');
    wrap.className = 'slc-msg slc-bot';
    var b = document.createElement('div');
    b.className = 'slc-bubble';
    b.innerHTML = html;
    wrap.appendChild(b);

    if (follow && follow.length) {
      var f = document.createElement('div');
      f.className = 'slc-follow';
      f.innerHTML = follow.slice(0, 3).map(function (q) {
        return '<button class="slc-chip" type="button" data-q="' + esc(q) + '">' + esc(q) + '</button>';
      }).join('');
      f.addEventListener('click', function (e) {
        var btn = e.target.closest ? e.target.closest('.slc-chip') : null;
        if (!btn) return;
        send(btn.getAttribute('data-q'));
      });
      wrap.appendChild(f);
    }
    log.appendChild(wrap);
    scrollDown();
    return wrap;
  }

  function typing() {
    var wrap = document.createElement('div');
    wrap.className = 'slc-msg slc-bot slc-typing-wrap';
    wrap.innerHTML = '<div class="slc-bubble slc-typing" aria-label="답변을 준비하는 중"><i></i><i></i><i></i></div>';
    log.appendChild(wrap);
    scrollDown();
    return wrap;
  }

  function send(text) {
    var q = String(text == null ? '' : text).trim();
    if (!q) return;
    if (q.length > 120) q = q.slice(0, 120);
    pushUser(q);
    input.value = '';
    sendBtn.disabled = true;
    if (greeted) suggestBlock.style.display = 'none';

    var t = typing();
    var minDelay = 320 + Math.min(620, q.length * 16);

    ensureData().then(function () {
      var started = Date.now();
      var res;
      try {
        res = respond(q);
      } catch (err) {
        res = { html: '<p>답변을 준비하다 문제가 생겼습니다. 브랜드명이나 “대표 성과”처럼 다시 한 번 물어봐 주세요.</p>', follow: SUGGEST_DEFAULT.slice(0, 3) };
      }
      var wait = Math.max(0, minDelay - (Date.now() - started));
      setTimeout(function () {
        if (t && t.parentNode) t.parentNode.removeChild(t);
        pushBot(res.html + (res.cards || ''), res.follow);
        input.focus({ preventScroll: true });
      }, wait);
    });
  }

  function ensureData() {
    if (DATA.loaded) return Promise.resolve(DATA);
    return loadData();
  }

  /* ---------------- boot ---------------- */
  function boot() {
    if (document.body) build();
    else document.addEventListener('DOMContentLoaded', build, { once: true });
    if ('requestIdleCallback' in window) {
      requestIdleCallback(function () { loadData(); }, { timeout: 3500 });
    } else {
      setTimeout(loadData, 2200);
    }
  }
  boot();
})();

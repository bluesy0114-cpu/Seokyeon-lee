/* Footer visitor counter (Firebase Realtime Database) — index · projects · films 공통.
   실제 기록·표시 로직은 11-21 라이브 검증본을 그대로 옮긴 것입니다. */
  /* ---------- 방문자 카운터 (Firebase Realtime Database) ----------
     기록: /portfolio_stats/daily/{KST날짜}/hits/{sessionId} = {ts, ref, mobile}
           /portfolio_stats/visitors/{visitorId}       = {firstTs, lastTs}
           /portfolio_stats/summary                    = {hits, visitors, todayDate, todayHits}
     동시 접속 경합은 ETag 조건부 쓰기(if-match)로 재시도해 숫자 유실을 막습니다. */
  (function () {
    var DB = 'https://office-run-live-default-rtdb.asia-southeast1.firebasedatabase.app/portfolio_stats';
    var badge = document.getElementById('vstat');
    var elToday = document.getElementById('vstatToday');
    var elTotal = document.getElementById('vstatTotal');
    if (!badge || !elToday || !elTotal || !window.fetch) return;

    var ua = navigator.userAgent || '';
    var isMobile = /Mobi|Android|iPhone|iPad|iPod/i.test(ua);
    /* 라이브 검증용: ?pfstats=force 는 봇 필터와 같은 탭 중복 방지를 해제해 1건을 새로 기록합니다. */
    var force = /[?&]pfstats=force\b/.test(location.search);
    var isBot = /bot|crawl|spider|headless|slurp|bingpreview|lighthouse|pagespeed|gtmetrix|phantomjs|^curl\/|wget|python-requests/i.test(ua);
    if (navigator.webdriver === true && !force) isBot = true;
    if (force) isBot = false;

    function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
    function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
    function ssGet(k) { try { return sessionStorage.getItem(k); } catch (e) { return null; } }
    function ssSet(k, v) { try { sessionStorage.setItem(k, v); } catch (e) {} }
    function rid(p) { return p + Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
    function kstDate() { return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10); }
    function fmt(n) { return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
    function refHost() {
      try {
        if (!document.referrer) return 'direct';
        var h = new URL(document.referrer).hostname.replace(/^www\./, '');
        return h === location.hostname ? 'internal' : h;
      } catch (e) { return 'direct'; }
    }

    var date = kstDate();
    var sid = ssGet('pf_sid');
    var newSession = !sid;
    if (!sid) { sid = rid('s'); ssSet('pf_sid', sid); }
    var vid = lsGet('pf_vid');
    var firstVisit = !vid;
    if (!vid) { vid = rid('v'); lsSet('pf_vid', vid); }
    if (force) { sid = rid('s'); ssSet('pf_sid', sid); newSession = true; } /* 검증 시 매 로드마다 1건 기록 */

    function readSummary() {
      return fetch(DB + '/summary.json', { cache: 'no-store' })
        .then(function (r) {
          if (r.status !== 200) return null;
          return r.json().then(function (j) { return typeof j === 'object' ? j : null; });
        })
        .catch(function () { return null; });
    }

    function show(s) {
      if (!s) return;
      var total = Number(s.hits) || 0;
      if (!total) return;
      elToday.textContent = fmt(s.todayDate === kstDate() ? (Number(s.todayHits) || 0) : 0);
      elTotal.textContent = fmt(total);
      badge.hidden = false;
    }

    function bumpSummary(cur) {
      var n = cur && typeof cur === 'object' ? cur : {};
      var sameDay = n.todayDate === date;
      return {
        hits: (Number(n.hits) || 0) + 1,
        visitors: (Number(n.visitors) || 0) + (firstVisit ? 1 : 0),
        todayDate: date,
        todayHits: (sameDay ? (Number(n.todayHits) || 0) : 0) + 1,
        updated: Date.now()
      };
    }

    /* ETag 조건부 쓰기로 요약 카운터를 원자적으로 증가 (412면 다시 읽고 재시도) */
    function txSummary(n) {
      return fetch(DB + '/summary.json', { cache: 'no-store', headers: { 'X-Firebase-ETag': 'true' } })
        .then(function (r) {
          if (r.status !== 200) throw new Error('summary read ' + r.status);
          var etag = r.headers.get('ETag');
          return r.json().then(function (cur) { return { cur: cur, etag: etag }; });
        })
        .then(function (s) {
          var next = bumpSummary(s.cur);
          return fetch(DB + '/summary.json', {
            method: 'PUT',
            cache: 'no-store',
            keepalive: true,
            headers: { 'Content-Type': 'application/json', 'X-Firebase-ETag': 'true', 'if-match': s.etag || 'null_etag' },
            body: JSON.stringify(next)
          }).then(function (r) {
            if (r.status === 412 && n < 5) {
              return new Promise(function (ok) { setTimeout(ok, 120 + Math.random() * 200); }).then(function () { return txSummary(n + 1); });
            }
            if (!r.ok) throw new Error('summary write ' + r.status);
            return next;
          });
        });
    }

    if (!newSession) { showLater(readSummary()); return; }
    if (isBot) return;

    var ts = Date.now();
    var hit = fetch(DB + '/daily/' + date + '/hits/' + sid + '.json', {
      method: 'PUT', cache: 'no-store', keepalive: true,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ts: ts, ref: refHost(), mobile: isMobile })
    }).catch(function () {});

    var visitorBody = firstVisit ? { firstTs: ts, lastTs: ts } : { lastTs: ts };
    var visitor = fetch(DB + '/visitors/' + vid + '.json', {
      method: 'PATCH', cache: 'no-store', keepalive: true,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(visitorBody)
    }).catch(function () {});

    function showLater(p) {
      Promise.resolve(p).then(function (s) {
        if (s && Number(s.hits)) { setTimeout(function () { show(s); }, 400); }
        else readSummary().then(function (fresh) { setTimeout(function () { show(fresh); }, 400); });
      }).catch(function () {});
    }

    Promise.all([hit, visitor]).then(function () { return txSummary(0); }, function () { return null; })
      .then(showLater)
      .catch(function () { readSummary().then(showLater).catch(function () {}); });
  })();
